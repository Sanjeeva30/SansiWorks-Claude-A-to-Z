"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthNotice, PasswordField } from "@/components/auth-shell";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const doLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setBusy(false);
      /* Report what actually happened. The previous message was a fixed string
         claiming "2 attempts remaining before your account is temporarily
         locked" — there is no attempt counter and no lockout anywhere in the
         system, so it told every user who mistyped a password something untrue.
         Credentials stay deliberately vague (not "no such user") so this form
         can't be used to enumerate who works here. */
      if (/email not confirmed/i.test(err.message)) {
        setError("Your email address hasn't been confirmed yet. Check your inbox for the invitation link.");
      } else if (/invalid login credentials/i.test(err.message)) {
        setError("That email and password don't match. Check them and try again.");
      } else {
        setError(err.message);
      }
      return;
    }
    // Stamp last_login by id — the row is the signed-in user's own, which is what
    // the profiles RLS policy allows.
    if (data.user) {
      await supabase.from("profiles").update({ last_login: new Date().toISOString() }).eq("id", data.user.id);
    }
    router.push("/");
    router.refresh();
  };

  const label: React.CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 700, color: "#4A423D", marginBottom: 6 };
  const input: React.CSSProperties = { width: "100%", height: 44, borderRadius: 10, border: "1.5px solid #E5DFD8", background: "#FAF8F4", padding: "0 14px", fontSize: 14, outline: "none" };

  return (
    <div className="sw-vh-min" style={{ width: "100%", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: "#17120F", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ width: 400, maxWidth: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 36 }}>
            <span style={{ fontWeight: 800, letterSpacing: "0.08em", fontSize: 15, color: "#7A0D20" }}>SANSICO</span>
            <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 16, color: "#4A423D" }}>Group</span>
            <span style={{ marginLeft: 4, fontWeight: 700, fontSize: 14, color: "#4A423D" }}>SansiWorks</span>
          </div>

          <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 26, textAlign: "center", letterSpacing: "-0.01em" }}>
            Welcome <em style={{ fontStyle: "italic" }}>back</em>
          </h1>
          <p style={{ margin: "0 0 28px", fontSize: 13.5, color: "#4A423D", textAlign: "center" }}>Sign in to your workspace.</p>

          {/* A real <form>: gives Enter-to-submit on every field and lets browsers
              and password managers recognise this as a sign-in to save/fill. */}
          <form onSubmit={doLogin}>
          <label htmlFor="email" style={label}>Email</label>
          <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@sansico.com" style={{ ...input, marginBottom: 16 }} />

          <label htmlFor="current-password" style={label}>Password</label>
          <PasswordField id="current-password" autoComplete="current-password" value={password} onChange={setPassword} placeholder="••••••••" />

          <div style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0 22px" }}>
            <a href="/forgot-password" style={{ fontSize: 12.5, color: "#7A0D20", textDecoration: "none", fontWeight: 600 }}>Forgot password?</a>
          </div>

          {error && <AuthNotice tone="error">{error}</AuthNotice>}

          <button
            type="submit"
            disabled={busy}
            style={{ width: "100%", height: 46, borderRadius: 999, border: "none", background: "#7A0D20", color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.25)", marginBottom: 16, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          </form>

          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9A918A", textAlign: "center", lineHeight: 1.6 }}>
            Access is by invitation only. Contact your Department Head if you need an account.
          </p>
          <p style={{ margin: 0, fontSize: 12, textAlign: "center" }}>
            <a href="/accept-invite" style={{ color: "#7A0D20", fontWeight: 600, textDecoration: "none" }}>Haven&apos;t accepted your invite yet?</a>
          </p>
        </div>
      </div>
    </div>
  );
}
