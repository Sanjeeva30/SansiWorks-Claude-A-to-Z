import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Mirrors accountableCandidates() in lib/actions.ts — duplicated rather than
// imported because that module is "use client" and can't be called from a
// server route. Same rule: A is same department as R, or anyone who outranks R.
function accountableCandidatesFor<T extends { id: string; department_id: string | null; level_id: string; is_super?: boolean | null }>(
  profiles: T[],
  levels: { id: string; sort: number }[],
  deptMembers: { department_id: string | null; profile_id: string }[],
  assigneeId: string
): T[] {
  const sortOf = (pid: string) => {
    const p = profiles.find((x) => x.id === pid);
    return levels.find((l) => l.id === p?.level_id)?.sort ?? 999;
  };
  const r = profiles.find((p) => p.id === assigneeId);
  const rRank = sortOf(assigneeId);
  const rDeptIds = new Set(profiles.filter((p) => p.department_id === r?.department_id).map((p) => p.id));
  for (const m of deptMembers) if (m.department_id === r?.department_id && m.profile_id) rDeptIds.add(m.profile_id);
  return profiles.filter((p) => p.id !== assigneeId && (rDeptIds.has(p.id) || sortOf(p.id) < rRank || p.is_super));
}

// Sansi AI assistant — Gemini free tier.
// Grounding: pulls only what's relevant to the asker and the question (their
// own RACI work, named people/org-units resolved through the real org engine,
// pending approvals) instead of a blind company-wide dump.
// Actions: Gemini function-calling can propose creating a task — Sansi always
// drafts, the person in chat always confirms before anything is written.
export async function POST(req: NextRequest) {
  const { query, history } = await req.json();
  if (!query || typeof query !== "string") {
    return NextResponse.json({ reply: "Ask me something about your workspace." });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ reply: "Please sign in first." }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({
      reply: `Got it — I'll look into "${query}". (Sansi's AI brain isn't connected yet: add GEMINI_API_KEY to enable real answers.)`,
    });
  }

  const [meRes, profilesRes, orgUnitsRes, assignmentsRes, unitHeadsRes, levelsRes, deptMembersRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).single(),
    supabase.from("profiles").select("id,name,department_id,level_id,is_super"),
    supabase.from("org_units").select("id,name,type,parent_id"),
    supabase.from("assignments").select("profile_id,function_name,scope_unit_id,reports_to_unit_id"),
    supabase.from("org_unit_heads").select("unit_id,profile_id"),
    supabase.from("levels").select("id,name,sort"),
    supabase.from("org_unit_members").select("department_id,profile_id"),
  ]);
  const me = meRes.data;
  const profiles = profilesRes.data || [];
  const orgUnits = orgUnitsRes.data || [];
  const assignments = assignmentsRes.data || [];
  const unitHeads = unitHeadsRes.data || [];
  const levels = levelsRes.data || [];
  const deptMembers = deptMembersRes.data || [];
  const nameOf = new Map(profiles.map((p) => [p.id, p.name]));
  const unitNameOf = new Map(orgUnits.map((u) => [u.id, u.name]));

  // ---- Grounding: figure out who/what the question is actually about ----
  // Strip legal-entity prefixes ("PT.", "PT ") so "IGP Sleman" matches
  // "PT. IGP Sleman" — people don't type the full registered name.
  const stripEntityPrefix = (s: string) => s.replace(/^pt\.?\s+/i, "").trim();
  const q = query.toLowerCase();
  const mentionedPeople = profiles.filter((p) => q.includes(p.name.toLowerCase().split(" ")[0]));
  const mentionedUnits = orgUnits.filter((u) => {
    const short = stripEntityPrefix(u.name).toLowerCase();
    return short.length > 3 && q.includes(short);
  });

  const [myTasksRes, mentionedTasksRes, approvalsRes, remindersRes] = await Promise.all([
    supabase.from("tasks").select("id,name,status,priority,due,assignee_id,accountable_id")
      .or(`assignee_id.eq.${auth.user.id},accountable_id.eq.${auth.user.id}`).neq("status", "Done").order("due").limit(25),
    mentionedPeople.length
      ? supabase.from("tasks").select("id,name,status,priority,due,assignee_id")
          .in("assignee_id", mentionedPeople.map((p) => p.id)).neq("status", "Done").order("due").limit(20)
      : Promise.resolve({ data: [] }),
    supabase.from("approvals").select("task_id,requester_id,kind,requested_due,status").eq("status", "pending").limit(10),
    supabase.from("reminders").select("title,remind_at").eq("profile_id", auth.user.id).eq("status", "pending").order("remind_at").limit(5),
  ]);

  const fmtTask = (t: { name: string; status: string; priority: string; due: string | null; assignee_id?: string | null }) =>
    `- ${t.name} [${t.status}, ${t.priority}${t.due ? `, due ${t.due}` : ""}]${t.assignee_id ? ` — ${nameOf.get(t.assignee_id) || "unassigned"}` : ""}`;

  const sections: string[] = [];
  sections.push(`Your (${me?.name}) open work:\n${(myTasksRes.data || []).map(fmtTask).join("\n") || "(nothing open)"}`);

  if (mentionedPeople.length) {
    for (const p of mentionedPeople) {
      const theirAssignments = assignments.filter((a) => a.profile_id === p.id);
      const roleLines = theirAssignments.map((a) => `${a.function_name}${a.scope_unit_id ? ` for ${unitNameOf.get(a.scope_unit_id)}` : ""}`);
      const theirTasks = (mentionedTasksRes.data || []).filter((t) => t.assignee_id === p.id);
      sections.push(`${p.name}${roleLines.length ? ` — ${roleLines.join("; ")}` : ""}:\n${theirTasks.map(fmtTask).join("\n") || "(no open tasks found)"}`);
    }
  }

  if (mentionedUnits.length) {
    // Walk up the unit's parent chain — a plant's finance contact is usually
    // an assignment scoped to its cluster, not the plant itself, so a plant
    // lookup must also surface whatever its cluster/division resolves to.
    const unitById = new Map(orgUnits.map((u) => [u.id, u]));
    const ancestorsOf = (unitId: string): typeof orgUnits => {
      const chain: typeof orgUnits = [];
      let cur = unitById.get(unitId);
      while (cur) {
        chain.push(cur);
        cur = cur.parent_id ? unitById.get(cur.parent_id) : undefined;
      }
      return chain;
    };
    for (const u of mentionedUnits) {
      const chain = ancestorsOf(u.id);
      const chainIds = new Set(chain.map((c) => c.id));
      const heads = unitHeads.filter((h) => chainIds.has(h.unit_id)).map((h) => nameOf.get(h.profile_id)).filter(Boolean);
      const functionaries = assignments.filter((a) => a.scope_unit_id && chainIds.has(a.scope_unit_id))
        .map((a) => `${nameOf.get(a.profile_id)} (${a.function_name}${a.scope_unit_id !== u.id ? ` — via ${unitNameOf.get(a.scope_unit_id!)}` : ""})`);
      sections.push(`${u.name} (${u.type}${chain.length > 1 ? `, part of ${chain.slice(1).map((c) => c.name).join(" → ")}` : ""})${heads.length ? ` — head(s): ${heads.join(", ")}` : ""}${functionaries.length ? `\nFunctional contacts: ${functionaries.join("; ")}` : ""}`);
    }
  }

  const pendingForMe = (approvalsRes.data || []).filter((a) => a.requester_id === auth.user.id);
  if (pendingForMe.length) sections.push(`Your pending approval requests:\n${pendingForMe.map((a) => `- ${a.kind} → ${a.requested_due}, still pending`).join("\n")}`);

  const myReminders = remindersRes.data || [];
  if (myReminders.length) sections.push(`Your upcoming reminders:\n${myReminders.map((r) => `- ${r.title} at ${r.remind_at}`).join("\n")}`);

  const context = sections.join("\n\n");
  const priorTurns: { role: string; text: string }[] = Array.isArray(history) ? history.slice(-6) : [];

  const systemPrompt = `You are Sansi, the AI assistant inside SansiWorks — Sansico Group's internal work-management app (an Indonesian packaging company). The user is ${me?.name || "a team member"}. Today is ${new Date().toISOString().slice(0, 10)}.

Relevant workspace context for this question:
${context}

Answer concisely (2-5 sentences, plain text, no markdown headers), using only the context above and the conversation so far. If you don't have enough information, say so plainly rather than guessing.

If — and only if — the user is clearly asking you to CREATE A NEW TASK, call the propose_create_task tool instead of replying with text. Never call it for anything else (don't call it to check on, edit, or discuss existing tasks). If the user names who's accountable for the task, pass accountable_name — otherwise omit it and the person will be asked to pick one before the task can be created (Accountable is never auto-filled).`;

  const tools = [{
    functionDeclarations: [{
      name: "propose_create_task",
      description: "Draft a new task for the user to review and confirm — never creates it directly.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short task title" },
          assignee_name: { type: "string", description: "Full or first name of the person responsible (R). Defaults to the asker if unspecified." },
          accountable_name: { type: "string", description: "Full or first name of who is Accountable (A), only if explicitly named — never guess this." },
          due: { type: "string", description: "Due date as YYYY-MM-DD if mentioned, otherwise omit" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
        },
        required: ["name"],
      },
    }],
  }];

  const contents = [
    ...priorTurns.map((t) => ({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.text }] })),
    { role: "user", parts: [{ text: query }] },
  ];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools,
        }),
      }
    );
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const fnCall = parts.find((p: { functionCall?: unknown }) => p.functionCall)?.functionCall as
      | { name: string; args: { name: string; assignee_name?: string; accountable_name?: string; due?: string; priority?: string } }
      | undefined;

    if (fnCall?.name === "propose_create_task") {
      const args = fnCall.args;
      const findByName = (n?: string) => {
        const nl = n?.toLowerCase();
        return nl ? profiles.find((p) => p.name.toLowerCase().includes(nl) || p.name.toLowerCase().split(" ")[0] === nl) : undefined;
      };
      const resolvedAssignee = findByName(args.assignee_name) || me;
      // A true personal task (R is the asker themself) needs no Accountable —
      // same rule as everywhere else: you're R and A both. Only once Sansi
      // assigns someone else does Accountable become required, and it's never
      // auto-filled — if Gemini didn't extract an explicit name, it stays
      // null and the person must pick one before the task can be created.
      const isPersonal = !resolvedAssignee || resolvedAssignee.id === me?.id;
      const candidates = !isPersonal && resolvedAssignee
        ? accountableCandidatesFor(profiles, levels, deptMembers, resolvedAssignee.id)
        : [];
      const guessedAccountable = findByName(args.accountable_name);
      const resolvedAccountable = guessedAccountable && candidates.some((c) => c.id === guessedAccountable.id) ? guessedAccountable : undefined;

      return NextResponse.json({
        reply: `I'll draft this task — check the details below and confirm.`,
        action: {
          type: "create_task",
          args: {
            name: args.name,
            assignee_id: resolvedAssignee?.id || me?.id,
            assignee_name: resolvedAssignee?.name || me?.name,
            personal: isPersonal,
            accountable_id: resolvedAccountable?.id || null,
            accountable_name: resolvedAccountable?.name || null,
            accountable_candidates: isPersonal ? null : candidates.map((c) => ({ id: c.id, name: c.name })),
            due: args.due || null,
            priority: args.priority || "Medium",
          },
        },
      });
    }

    const textPart = parts.find((p: { text?: string }) => p.text)?.text?.trim();
    return NextResponse.json({ reply: textPart || "I couldn't come up with an answer just now — try rephrasing?" });
  } catch {
    return NextResponse.json({ reply: "Sansi hit a network snag — try again in a moment." });
  }
}
