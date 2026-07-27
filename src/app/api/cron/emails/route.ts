import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { sendEmail, wrapEmailHtml } from "@/lib/server/email";
import { atRiskTasks, workloadPct } from "@/lib/logic";
import type { Task, Profile } from "@/lib/types";
import { timingSafeEqual } from "node:crypto";

/* Comment bodies are user-authored text going into an HTML email — escape them
   so a task title or comment containing markup can't break or inject into it. */
function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Constant-time string compare so a caller can't discover CRON_SECRET one
   character at a time from response-timing differences. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// One batched Gemini call covering everyone at risk today, not one call per
// person — keeps free-tier quota use flat regardless of headcount. Failure
// (missing key, quota, network) degrades silently to the existing plain digest.
async function proactiveFlags(people: { profile: Profile; reasons: string[]; pct: number }[]): Promise<Map<string, string>> {
  const key = process.env.GEMINI_API_KEY;
  const flags = new Map<string, string>();
  if (!key || !people.length) return flags;
  const lines = people.map((p) => `${p.profile.name}: workload ${p.pct}% of capacity; ${p.reasons.join("; ")}`).join("\n");
  const prompt = `You are Sansi, the AI assistant inside SansiWorks (Sansico Group). For each person below, write exactly one short, plain-English flag line (under 20 words, no markdown) describing why they're at risk today. Reply with one line per person, formatted exactly as "Name: flag text" — nothing else.\n\n${lines}`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
    );
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    for (const line of text.split("\n")) {
      const m = line.match(/^([^:]+):\s*(.+)$/);
      if (m) flags.set(m[1].trim(), m[2].trim());
    }
  } catch {
    // fall through to no flags — digest still sends with the plain summary
  }
  return flags;
}

