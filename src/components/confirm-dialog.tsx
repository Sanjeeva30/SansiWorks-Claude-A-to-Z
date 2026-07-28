"use client";
import React from "react";
import { useUI } from "@/lib/ui";
import { useFocusTrap } from "@/lib/a11y";

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center" };

/* Single instance rendered once near the app root. Every destructive action
   in the app calls confirm() from useUI() and awaits the result instead of
   firing immediately — see the note on ConfirmOptions in lib/ui.tsx. */
export function ConfirmDialog() {
  const { confirmRequest, resolveConfirm } = useUI();
  // Esc cancels — never confirms. A destructive action must not be one
  // stray keypress away from happening.
  const trapRef = useFocusTrap(!!confirmRequest, () => resolveConfirm(false));
  if (!confirmRequest) return null;
  const { title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger } = confirmRequest;

  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) resolveConfirm(false); }}>
      <div
        ref={trapRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        style={{ width: 380, maxWidth: "90vw", background: "var(--sw-card)", borderRadius: 16, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "22px 24px" }}
      >
        <h3 id="confirm-dialog-title" style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: "var(--sw-text)" }}>{title}</h3>
        <p style={{ margin: "0 0 20px", fontSize: 12.5, color: "var(--sw-text-soft)", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={() => resolveConfirm(false)}
            style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", color: "var(--sw-text)", fontSize: 12.5, fontWeight: 400, cursor: "pointer" }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => resolveConfirm(true)}
            autoFocus
            style={{ padding: "8px 16px", borderRadius: 999, border: "none", background: danger ? "var(--red)" : "var(--crimson)", color: "#fff", fontSize: 12.5, fontWeight: 400, cursor: "pointer" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
