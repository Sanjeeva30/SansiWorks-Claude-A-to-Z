"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  AuthShell, AuthNotice, authLabel, authButton,
  PasswordField, PasswordStrength, passwordMeetsRules,
} from "@/components/auth-shell";
import { RECOVERY_FLAG } from "@/components/recovery-redirect";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  // Naming the account removes any doubt about which one is being changed.
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  /* A session alone is NOT sufficient authority to change a password here.
     Whoever was already signed in on this device has a session too, and this
     page calling updateUser() against it would change THEIR password — which is
     exactly what happened before the recovery flag existed: a reset link opened
     on a colleague's machine reset the colleague's account.

     So require positive proof that this page load followed a real recovery:
     either PASSWORD_RECOVERY fired in this tab (flag set by RecoveryRedirect),
     or /auth/callback exchanged a recovery code and sent us here. Anything else
     is treated as an invalid link, even with a perfectly good session present. */
  useEffect(() => {
    (async () => {
      let recovered = false;
      try { recovered = sessionStorage.getItem(RECOVERY_FLAG) === "1"; } catch {}

      if (!recovered) {
        // Give supabase-js a moment to process a fragment on this very URL, then
        // re-check — the event can land just after mount.
        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
          if (event === "PASSWORD_RECOVERY") {
            try { sessionStorage.setItem(RECOVERY_FLAG, "1"); } catch {}
            setReady("ok");
          }
        });
        await new Promise((r) => setTimeout(r, 1200));
        sub.subscription.unsubscribe();
        try { recovered = sessionStorage.getItem(RECOVERY_FLAG) === "1"; } catch {}
        if (!recovered) { setReady("no-session"); return; }
      }

      const { data } = await supabase.auth.getSession();
      setAccountEmail(data.session?.user?.email ?? null);
      setReady(data.session ? "ok" : "no-session");
    })();
  }, [supabase]);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = passwordMeetsRules(password) && password === confirm && !busy;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setBusy(false);
      // Supabase rejects re-using the current password; say that plainly.
      setError(
        /should be different|same/i.test(err.message)
          ? "That's the password you already have — choose a different one."
          : err.message
      );
      return;
    }
    try { sessionStorage.removeItem(RECOVERY_FLAG); } catch {}
    setDone(true);
    setBusy(false);
  };

  if (ready === "checking") {
    return <AuthShell title="One moment…" subtitle="Checking your reset link." >{null}</AuthShell>;
  }

  if (ready === "no-session") {
    return (
      <AuthShell
        title={<>This link is no longer <em style={{ fontStyle: "italic" }}>valid</em></>}
        subtitle="Reset links work once and expire after an hour."
      >
        <a href="/forgot-password" style={{ display: "block", textAlign: "center", ...authButton(false), lineHeight: "46px", textDecoration: "none" }}>
          Request a new link
        </a>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title={<>Password <em style={{ fontStyle: "italic" }}>updated</em></>}
        subtitle="You're signed in with your new password."
      >
        <button onClick={() => { router.push("/"); router.refresh(); }} style={authButton(false)}>
          Go to SansiWorks
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={<>Set a new <em style={{ fontStyle: "italic" }}>password</em></>}
      subtitle={accountEmail
        ? <>Setting a new password for <b>{accountEmail}</b>. Choose something you haven&apos;t used here before.</>
        : "Choose something you haven't used here before."}
    >
      {error && <AuthNotice tone="error">{error}</AuthNotice>}

      <form onSubmit={submit}>
        <label htmlFor="new-password" style={authLabel}>New password</label>
        <PasswordField id="new-password" autoComplete="new-password" value={password} onChange={setPassword} placeholder="8+ characters" />
        <div style={{ height: 8 }} />
        <PasswordStrength value={password} />

        <label htmlFor="confirm-password" style={authLabel}>Confirm new password</label>
        <PasswordField id="confirm-password" autoComplete="new-password" value={confirm} onChange={setConfirm} onEnter={() => submit()} />
        {mismatch && <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "#F3263E" }}>Both passwords need to match.</p>}

        <div style={{ height: 22 }} />
        <button type="submit" disabled={!canSubmit} style={authButton(!canSubmit)}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
