import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { sendEmail, wrapEmailHtml } from "@/lib/server/email";

// One cron endpoint, dispatched by kind: digest (daily), plan (Mon 08:00 WIB), wrap (Fri 15:00 WIB).
// Guarded by CRON_SECRET. Requires SUPABASE_SERVICE_ROLE_KEY in production.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let kind = req.nextUrl.searchParams.get("kind") || "digest";
  // Vercel Hobby allows 2 crons: "morning" = daily digest, plus the Monday plan on Mondays.
  const isMonday = new Date().getUTCDay() === 1;
  const kinds = kind === "morning" ? (isMonday ? ["digest", "plan"] : ["digest"]) : [kind];

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: profiles }, { data: tasks }, { data: assignees }, { data: prefs }] = await Promise.all([
    supabase.from("profiles").select("id,name,email,digest_time"),
    supabase.from("tasks").select("id,name,status,priority,due,list_id").neq("status", "Done"),
    supabase.from("task_assignees").select("task_id,profile_id"),
    supabase.from("notification_prefs").select("profile_id,category,channel"),
  ]);
  if (!profiles || !tasks) return NextResponse.json({ error: "no data — is SUPABASE_SERVICE_ROLE_KEY set?" }, { status: 500 });

  const tasksOf = (pid: string) => {
    const ids = new Set((assignees || []).filter((a) => a.profile_id === pid).map((a) => a.task_id));
    return tasks.filter((t) => ids.has(t.id));
  };
  const digestOff = (pid: string) =>
    (prefs || []).filter((p) => p.profile_id === pid).every((p) => p.channel === "off" || p.channel === "inapp");

  let sent = 0;
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
      if (!overdue.length && !dueToday.length && mine.length === 0) continue;
      subject = `Your day at Sansico — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
      inner = `
        <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">Good morning, <em>${firstName}</em>.</h2>
        <div style="background:#F5F2EC;border:1px solid #E5DFD8;border-radius:11px;padding:12px 16px;font-size:12.5px;line-height:1.5;margin-bottom:20px;">
          ${overdue.length} overdue, ${dueToday.length} due today, ${mine.length} open in total.
        </div>
        <h4 style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#9A918A;">Needs your attention</h4>
        ${[...overdue, ...dueToday].slice(0, 5).map((t) => row(t.name, t.due! < today ? `overdue since ${t.due}` : "due today")).join("") || `<p style="font-size:12.5px;color:#9A918A;">Nothing urgent — clean slate.</p>`}`;
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
    const ok = await sendEmail({ email: person.email, name: person.name }, subject, wrapEmailHtml(inner));
    if (ok) sent++;
  }
  return NextResponse.json({ kinds, sent, of: profiles.length });
}
