"use client";

/* Last-resort boundary: catches failures in the root layout itself, which
   error.tsx cannot reach. It replaces the root layout when active, so per the
   Next 16 docs it must supply its own <html> and <body> — and it cannot assume
   globals.css loaded, which is why every colour here is a literal rather than a
   CSS variable. Keep this file dependency-free for the same reason. */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        {/* metadata exports aren't allowed in a Client Component, so the title
            is set with React's <title> instead. */}
        <title>SansiWorks — something went wrong</title>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "#FAF7F4",
            color: "#17120F",
            fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          }}
        >
          <div style={{ width: 440, maxWidth: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 26, marginBottom: 12, color: "#7A0D20" }}>✦</div>
            <h1 style={{ fontWeight: 400, fontSize: 23, margin: "0 0 10px" }}>
              SansiWorks couldn&apos;t start.
            </h1>
            <p style={{ margin: "0 0 22px", fontSize: 13.5, lineHeight: 1.65, color: "#4A423D" }}>
              Nothing has been lost. This is usually a temporary problem —
              reload to try again. If it persists, send IT the reference below.
            </p>
            <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => unstable_retry()}
                style={{
                  padding: "11px 24px",
                  borderRadius: 999,
                  border: "none",
                  background: "#7A0D20",
                  color: "#fff",
                  fontSize: 13.5,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              <a
                href="/"
                style={{
                  padding: "11px 24px",
                  borderRadius: 999,
                  border: "1px solid #E5DED7",
                  background: "#F2EDE8",
                  color: "#4A423D",
                  fontSize: 13.5,
                  textDecoration: "none",
                }}
              >
                Reload
              </a>
            </div>
            {error.digest && (
              <p style={{ margin: "18px 0 0", fontSize: 11, color: "#8A7F76" }}>
                Reference: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
