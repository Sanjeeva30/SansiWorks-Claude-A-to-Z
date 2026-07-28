"use client";
import { PresenceViewer } from "@/lib/presence";
import { Avatar } from "./shared";

const CAP = 4;

/* Overlapping avatar stack for "who else is looking at this right now."
   Renders nothing when no one else is here — the common case — so it never
   costs layout space on a task or board nobody else has open. */
export function PresenceAvatars({ viewers, size = 22 }: { viewers: PresenceViewer[]; size?: number }) {
  if (!viewers.length) return null;
  const shown = viewers.slice(0, CAP);
  const overflow = viewers.length - shown.length;

  return (
    <div style={{ display: "flex", alignItems: "center", flex: "none" }} title={`${viewers.map((v) => v.name).join(", ")} — also viewing this`}>
      {shown.map((v, i) => (
        <span key={v.id} style={{ marginLeft: i === 0 ? 0 : -6, position: "relative", zIndex: shown.length - i }}>
          <Avatar person={v} size={size} border="2px solid var(--sw-card)" />
        </span>
      ))}
      {overflow > 0 && (
        <span
          style={{
            marginLeft: -6, width: size, height: size, borderRadius: 99, flex: "none",
            border: "2px solid var(--sw-card)", background: "var(--sw-hover)", color: "var(--sw-muted)",
            fontSize: Math.round(size * 0.36), fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
