"use client";
import { useEffect } from "react";

/* Route-level error boundary. Without this, a single render throw anywhere in
   the tree white-screened the whole app with no way back — the worst possible
   failure mode for a tool people keep open all day.

   Deliberately plain: it must not import the store, Supabase, or anything that
   could itself be the thing that just failed. Only CSS variables from
   globals.css, which are already on <html> by the time this renders. */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  /* Next 16 renamed this from `reset`. `reset` still exists but only clears the
     error state and re-renders; `unstable_retry` also re-fetches, which is what
     a transient Supabase/network failure actually needs. */
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Keep the real cause in the console for anyone debugging a report.
    console.error("[SansiWorks] render error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        paddingTop: "calc(24px + env(safe-area-inset-top))",
        paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
        background: "var(--sw-page, #FAF7F4)",
        color: "var(--sw-text, #17120F)",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      <div style={{ width: 440, maxWidth: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 26, marginBottom: 12, color: "var(--sw-on-crimson, #7A0D20)" }}>✦</div>
        <h1
          style={{
            fontFamily: "var(--font-serif, Georgia, serif)",
            fontWeight: 400,
            fontSize: 23,
            fontStyle: "italic",
            margin: "0 0 10px",
          }}
        >
          Something went wrong on this screen.
        </h1>
        <p style={{ margin: "0 0 22px", fontSize: 13.5, lineHeight: 1.65, color: "var(--sw-text-soft, #4A423D)" }}>
          Your work is saved — this is a display problem, not lost data. Try
          again, and if it keeps happening tell IT which screen you were on.
        </p>
        <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => unstable_retry()}
            style={{
              padding: "11px 24px",
              borderRadius: 999,
              border: "none",
              background: "var(--crimson, #7A0D20)",
              color: "#fff",
              fontSize: 13.5,
              cursor: "pointer",
              boxShadow: "0 8px 20px rgba(122,13,32,.28)",
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              padding: "11px 24px",
              borderRadius: 999,
              border: "1px solid var(--sw-hair, #E5DED7)",
              background: "var(--sw-hover, #F2EDE8)",
              color: "var(--sw-text-soft, #4A423D)",
              fontSize: 13.5,
              textDecoration: "none",
            }}
          >
            Back to My Work
          </a>
        </div>
        {error.digest && (
          <p style={{ margin: "18px 0 0", fontSize: 11, color: "var(--sw-muted, #8A7F76)" }}>
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
