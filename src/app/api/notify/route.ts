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
    const [{ data: task }, { data: actor }] = await Promise.all([
      supabase.from("tasks").select("id,name,priority,due,list_id,assignee_id").eq("id", body.taskId).single(),
      supabase.from("profiles").select("name").eq("id", auth.user.id).single(),
    ]);
    if (!task) return NextResponse.json({ ok: false });
    if (task.assignee_id && task.assignee_id !== auth.user.id) {
      const { data: person } = await supabase.from("profiles").select("id,name,email").eq("id", task.assignee_id).single();
      if (person) {
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
    }
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "approval_requested" && body.approvalId) {
    const [{ data: approval }, { data: actor }] = await Promise.all([
      supabase.from("approvals").select("id,task_id,detail,requested_due,prev_due").eq("id", body.approvalId).single(),
      supabase.from("profiles").select("name").eq("id", auth.user.id).single(),
    ]);
    if (!approval) return NextResponse.json({ ok: false });
    const { data: task } = await supabase.from("tasks").select("id,name,priority").eq("id", approval.task_id).single();
    const approverIds: string[] = body.approverIds || [];
    for (const approverId of approverIds) {
      const { data: person } = await supabase.from("profiles").select("id,name,email").eq("id", approverId).single();
      if (!person) continue;
      const { data: pref } = await supabase.from("notification_prefs").select("channel").eq("profile_id", person.id).eq("category", "approval").single();
      if ((pref?.channel || "instant") !== "instant") continue;
      const html = wrapEmailHtml(`
        <p style="margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#7A0D20;">Approval requested</p>
        <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">${actor?.name || "A teammate"} needs a <em>decision</em>.</h2>
        <div style="border:1.5px solid #E5DFD8;border-radius:12px;padding:15px 17px;margin-bottom:14px;">
          <div style="font-size:14px;margin-bottom:4px;">${task?.name || "A task"}</div>
          <div style="font-size:11.5px;color:#9A918A;margin-bottom:2px;">Requesting due date ${approval.requested_due}${approval.prev_due ? ` (was ${approval.prev_due})` : ""}</div>
          ${approval.detail ? `<div style="font-size:11.5px;color:#4A423D;">"${approval.detail}"</div>` : ""}
        </div>
        <a href="${req.nextUrl.origin}" style="display:inline-block;background:#7A0D20;color:#fff;border-radius:999px;padding:8px 20px;font-size:12px;text-decoration:none;">Review in SansiWorks →</a>
        <p style="margin:16px 0 0;font-size:10.5px;color:#9A918A;">You're receiving this instantly because 'Approval requested from me' is set to Instant email in your settings.</p>`);
      await sendEmail({ email: person.email, name: person.name }, `${(actor?.name || "A teammate").split(" ")[0]} needs your approval: ${task?.name || "a task"}`, html);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "approval_decided" && body.approvalId) {
    const { data: approval } = await supabase.from("approvals").select("id,task_id,requester_id,requested_due").eq("id", body.approvalId).single();
    if (!approval) return NextResponse.json({ ok: false });
    const [{ data: task }, { data: person }, { data: decider }] = await Promise.all([
      supabase.from("tasks").select("name").eq("id", approval.task_id).single(),
      supabase.from("profiles").select("id,name,email").eq("id", approval.requester_id).single(),
      supabase.from("profiles").select("name").eq("id", auth.user.id).single(),
    ]);
    if (!person) return NextResponse.json({ ok: false });
    const { data: pref } = await supabase.from("notification_prefs").select("channel").eq("profile_id", person.id).eq("category", "approval").single();
    if ((pref?.channel || "instant") === "instant") {
      const approved = body.verdict === "approved";
      const html = wrapEmailHtml(`
        <p style="margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:${approved ? "#0D4F31" : "#7A0D20"};">Request ${body.verdict}</p>
        <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">Your due-date request was <em>${body.verdict}</em>.</h2>
        <div style="border:1.5px solid #E5DFD8;border-radius:12px;padding:15px 17px;margin-bottom:14px;">
          <div style="font-size:14px;margin-bottom:4px;">${task?.name || "A task"}</div>
          <div style="font-size:11.5px;color:#9A918A;">${approved ? `New due date ${approval.requested_due}` : "The current due date stays as-is"} · decided by ${decider?.name || "a superior"}</div>
          ${body.note ? `<div style="font-size:11.5px;color:#4A423D;margin-top:6px;">"${body.note}"</div>` : ""}
        </div>
        <a href="${req.nextUrl.origin}" style="display:inline-block;background:#7A0D20;color:#fff;border-radius:999px;padding:8px 20px;font-size:12px;text-decoration:none;">Open in SansiWorks →</a>`);
      await sendEmail({ email: person.email, name: person.name }, `Your request was ${body.verdict}: ${task?.name || "a task"}`, html);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "invite" && body.inviteId) {
    const { data: invite } = await supabase.from("invites").select("email,token,department_id,invited_by").eq("id", body.inviteId).single();
    if (!invite) return NextResponse.json({ ok: false });
    const [{ data: inviter }, { data: dept }] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", invite.invited_by).single(),
      supabase.from("org_units").select("name").eq("id", invite.department_id).single(),
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
