"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const doLogin = async () => {
    setBusy(true);
    setError(false);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setError(true);
      setBusy(false);
      return;
    }
    await supabase.from("profiles").update({ last_login: new Date().toISOString() }).eq("email", email.trim());
    router.push("/");
    router.refresh();
  };

  const label: React.CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 700, color: "#4A423D", marginBottom: 6 };
  const input: React.CSSProperties = { width: "100%", height: 44, borderRadius: 10, border: "1.5px solid #E5DFD8", background: "#FAF8F4", padding: "0 14px", fontSize: 14, outline: "none" };

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: "#17120F", display: "flex", flexDirection: "column" }}>
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

          <label style={label}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@sansico.com" style={{ ...input, marginBottom: 16 }} />

          <label style={label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doLogin(); }}
            placeholder="••••••••"
            style={{ ...input, marginBottom: 10 }}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 22 }}>
            <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 12.5, color: "#7A0D20", textDecoration: "none", fontWeight: 600 }}>Forgot password?</a>
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(243,38,62,0.08)", border: "1px solid rgba(243,38,62,0.3)", borderRadius: 9, padding: "10px 12px", marginBottom: 16 }}>
              <span style={{ color: "#F3263E", fontSize: 14 }}>⚠</span>
              <span style={{ fontSize: 12.5, color: "#7A0D20", fontWeight: 600 }}>Incorrect email or password. 2 attempts remaining before your account is temporarily locked.</span>
            </div>
          )}

          <button
            onClick={doLogin}
            disabled={busy}
            style={{ width: "100%", height: 46, borderRadius: 999, border: "none", background: "#7A0D20", color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.25)", marginBottom: 16, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

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
