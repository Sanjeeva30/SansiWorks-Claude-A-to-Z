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
