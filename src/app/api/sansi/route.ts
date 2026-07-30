import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* Per-user rate limit on the Gemini-backed endpoint. Without it one person
   holding a key down — or a buggy retry loop — can burn the whole project's AI
   quota and budget in a few seconds. Now shared with summarize-sop (also
   Gemini-backed) and notify (sends email), which had no brake at all. */
import { allowRequest, AI_LIMIT } from "@/lib/server/rate-limit";

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

  if (!allowRequest(`sansi:${auth.user.id}`, AI_LIMIT)) {
    return NextResponse.json(
      { reply: "You're asking faster than I can think — give me a few seconds and try again." },
      { status: 429 }
    );
  }

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
    supabase.from("levels").select("id,name,sort,exec_visibility"),
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

  /* Company-scope questions ("what is at risk this week?", "how are we doing?")
     used to be answered from the asker's own task list alone, because that was the
     only task data in the grounding context. The result was Sansi naming one
     personal item while the Overview page showed three company criticals — the
     same question, two different answers. Company-wide rows are fetched for anyone
     whose level carries exec_visibility (or a super admin), matching how the
     Overview and Reports screens already gate company data. */
  const myLevel = levels.find((l) => l.id === me?.level_id);
  const seesCompany = !!me?.is_super || !!myLevel?.exec_visibility;

  const [myTasksRes, mentionedTasksRes, approvalsRes, remindersRes, companyRes] = await Promise.all([
    supabase.from("tasks").select("id,name,status,priority,due,assignee_id,accountable_id")
      .or(`assignee_id.eq.${auth.user.id},accountable_id.eq.${auth.user.id}`).neq("status", "Done").order("due").limit(25),
    mentionedPeople.length
      ? supabase.from("tasks").select("id,name,status,priority,due,assignee_id")
          .in("assignee_id", mentionedPeople.map((p) => p.id)).neq("status", "Done").order("due").limit(20)
      : Promise.resolve({ data: [] }),
    supabase.from("approvals").select("task_id,requester_id,kind,requested_due,status").eq("status", "pending").limit(10),
    supabase.from("reminders").select("title,remind_at").eq("profile_id", auth.user.id).eq("status", "pending").order("remind_at").limit(5),
    seesCompany
      ? supabase.from("tasks").select("id,name,status,priority,due,assignee_id").neq("status", "Done").order("due").limit(400)
      : Promise.resolve({ data: [] }),
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

  /* Info-finder: "where's the SOP for X", "who owns the vendor onboarding
     form" — questions about a DOCUMENT or FORM rather than a task, person or
     org unit, which nothing above searches. Uses the same significant-word
     extraction as the person/unit matching above, ilike-searched against
     title/excerpt/category. The query runs through the user's own session
     (createClient() carries their cookies), so RLS — not this route — is what
     keeps a restricted doc from surfacing here; this never needs its own
     visibility check. */
  const stopwords = new Set(["where", "what", "when", "does", "have", "about", "with", "this", "that", "form", "forms", "sansi", "document", "documents"]);
  const searchTerms = Array.from(new Set(
    query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !stopwords.has(w))
  )).slice(0, 6);

  if (searchTerms.length) {
    const orFilter = searchTerms.map((w) => `title.ilike.%${w}%,excerpt.ilike.%${w}%,category.ilike.%${w}%`).join(",");
    const [docsRes, formsRes] = await Promise.all([
      supabase.from("docs").select("title,type,category,status,is_sop,review_date").or(orFilter).limit(8),
      supabase.from("forms").select("title,active,default_assignee_id").or(searchTerms.map((w) => `title.ilike.%${w}%`).join(",")).limit(5),
    ]);
    const foundDocs = docsRes.data || [];
    const foundForms = formsRes.data || [];
    if (foundDocs.length) {
      sections.push(
        `Docs & SOPs matching this question (only ones ${me?.name || "the user"} can actually open):\n` +
        foundDocs.map((d) => `- "${d.title}" [${d.is_sop ? "SOP" : d.type}${d.category ? `, ${d.category}` : ""}, ${d.status}]`).join("\n")
      );
    }
    if (foundForms.length) {
      sections.push(
        `Forms matching this question:\n` +
        foundForms.map((f) => `- "${f.title}" [${f.active ? "live" : "paused"}]${f.default_assignee_id ? ` — notifies ${nameOf.get(f.default_assignee_id) || "its owner"}` : ""}`).join("\n")
      );
    }
  }

  const pendingForMe = (approvalsRes.data || []).filter((a) => a.requester_id === auth.user.id);
  if (pendingForMe.length) sections.push(`Your pending approval requests:\n${pendingForMe.map((a) => `- ${a.kind} → ${a.requested_due}, still pending`).join("\n")}`);

  const myReminders = remindersRes.data || [];
  if (myReminders.length) sections.push(`Your upcoming reminders:\n${myReminders.map((r) => `- ${r.title} at ${r.remind_at}`).join("\n")}`);

  /* Company-wide risk, using the same rule as the Overview's "Predicted late":
     overdue, or marked stuck, or due within 4 days while the assignee is loaded.
     Kept in sync deliberately — Sansi and the dashboard answering the same
     question differently is worse than either being wrong alone. */
  const companyTasks = companyRes.data || [];
  if (seesCompany && companyTasks.length) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const in4 = new Date(); in4.setDate(in4.getDate() + 4);
    const soonIso = in4.toISOString().slice(0, 10);
    const loadOf = new Map<string, number>();
    for (const t of companyTasks) if (t.assignee_id) loadOf.set(t.assignee_id, (loadOf.get(t.assignee_id) || 0) + 1);

    const risky = companyTasks
      .filter((t) => t.due || t.status === "Stuck")
      .map((t) => {
        const load = t.assignee_id ? loadOf.get(t.assignee_id) || 0 : 0;
        if (t.status === "Stuck") return { t, why: "marked stuck", rank: 0 };
        if (t.due && t.due < todayIso) return { t, why: `overdue since ${t.due}`, rank: 1 };
        if (t.due && t.due <= soonIso && load >= 5)
          return { t, why: `due ${t.due}, ${nameOf.get(t.assignee_id!) || "assignee"} carrying ${load} open`, rank: 2 };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a!.rank - b!.rank || (a!.t.due || "").localeCompare(b!.t.due || ""))
      .slice(0, 12);

    const criticals = companyTasks.filter((t) => t.priority === "Critical");
    sections.push(
      `COMPANY-WIDE (you have company visibility — use this, not just the personal list above, when the question is about the company/team/"we"):
` +
      `Open company-wide: ${companyTasks.length}. Critical priority: ${criticals.length}.
` +
      `At risk right now:
${risky.map((r) => `- ${r!.t.name} [${r!.t.priority}] — ${r!.why}${r!.t.assignee_id ? ` (${nameOf.get(r!.t.assignee_id) || "unassigned"})` : ""}`).join("\n") || "(nothing at risk)"}`
    );
  } else if (!seesCompany) {
    sections.push(
      `SCOPE NOTE: ${me?.name || "this user"} does not have company-wide visibility, so only their own work and anyone they explicitly named is available. If asked about company-wide status, say plainly that you can only see their own work and suggest they ask a department head.`
    );
  }

  const context = sections.join("\n\n");
  const priorTurns: { role: string; text: string }[] = Array.isArray(history) ? history.slice(-6) : [];

  const systemPrompt = `You are Sansi, the AI assistant inside SansiWorks — Sansico Group's internal work-management app (an Indonesian packaging company). The user is ${me?.name || "a team member"}. Today is ${new Date().toISOString().slice(0, 10)}.

Relevant workspace context for this question:
${context}

Answer concisely (2-5 sentences, plain text, no markdown headers), using only the context above and the conversation so far. If you don't have enough information, say so plainly rather than guessing.

Scope matters. If the question is about the company, the team, "we", or is otherwise not specifically about the user's own tasks, answer from the COMPANY-WIDE section when one is present — do not answer a company question from the user's personal task list. Name the scope you are answering in ("across the company", "on your own list") so the answer is never ambiguous. If both are relevant, lead with the company picture and then note the user's own exposure.

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
