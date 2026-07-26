import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";

// Called by the (unauthenticated) public portal right after a submission is
// inserted. Runs with the service role so an anonymous submitter can still
// wake up the form's owner — without opening notifications INSERT to anon
// generally. Recipient is resolved server-side from the form record, never
// taken from the request body, so this can't be used to spam arbitrary people.
export async function POST(req: NextRequest) {
  const { formId, submissionId } = await req.json();
  if (!formId || !submissionId) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = createAdminClient();
  const { data: submission } = await supabase.from("form_submissions").select("id,form_id").eq("id", submissionId).eq("form_id", formId).single();
  if (!submission) return NextResponse.json({ ok: false }, { status: 404 });

  const { data: form } = await supabase.from("forms").select("title,default_assignee_id").eq("id", formId).single();
  if (!form?.default_assignee_id) return NextResponse.json({ ok: true, notified: false });

  // Idempotent per submission: this endpoint is unauthenticated, so without a
  // dedupe key anyone could replay the same submissionId in a loop and bury the
  // form owner in identical alerts. The unique partial index on dedupe_key means
  // a replay conflicts instead of inserting, and we report it as already-notified.
  const { error } = await supabase.from("notifications").insert({
    profile_id: form.default_assignee_id,
    task_id: null,
    body: `New submission on "${form.title}" — convert it to a task from the Forms page`,
    reason: "form submission",
    dedupe_key: `form-submission:${submissionId}`,
  });
  if (error) {
    // 23505 = unique_violation: this submission has already raised its notification.
    if (error.code === "23505") return NextResponse.json({ ok: true, notified: false, duplicate: true });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, notified: true });
}