// One cron endpoint, dispatched by kind: digest (daily), plan (Mon 08:00 WIB), wrap (Fri 15:00 WIB).
// Guarded by CRON_SECRET. Requires SUPABASE_SERVICE_ROLE_KEY in production.
export async function GET(req: NextRequest) {
  // Header only — a secret in the query string ends up in server logs, browser
  // history and referrer headers. Vercel Cron sends `Authorization: Bearer
  // $CRON_SECRET` on its own, so nothing is lost by dropping ?secret=.
  const expected = process.env.CRON_SECRET;
  const presented = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !presented || !timingSafeEqualStr(presented, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  /* dryRun builds every email exactly as a real run would but sends nothing and
     returns a per-recipient summary. Needed to verify digest changes without
     mailing the whole company, and useful for checking who a run would reach
     before scheduling it. */
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  let kind = req.nextUrl.searchParams.get("kind") || "digest";
  // Vercel Hobby allows 2 crons: "morning" = daily digest, plus the Monday plan on Mondays.
  const isMonday = new Date().getUTCDay() === 1;
  const kinds = kind === "morning" ? (isMonday ? ["digest", "plan"] : ["digest"]) : [kind];

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: profiles }, { data: tasks }, { data: prefs }, { data: convo }] = await Promise.all([
    supabase.from("profiles").select("id,name,email,digest_time,capacity_points,level_id"),
    supabase.from("tasks").select("id,name,status,priority,due,list_id,assignee_id,effort,completed_at").neq("status", "Done"),
    supabase.from("notification_prefs").select("profile_id,category,channel"),
    // Unread @mentions and comment replies. Without this the digest was built
    // purely from tasks, so being mentioned reached you in-app and never by
    // email — if you didn't open the app that day, you simply never found out.
    // reason casing is inconsistent in the data ("mention" and "Mention"), so
    // match case-insensitively rather than trusting one spelling.
    supabase.from("notifications").select("profile_id,task_id,body,reason,read,created_at").eq("read", false),
  ]);
  if (!profiles || !tasks) return NextResponse.json({ error: "no data — is SUPABASE_SERVICE_ROLE_KEY set?" }, { status: 500 });

  const tasksOf = (pid: string) => tasks.filter((t) => t.assignee_id === pid);

  /* Email is opt-OUT. The previous rule was `.every(channel is off/inapp)`, and
     [].every() is vacuously true — so anyone who had never opened notification
     settings was silently treated as having disabled everything. On this data
     that was 11 of 17 people receiving no digest at all, which nobody chose.
     Now: suppressed only if the person HAS preferences and every one of them
     is off or in-app. */
  const prefsOf = (pid: string) => (prefs || []).filter((p) => p.profile_id === pid);
  const digestOff = (pid: string) => {
    const mine = prefsOf(pid);
    return mine.length > 0 && mine.every((p) => p.channel === "off" || p.channel === "inapp");
  };

  const isConversation = (reason: string | null) => {
    const r = (reason || "").toLowerCase();
    return r === "mention" || r === "comment";
  };
  const mentionsOf = (pid: string) =>
    (convo || []).filter((n) => n.profile_id === pid && isConversation(n.reason));

  // Proactive risk flags — one batched Gemini call for everyone at risk, only for the daily digest.
  const atRisk = kinds.includes("digest") ? atRiskTasks(tasks as unknown as Task[]) : [];
  const atRiskProfileIds = new Set(atRisk.map((r) => r.task.assignee_id).filter(Boolean));
  const riskInput = (profiles as unknown as Profile[])
    .filter((p) => atRiskProfileIds.has(p.id))
    .map((profile) => ({
      profile,
      reasons: atRisk.filter((r) => r.task.assignee_id === profile.id).slice(0, 3).map((r) => `${r.task.name} (${r.reason})`),
      pct: workloadPct(tasks as unknown as Task[], profile),
    }));
  const flagOf = await proactiveFlags(riskInput);

  let sent = 0;
  const preview: { to: string; kind: string; subject: string; mentions: number; overdue: number; dueToday: number; html?: string }[] = [];
  for (kind of kinds)
  for (const person of profiles) {
    if (digestOff(person.id)) continue;
    const mine = tasksOf(person.id);
    const overdue = mine.filter((t) => t.due && t.due < today);
    const dueToday = mine.filter((t) => t.due === today);
    const firstName = person.name.split(" ")[0];
    const row = (name: string, meta: string, metaColor = "#F3263E") =>
      `<div style="padding:8px 0;border-bottom:1px solid #E5DFD8;font-size:12.5px;">${name} <span style="float:right;color:${metaColor};font-size:11.5px;">${meta}</span></div>`;

    let subject = "";
    let inner = "";
    if (kind === "digest") {
      const convoForMe = mentionsOf(person.id);
      // Someone with no tasks but a waiting @mention used to be skipped here and
      // never told. A pending mention is reason enough to send.
      if (!overdue.length && !dueToday.length && mine.length === 0 && !convoForMe.length) continue;
      subject = `Your day at Sansico — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
      const flag = flagOf.get(person.name);
      inner = `
        <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">Good morning, <em>${firstName}</em>.</h2>
        <div style="background:#F5F2EC;border:1px solid #E5DFD8;border-radius:11px;padding:12px 16px;font-size:12.5px;line-height:1.5;margin-bottom:20px;">
          ${overdue.length} overdue, ${dueToday.length} due today, ${mine.length} open in total.
        </div>
        ${flag ? `<div style="display:flex;gap:8px;align-items:flex-start;background:rgba(122,13,32,0.06);border:1px solid #E5DFD8;border-radius:11px;padding:11px 14px;font-size:12px;line-height:1.5;margin-bottom:18px;color:#4A423D;"><span style="color:#7A0D20;">✦</span><span><b>Sansi flags:</b> ${flag}</span></div>` : ""}
        <h4 style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#9A918A;">Needs your attention</h4>
        ${[...overdue, ...dueToday].slice(0, 5).map((t) => row(t.name, t.due! < today ? `overdue since ${t.due}` : "due today")).join("") || `<p style="font-size:12.5px;color:#9A918A;">Nothing urgent — clean slate.</p>`}
        ${convoForMe.length ? `
        <h4 style="margin:22px 0 8px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#9A918A;">Mentions &amp; replies</h4>
        ${convoForMe.slice(0, 5).map((n) => `<div style="padding:8px 0;border-bottom:1px solid #E5DFD8;font-size:12.5px;line-height:1.5;">${escapeHtml(n.body)} <span style="color:#9A918A;font-size:11px;">· ${(n.reason || "").toLowerCase() === "mention" ? "mentioned you" : "new comment"}</span></div>`).join("")}
        ${convoForMe.length > 5 ? `<p style="font-size:11.5px;color:#9A918A;margin:8px 0 0;">and ${convoForMe.length - 5} more waiting in your inbox.</p>` : ""}` : ""}`;
    } else if (kind === "plan") {
      const top3 = [...mine].filter((t) => t.due).sort((a, b) => a.due!.localeCompare(b.due!)).slice(0, 3);
      if (!top3.length) continue;
      subject = "Your Monday plan — 3 things that matter today";
      inner = `
        <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">Your <em>Monday plan</em>.</h2>
        <h4 style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#9A918A;">If you do only three things today</h4>
        ${top3.map((t, i) => `<div style="padding:9px 0;border-bottom:1px solid #E5DFD8;font-size:12.5px;"><b style="display:inline-block;width:20px;height:20px;border-radius:99px;background:#7A0D20;color:#fff;font-size:10px;text-align:center;line-height:20px;margin-right:10px;">${i + 1}</b>${t.name} <span style="color:#9A918A;font-size:11px;">· ${t.priority}${t.due ? ` · due ${t.due}` : ""}</span></div>`).join("")}`;
    } else if (kind === "wrap") {
      const slipped = overdue.slice(0, 3);
      subject = "Friday wrap — your week at Sansico";
      inner = `
        <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">That's a <em>wrap</em>, ${firstName}.</h2>
        <div style="background:#F5F2EC;border:1px solid #E5DFD8;border-radius:11px;padding:12px 16px;font-size:12.5px;line-height:1.5;margin-bottom:14px;">${mine.length} tasks still open going into next week.</div>
        ${slipped.length ? `<h4 style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#9A918A;">Slipped this week</h4>${slipped.map((t) => row(t.name, `was due ${t.due}`)).join("")}` : `<p style="font-size:12.5px;color:#0D4F31;">Nothing slipped — great week.</p>`}`;
    }
    if (!inner) continue;
    if (dryRun) {
      preview.push({
        to: person.email, kind, subject,
        mentions: kind === "digest" ? mentionsOf(person.id).length : 0,
        overdue: overdue.length, dueToday: dueToday.length,
        // ?html=<email> returns the rendered body for one recipient, so a change
        // to the template can be eyeballed without mailing anyone.
        ...(req.nextUrl.searchParams.get("html") === person.email ? { html: wrapEmailHtml(inner, "digest", subject) } : {}),
      });
      continue;
    }
    const ok = await sendEmail({ email: person.email, name: person.name }, subject, wrapEmailHtml(inner, "digest", subject));
    if (ok) sent++;
  }
  if (dryRun) return NextResponse.json({ dryRun: true, kinds, wouldSend: preview.length, of: profiles.length, preview });
  return NextResponse.json({ kinds, sent, of: profiles.length });
}
