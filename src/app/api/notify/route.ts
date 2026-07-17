import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, wrapEmailHtml } from "@/lib/server/email";

// Instant alerts: assignment / invite. Respects per-category channel prefs.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false }, { status: 401 });

  if (body.kind === "assigned" && body.taskId) {
    const [{ data: task }, { data: assignees }, { data: actor }] = await Promise.all([
      supabase.from("tasks").select("id,name,priority,due,list_id").eq("id", body.taskId).single(),
      supabase.from("task_assignees").select("profile_id").eq("task_id", body.taskId),
      supabase.from("profiles").select("name").eq("id", auth.user.id).single(),
    ]);
    if (!task) return NextResponse.json({ ok: false });
    for (const a of assignees || []) {
      if (a.profile_id === auth.user.id) continue;
      const { data: person } = await supabase.from("profiles").select("id,name,email").eq("id", a.profile_id).single();
      if (!person) continue;
      await supabase.from("notifications").insert({
        profile_id: person.id, task_id: task.id,
        body: `${actor?.name || "Someone"} assigned you "${task.name}"`, reason: "Assigned",
      });
      const { data: pref } = await supabase.from("notification_prefs").select("channel").eq("profile_id", person.id).eq("category", "assigned").single();
      if ((pref?.channel || "instant") === "instant") {
        const html = wrapEmailHtml(`
          <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">New task <em>for you</em>.</h2>
          <div style="border:1.5px solid #E5DFD8;border-radius:12px;padding:15px 17px;margin-bottom:14px;">
            <div style="font-size:14px;margin-bottom:4px;">${task.name}</div>
            <div style="font-size:11.5px;color:#9A918A;margin-bottom:2px;">${task.priority}${task.due ? ` · due ${task.due}` : ""}</div>
            <div style="font-size:11.5px;color:#4A423D;">Assigned by ${actor?.name || "a teammate"}, just now</div>
          </div>
          <a href="${req.nextUrl.origin}" style="display:inline-block;background:#7A0D20;color:#fff;border-radius:999px;padding:8px 20px;font-size:12px;text-decoration:none;">Open in SansiWorks →</a>
          <p style="margin:16px 0 0;font-size:10.5px;color:#9A918A;">You're receiving this instantly because 'Task assigned to me' is set to Instant email in your settings.</p>`);
        await sendEmail({ email: person.email, name: person.name }, `${(actor?.name || "A teammate").split(" ")[0]} assigned you: ${task.name}`, html);
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "invite" && body.inviteId) {
    const { data: invite } = await supabase.from("invites").select("email,token,department_id,invited_by").eq("id", body.inviteId).single();
    if (!invite) return NextResponse.json({ ok: false });
    const [{ data: inviter }, { data: dept }] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", invite.invited_by).single(),
      supabase.from("departments").select("name").eq("id", invite.department_id).single(),
    ]);
    const acceptUrl = `${req.nextUrl.origin}/accept-invite?token=${invite.token}`;
    const html = wrapEmailHtml(`
      <p style="margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#7A0D20;">You're invited</p>
      <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-weight:400;font-size:28px;">Join <em>SansiWorks</em></h1>
      <p style="margin:0 0 22px;font-size:14.5px;line-height:1.6;color:#4A423D;">${inviter?.name || "A colleague"} has invited you to join the <b>${dept?.name || "Sansico"}</b> workspace on SansiWorks, Sansico Group's internal work-management platform.</p>
      <a href="${acceptUrl}" style="display:inline-block;background:#7A0D20;color:#fff;text-decoration:none;padding:13px 28px;border-radius:999px;font-size:14px;font-weight:700;">Accept invitation →</a>
      <p style="margin:22px 0 0;font-size:12px;color:#9A918A;line-height:1.6;">This invitation expires in 7 days. If you weren't expecting this, you can ignore this email.</p>`);
    await sendEmail({ email: invite.email }, "You're invited to join SansiWorks", html);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false });
}
