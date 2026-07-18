"use client";
import React, { useState } from "react";
import { Profile, initials } from "@/lib/types";
import { IconX } from "./icons";

// "Four search rows" RACI picker (option 1a) — R merged into Assign-to, so here:
// A (required, single, defaults to assignee's manager), C (Contributor), I (Informed).
// Personal tasks skip A entirely.

export interface RaciValue {
  a: string | null;      // profile id override; null = auto (manager)
  c: string[];
  i: string[];
}

export function RaciRows({
  profiles, value, onChange, autoA, personal, aCandidates, deptLabel,
}: {
  profiles: Profile[];           // pool for C & I — may span every department
  value: RaciValue;
  onChange: (v: RaciValue) => void;
  autoA: string | null;          // auto accountable (manager of first assignee)
  personal?: boolean;
  aCandidates?: Profile[];       // pool for A — the Rs plus anyone who outranks them
  deptLabel?: (p: Profile) => string | null;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const rows: {
    letter: string; label: string; single?: boolean; required?: boolean;
    selected: string[]; set: (ids: string[]) => void;
  }[] = [];
  if (!personal) {
    const effA = value.a || autoA;
    rows.push({
      letter: "A", label: "Accountable", single: true, required: true,
      selected: effA ? [effA] : [],
      set: (ids) => onChange({ ...value, a: ids[0] || null }),
    });
  }
  rows.push({
    letter: "C", label: "Contributor",
    selected: value.c, set: (ids) => onChange({ ...value, c: ids }),
  });
  rows.push({
    letter: "I", label: "Informed",
    selected: value.i, set: (ids) => onChange({ ...value, i: ids }),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {rows.map((r) => {
        const k = r.letter;
        const isOpen = active === k;
        const q = isOpen ? query.toLowerCase() : "";
        const pool = r.single ? (aCandidates || profiles) : profiles;
        // C & I search the whole company — require 2+ letters before showing names
        const needsQuery = !r.single && pool.length > 8;
        const results = needsQuery && q.length < 2
          ? []
          : pool.filter((p) => !r.selected.includes(p.id) && (!q || p.name.toLowerCase().includes(q))).slice(0, 6);
        return (
          <div key={k} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ width: 92, flex: "none", paddingTop: 5, fontSize: 10, color: "var(--sw-muted)" }}>
              <b style={{ fontWeight: 800, fontSize: 11.5, color: r.required ? "var(--crimson)" : "var(--sw-muted)" }}>{r.letter}</b> {r.label}
            </span>
            <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
              <div style={{ border: `1.5px solid ${isOpen ? "var(--crimson)" : "var(--sw-hair)"}`, borderRadius: 9, background: "var(--sw-hover)", padding: "2px 6px", display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", minHeight: 24 }}>
                {r.selected.map((pid) => {
                  const p = profiles.find((x) => x.id === pid);
                  if (!p) return null;
                  const tag = r.single && !value.a ? "auto" : "";
                  return (
                    <span key={pid} style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "1px 7px 1px 2px" }}>
                      <span style={{ width: 15, height: 15, borderRadius: 99, background: p.color, color: "#fff", fontSize: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(p.name)}</span>
                      <span style={{ fontSize: 11, color: "var(--sw-text)" }}>{p.name.split(" ")[0]}</span>
                      {tag && <span style={{ fontSize: 8.5, color: "var(--green)" }}>{tag}</span>}
                      <button
                        onClick={() => r.set(r.selected.filter((x) => x !== pid))}
                        style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 8.5, color: "var(--sw-muted)" }}
                      >
                        <IconX />
                      </button>
                    </span>
                  );
                })}
                <input
                  value={isOpen ? query : ""}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => { setActive(k); setQuery(""); }}
                  onBlur={() => setTimeout(() => setActive((a) => (a === k ? null : a)), 160)}
                  placeholder={r.selected.length ? "" : "Search people…"}
                  style={{ flex: 1, minWidth: 60, border: "none", background: "none", outline: "none", fontSize: 11.5, height: 20, color: "var(--sw-text)", fontFamily: "inherit" }}
                />
              </div>
              {isOpen && (
                <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 3px)", zIndex: 40, background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 9, boxShadow: "0 14px 40px rgba(23,18,15,0.18)", overflow: "hidden" }}>
                  {results.map((p) => (
                    <button
                      key={p.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (r.single) { r.set([p.id]); setActive(null); } else { r.set([...r.selected, p.id]); }
                        setQuery("");
                      }}
                      className="sw-row"
                      style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", padding: "6px 9px", border: "none", background: "none", cursor: "pointer" }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: 99, background: p.color, color: "#fff", fontSize: 7.5, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{initials(p.name)}</span>
                      <span style={{ flex: 1, fontSize: 11.5, color: "var(--sw-text)" }}>{p.name}</span>
                      {deptLabel && deptLabel(p) && (
                        <span style={{ fontSize: 9, color: "var(--sw-muted)", background: "var(--sw-hover)", borderRadius: 999, padding: "1px 7px", flex: "none" }}>{deptLabel(p)}</span>
                      )}
                      {r.single && p.id === autoA && (
                        <span style={{ fontSize: 9, color: "var(--green)", background: "rgba(13,79,49,0.08)", borderRadius: 999, padding: "1px 7px" }}>manager</span>
                      )}
                    </button>
                  ))}
                  {!results.length && (
                    <div style={{ padding: "7px 10px", fontSize: 11, color: "var(--sw-muted)" }}>
                      {needsQuery && q.length < 2 ? "Type 2+ letters — any department" : "No matches."}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const raciNote = (personal?: boolean) =>
  personal
    ? "Personal task — you're Responsible & Accountable · C & I optional"
    : "Responsible = the assignees above · A required · C & I optional";
