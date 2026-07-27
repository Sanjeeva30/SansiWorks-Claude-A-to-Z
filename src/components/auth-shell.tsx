"use client";
import React from "react";

/* Shared chrome for the signed-out pages (login, forgot password, reset
   password, accept invite). These render outside the app shell, so none of the
   --sw-* theme tokens are applied and the palette is deliberately the light
   brand one, matching the existing login screen. */

export const authLabel: React.CSSProperties = {
  display: "block", fontSize: 12.5, fontWeight: 700, color: "#4A423D", marginBottom: 6,
};

export const authInput: React.CSSProperties = {
  width: "100%", height: 44, borderRadius: 10, border: "1.5px solid #E5DFD8",
  background: "#FAF8F4", padding: "0 14px", fontSize: 14, outline: "none",
};

export const authButton = (disabled?: boolean): React.CSSProperties => ({
  width: "100%", height: 46, borderRadius: 999, border: "none",
  background: disabled ? "#C9C1B9" : "#7A0D20", color: "#fff",
  fontSize: 14.5, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
  boxShadow: disabled ? "none" : "0 8px 20px rgba(122,13,32,.25)",
});

export function AuthShell({
  title, subtitle, children, width = 400,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div
      className="sw-vh-min"
      style={{ width: "100%", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: "#17120F", display: "flex", flexDirection: "column" }}
    >
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ width, maxWidth: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 36 }}>
            <span style={{ fontWeight: 800, letterSpacing: "0.08em", fontSize: 15, color: "#7A0D20" }}>SANSICO</span>
            <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 16, color: "#4A423D" }}>Group</span>
            <span style={{ marginLeft: 4, fontWeight: 700, fontSize: 14, color: "#4A423D" }}>SansiWorks</span>
          </div>
          <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 26, textAlign: "center", letterSpacing: "-0.01em" }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ margin: "0 0 28px", fontSize: 13.5, color: "#4A423D", textAlign: "center", lineHeight: 1.6 }}>{subtitle}</p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Inline notice used for errors and confirmations on the auth screens. */
export function AuthNotice({ tone, children }: { tone: "error" | "ok" | "info"; children: React.ReactNode }) {
  const palette = {
    error: { bg: "rgba(243,38,62,0.08)", border: "rgba(243,38,62,0.3)", fg: "#7A0D20", icon: "⚠" },
    ok: { bg: "rgba(13,79,49,0.08)", border: "rgba(13,79,49,0.3)", fg: "#0D4F31", icon: "✓" },
    info: { bg: "#F5F2EC", border: "#E5DFD8", fg: "#4A423D", icon: "" },
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{ display: "flex", alignItems: "flex-start", gap: 8, background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 9, padding: "10px 12px", marginBottom: 16 }}
    >
      {palette.icon && <span style={{ color: palette.fg, fontSize: 14, lineHeight: 1.3 }} aria-hidden="true">{palette.icon}</span>}
      <span style={{ fontSize: 12.5, color: palette.fg, fontWeight: 600, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

/* Password rules live here so the invite screen and the reset screen can never
   drift apart — a password accepted at signup must stay acceptable at reset. */
export const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 8, label: "At least 8 characters" },
  { test: (p: string) => /[A-Z]/.test(p), label: "One uppercase letter" },
  { test: (p: string) => /[0-9]/.test(p), label: "One number" },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: "One symbol" },
];

export function passwordScore(p: string): number {
  return PASSWORD_RULES.filter((r) => r.test(p)).length;
}
export function passwordMeetsRules(p: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(p));
}

/** Strength bars + a per-rule checklist, so "why is the button disabled?" is answerable. */
export function PasswordStrength({ value }: { value: string }) {
  const score = passwordScore(value);
  const colors = ["#E5DFD8", "#F3263E", "#B7791F", "#22409E", "#0D4F31"];
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} style={{ height: 4, flex: 1, borderRadius: 99, background: i <= score ? colors[score] : "#E5DFD8" }} />
        ))}
      </div>
      <p style={{ margin: "0 0 6px", fontSize: 11.5, color: colors[score] || "#9A918A", fontWeight: 600 }}>
        {labels[score] || " "}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(value);
          return (
            <li key={r.label} style={{ fontSize: 11, color: ok ? "#0D4F31" : "#9A918A", display: "flex", alignItems: "center", gap: 4 }}>
              <span aria-hidden="true">{ok ? "✓" : "○"}</span>
              <span>{r.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Password input with a show/hide toggle — typing a 4-rule password blind is hostile. */
export function PasswordField({
  value, onChange, placeholder, autoComplete, id, onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete: "current-password" | "new-password";
  id: string;
  onEnter?: () => void;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        name={id}
        type={show ? "text" : "password"}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        placeholder={placeholder}
        style={{ ...authInput, paddingRight: 62 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", color: "#7A0D20", fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: "6px 8px" }}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}
