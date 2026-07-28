import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/admin";

/* Suspend / reactivate a user. "Suspend" used to be a UI stub that only
   pushed a toast — there was no way to deactivate anyone in the app at all.

   This is a real, reversible deactivation, not a delete: profiles.active
   flips (so pickers/lists can filter them out immediately) and the
   Supabase auth user is banned via the admin API (ban_duration) so they
   genuinely cannot sign back in — flipping the profile flag alone would
   have left their session and password fully usable. Reactivating clears
   the ban. Nothing about the person's history, tasks, or audit trail is
   touched either way. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: targetId } = await params;
  const { active } = await req.json().catch(() => ({}));
  if (typeof active !== "boolean") return NextResponse.json({ ok: false, error: "missing active" }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (targetId === auth.user.id) {
    return NextResponse.json({ ok: false, error: "You can't suspend your own account." }, { status: 400 });
  }

  const { data: actor } = await supabase.from("profiles").select("is_super,level_id").eq("id", auth.user.id).single();
  const isAdmin = actor?.is_super || (actor?.level_id ? ["l1", "l2", "l2r", "l3"].includes(actor.level_id) : false);
  if (!isAdmin) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { error: profErr } = await admin.from("profiles").update({ active }).eq("id", targetId);
  if (profErr) return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });

  const { error: banErr } = await admin.auth.admin.updateUserById(targetId, {
    ban_duration: active ? "none" : "876600h", // ~100 years — reversible, not a real expiry
  });
  if (banErr) return NextResponse.json({ ok: false, error: banErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/* Permanent delete — super admin only, deliberately separate from Suspend
   above. profiles.id has no FK to auth.users (Supabase doesn't wire one by
   default), so the row and the auth account are two deletes, and most of the
   tables that reference a profile (tasks, comments, docs, audit_log,
   task_activity, approvals, ...) use NO ACTION, not CASCADE — the DB itself
   blocks deleting anyone with real history rather than silently orphaning or
   cascading away their work. That 23503 is caught below and turned into an
   actionable message instead of a raw Postgres error. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: targetId } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (targetId === auth.user.id) {
    return NextResponse.json({ ok: false, error: "You can't delete your own account." }, { status: 400 });
  }

  const { data: actor } = await supabase.from("profiles").select("is_super").eq("id", auth.user.id).single();
  if (!actor?.is_super) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { error: profErr } = await admin.from("profiles").delete().eq("id", targetId);
  if (profErr) {
    const hasHistory = profErr.code === "23503";
    return NextResponse.json({
      ok: false,
      error: hasHistory
        ? "They have existing tasks, comments, docs, or audit history — permanent delete is blocked to protect that record. Suspend them instead, or reassign their work first."
        : profErr.message,
    }, { status: hasHistory ? 409 : 500 });
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(targetId);
  // A 404 here means the auth account is already gone — the end state we
  // wanted anyway, so treat it as success rather than surfacing a confusing
  // error for a row that no longer exists either way.
  if (authErr && authErr.status !== 404) {
    return NextResponse.json({ ok: false, error: authErr.message || String(authErr) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
