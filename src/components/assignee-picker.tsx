"use client";
import React, { useState } from "react";
import { Profile, initials } from "@/lib/types";
import { IconX } from "./icons";
import { readableTextOn } from "@/lib/colors";
import { workloadPct, tasksOfPerson, isOpen } from "@/lib/logic";
import { useStore } from "@/lib/store";

/* Single-select "R" picker — exactly one person. Department members are the default
   pool; anyone outside the department only appears once 2+ letters are typed (lazy
   cross-dept search), tagged with their department so the cross-dept jump is visible.
   Personal tasks skip the picker entirely — you're the only possible R.

   The candidate list only renders while the input is focused, and is capped at 8 —
   this used to render every department member as a permanent wall of chips beneath
   the field, which was fine at a handful of people but becomes unusable at real
   company scale (100 people = 100 chips, always visible, whether you're searching
   or not). Matches the collapsed/capped pattern RaciRows already uses for C/I. */
export function AssigneePicker({
  personal, me, value, onChange, deptScoped, allProfiles, deptLabel, compact, placeholder,
}: {
  personal: boolean;
  me: Profile;
  value: string | null;
  onChange: (id: string | null) => void;
  deptScoped: Profile[];   // destination department's members (or the full org, if unscoped)
  allProfiles: Profile[];  // full org, for cross-dept search
  deptLabel: (p: Profile) => string | null;
  compact?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const CAP = 8;

  if (personal) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: compact ? "6px 10px" : "8px 12px", border: "1px solid var(--sw-hair)", borderRadius: 10, background: "var(--sw-hover)" }}>
        <span style={{ width: 20, height: 20, borderRadius: 99, background: me.color, color: readableTextOn(me.color), fontSize: 8.5, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(me.name)}</span>
        <span style={{ fontSize: 12 }}>{me.name} <span style={{ color: "var(--sw-muted)" }}>— personal tasks are yours alone</span></span>
      </div>
    );
  }

  if (value) {
    const p = allProfiles.find((x) => x.id === value);
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 5px", borderRadius: 999, border: "1.5px solid var(--crimson)", background: "rgba(122,13,32,0.06)" }}>
        <span style={{ width: 20, height: 20, borderRadius: 99, background: p?.color || "#8C837C", color: readableTextOn(p?.color || "#8C837C"), fontSize: 8.5, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(p?.name || "?")}</span>
        <span style={{ fontSize: 12.5, color: "var(--sw-on-crimson)" }}>{p?.name || "Selected"}</span>
        <button onClick={() => onChange(null)} style={{ border: "none", background: "none", color: "var(--sw-on-crimson)", cursor: "pointer", padding: 0, display: "flex" }}><IconX size={10} /></button>
      </span>
    );
  }

  const q = query.trim().toLowerCase();
  const searching = q.length >= 2;
  const { tasks } = useStore();
  const pool = searching ? allProfiles : deptScoped;
  const matches = pool.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  const candidates = matches.slice(0, CAP);
  const hiddenCount = matches.length - candidates.length;

  return (
    <div style={{ position: "relative" }}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder || "Type a name, or click to browse your department…"}
        style={{ width: "100%", height: compact ? 30 : "var(--sw-field-h)", borderRadius: 9, border: "1.5px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 11px", fontSize: compact ? 12 : 13, outline: "none", color: "var(--sw-text)" }}
      />
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 5, background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 10, boxShadow: "0 10px 30px rgba(23,18,15,.15)", padding: 8, maxHeight: 220, overflowY: "auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {candidates.map((p) => {
              const crossDept = !deptScoped.some((x) => x.id === p.id);
              return (
                // onMouseDown (not onClick) fires before the input's onBlur closes this list.
                <button key={p.id} onMouseDown={() => onChange(p.id)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 4px", borderRadius: 999, border: "1.5px solid var(--sw-hair)", background: "none", cursor: "pointer" }}>
                  <span style={{ width: 18, height: 18, borderRadius: 99, background: p.color, color: readableTextOn(p.color), fontSize: 7.5, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(p.name)}</span>
                  <span style={{ fontSize: 11.5, color: "var(--sw-text-soft)" }}>{p.name}</span>
                  {/* Load at the moment of assigning. workloadPct() already existed
                      and drove the Overview's "Dewi at 10 open" — it just was not
                      shown at the one moment it could prevent the overload. */}
                  {(() => {
                    const load = workloadPct(tasks, p);
                    const open = tasksOfPerson(tasks, p.id).filter(isOpen).length;
                    if (!open) return null;
                    const heavy = load >= 100, busy = load >= 75;
                    return (
                      <span
                        title={`${open} open · ${load}% of capacity`}
                        style={{
                          fontSize: 8.5, borderRadius: 999, padding: "1px 6px",
                          color: heavy ? "var(--sw-on-red)" : busy ? "var(--sw-on-amber)" : "var(--sw-muted)",
                          background: heavy ? "rgba(243,38,62,0.12)" : "var(--sw-hover)",
                        }}
                      >{open} open{heavy ? " · full" : ""}</span>
                    );
                  })()}
                  {crossDept && <span style={{ fontSize: 8.5, color: "var(--sw-muted)", background: "var(--sw-hover)", borderRadius: 999, padding: "1px 6px" }}>{deptLabel(p) || "other dept"}</span>}
                </button>
              );
            })}
            {!candidates.length && <span style={{ fontSize: 11.5, color: "var(--sw-muted)" }}>{q.length === 1 ? "Type one more letter…" : "No match."}</span>}
          </div>
          {hiddenCount > 0 && (
            <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--sw-hair)" }}>
              +{hiddenCount} more — keep typing to narrow it down
            </div>
          )}
        </div>
      )}
    </div>
  );
}
