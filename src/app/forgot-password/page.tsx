"use client";
import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, AuthNotice, authInput, authLabel, authButton } from "@/components/auth-shell";

function ForgotPasswordInner() {
  const params = useSearchParams();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The callback route bounces expired or malformed recovery links back here.
  const state = params.get("state");

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error: err } = await supabase.auth.resetPasswordForEmail(value, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);

    /* Always report success, even when Supabase returns an error. Telling the
       visitor "no account with that email" would turn this form into a way to
       discover who works here. The only errors surfaced are ones that are not
       about whether the address exists (e.g. rate limiting). */
    if (err && /rate|too many/i.test(err.message)) {
      setError("Too many requests just now — wait a minute and try again.");
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell
        title={<>Check your <em style={{ fontStyle: "italic" }}>inbox</em></>}
        subtitle={<>If an account exists for <b>{email.trim()}</b>, we&apos;ve sent a link to reset your password. It expires in one hour.</>}
      >
        <AuthNotice tone="info">
          The email can take a minute to arrive, and it sometimes lands in spam. The link only works once.
        </AuthNotice>
        <a href="/login" style={{ display: "block", textAlign: "center", padding: "12px", fontSize: 13, color: "#7A0D20", fontWeight: 700, textDecoration: "none" }}>
          Back to sign in
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={<>Reset your <em style={{ fontStyle: "italic" }}>password</em></>}
      subtitle="Enter your work email and we'll send you a link to set a new one."
    >
      {state === "expired" && (
        <AuthNotice tone="error">That reset link has expired or was already used. Request a new one below.</AuthNotice>
      )}
      {state === "invalid" && (
        <AuthNotice tone="error">That link didn&apos;t look right. Request a new one below.</AuthNotice>
      )}
      {error && <AuthNotice tone="error">{error}</AuthNotice>}

      <form onSubmit={submit}>
        <label htmlFor="email" style={authLabel}>Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@sansico.com"
          style={{ ...authInput, marginBottom: 22 }}
        />
        <button type="submit" disabled={busy || !email.trim()} style={authButton(busy || !email.trim())}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p style={{ margin: "16px 0 0", fontSize: 12.5, textAlign: "center" }}>
        <a href="/login" style={{ color: "#7A0D20", fontWeight: 600, textDecoration: "none" }}>Back to sign in</a>
      </p>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordInner />
    </Suspense>
  );
}
