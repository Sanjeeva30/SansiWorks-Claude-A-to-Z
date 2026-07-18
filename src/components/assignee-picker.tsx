"use client";
import React, { useState } from "react";
import { Profile, initials } from "@/lib/types";
import { IconX } from "./icons";

/* Single-select "R" picker — exactly one person. Department members are prepopulated;
   anyone outside the department only appears once 2+ letters are typed (lazy cross-dept
   search), tagged with their department so the cross-dept jump is visible. Personal
   tasks skip the picker entirely — you're the only possible R. */
export function AssigneePicker({
  personal, me, value, onChange, deptScoped, allProfiles, deptLabel, compact,
}: {
  personal: boolean;
  me: Profile;
  value: string | null;
  onChange: (id: string | null) => void;
  deptScoped: Profile[];   // destination department's members
  allProfiles: Profile[];  // full org, for cross-dept search
  deptLabel: (p: Profile) => string | null;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");

  if (personal) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: compact ? "6px 10px" : "8px 12px", border: "1px solid var(--sw-hair)", borderRadius: 10, background: "var(--sw-hover)" }}>
        <span style={{ width: 20, height: 20, borderRadius: 99, background: me.color, color: "#fff", fontSize: 8.5, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(me.name)}</span>
        <span style={{ fontSize: 12 }}>{me.name} <span style={{ color: "var(--sw-muted)" }}>— personal tasks are yours alone</span></span>
      </div>
    );
  }

  if (value) {
    const p = allProfiles.find((x) => x.id === value);
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 5px", borderRadius: 999, border: "1.5px solid var(--crimson)", background: "rgba(122,13,32,0.06)" }}>
        <span style={{ width: 20, height: 20, borderRadius: 99, background: p?.color || "#8C837C", color: "#fff", fontSize: 8.5, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(p?.name || "?")}</span>
        <span style={{ fontSize: 12.5, color: "var(--crimson)" }}>{p?.name || "Selected"}</span>
        <button onClick={() => onChange(null)} style={{ border: "none", background: "none", color: "var(--crimson)", cursor: "pointer", padding: 0, display: "flex" }}><IconX size={10} /></button>
      </span>
    );
  }

  const q = query.trim().toLowerCase();
  const candidates = q.length >= 2
    ? allProfiles.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    : deptScoped.filter((p) => !q || p.name.toLowerCase().includes(q));

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Department shown below — type 2+ letters to search any department…"
        style={{ width: "100%", height: compact ? 30 : "var(--sw-field-h)", borderRadius: 9, border: "1.5px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 11px", fontSize: compact ? 12 : 13, marginBottom: 8, outline: "none", color: "var(--sw-text)" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {candidates.map((p) => {
          const crossDept = !deptScoped.some((x) => x.id === p.id);
          return (
            <button key={p.id} onClick={() => onChange(p.id)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 4px", borderRadius: 999, border: "1.5px solid var(--sw-hair)", background: "none", cursor: "pointer" }}>
              <span style={{ width: 18, height: 18, borderRadius: 99, background: p.color, color: "#fff", fontSize: 7.5, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(p.name)}</span>
              <span style={{ fontSize: 11.5, color: "var(--sw-text-soft)" }}>{p.name}</span>
              {crossDept && <span style={{ fontSize: 8.5, color: "var(--sw-muted)", background: "var(--sw-hover)", borderRadius: 999, padding: "1px 6px" }}>{deptLabel(p) || "other dept"}</span>}
            </button>
          );
        })}
        {!candidates.length && <span style={{ fontSize: 11.5, color: "var(--sw-muted)" }}>{q.length === 1 ? "Type one more letter…" : "No match."}</span>}
      </div>
    </div>
  );
}
