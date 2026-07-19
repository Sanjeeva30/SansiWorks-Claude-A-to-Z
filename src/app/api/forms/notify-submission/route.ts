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

  await supabase.from("notifications").insert({
    profile_id: form.default_assignee_id,
    task_id: null,
    body: `New submission on "${form.title}" — convert it to a task from the Forms page`,
    reason: "form submission",
  });
  return NextResponse.json({ ok: true, notified: true });
}
