import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";

/* Marks an invited user's email as confirmed, so they can sign in immediately
   after accepting.

   Why this exists: the project has "Confirm email" switched on in Supabase Auth.
   That is the right default for open sign-up, but this app is invite-only and
   never sends a confirmation email — so an invited person signed up, could not
   sign in ("Email not confirmed"), and the accept page swallowed the error. If
   somebody else happened to be signed in on that machine, the new joiner landed
   in THEIR account instead. Invite onboarding did not work end to end.

   Receiving the invitation at that address is itself proof of ownership — the
   token was emailed there and nowhere else — so confirming on redemption is
   sound. The alternative (turning confirmations off globally) would also weaken
   any future non-invite sign-up path.

   Everything is re-verified server-side: the token must be a live, unexpired
   invite, and the account being confirmed must be the exact address that invite
   was issued to. A caller cannot confirm an arbitrary user. */
export async function POST(req: NextRequest) {
  const { token, userId } = await req.json().catch(() => ({}));
  if (!token || !userId) return NextResponse.json({ ok: false, error: "missing token or userId" }, { status: 400 });

  const admin = createAdminClient();

  // 1. The invite must exist, be unredeemed at the time it was looked up, and be
  //    within the same 7-day window complete_invite() enforces.
  const { data: invite } = await admin
    .from("invites")
    .select("email, created_at, status")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return NextResponse.json({ ok: false, error: "unknown invite" }, { status: 404 });

  const ageMs = Date.now() - new Date(invite.created_at).getTime();
  if (ageMs > 7 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ ok: false, error: "invite expired" }, { status: 410 });
  }

  // 2. The user being confirmed must be the person the invite was addressed to.
  const { data: userRes, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !userRes?.user) return NextResponse.json({ ok: false, error: "unknown user" }, { status: 404 });
  if ((userRes.user.email || "").toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "invite/user mismatch" }, { status: 403 });
  }

  if (userRes.user.email_confirmed_at) return NextResponse.json({ ok: true, alreadyConfirmed: true });

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  /* Retire any other outstanding invites for this address. Sending a second
     invite previously left the first one live, so an old link kept working
     after the person had already joined. */
  await admin
    .from("invites")
    .update({ status: "superseded" })
    .eq("email", invite.email)
    .eq("status", "sent")
    .neq("token", token);

  return NextResponse.json({ ok: true });
}
