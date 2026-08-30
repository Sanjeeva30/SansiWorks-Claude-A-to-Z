"use client";
import React, { useState } from "react";
import { Task, Profile, initials } from "@/lib/types";
import { readableTextOn } from "@/lib/colors";

/* R and A on a task row, with a hover card carrying the full RACI.

   The avatars alone answer "who is doing it / who is answerable" at a glance,
   which is the common case. C and I matter less often but matter a lot when
   they matter — "who else needs to know before I change this date" — and they
   were only reachable by opening the task. A native title tooltip couldn't
   carry them, so this is a real card. */
export function RaciBadge({
  task, profiles, onOpenProfile, size = "row",
}: {
  task: Task;
  profiles: Profile[];
  onOpenProfile: (id: string) => void;
  size?: "row" | "card";
}) {
  const [hover, setHover] = useState(false);

  const byId = (id: string | null) => (id ? profiles.find((p) => p.id === id) || null : null);
  const r = byId(task.assignee_id);
  const a = task.accountable_id && task.accountable_id !== task.assignee_id ? byId(task.accountable_id) : null;
  const c = (task.raci_c || []).map(byId).filter(Boolean) as Profile[];
  const i = (task.raci_i || []).map(byId).filter(Boolean) as Profile[];

  const rSize = size === "row" ? 22 : 19;
  const aSize = size === "row" ? 20 : 17;

  const dot = (p: Profile, px: number, dashed: boolean) => (
    <button
      onClick={(e) => { e.stopPropagation(); onOpenProfile(p.id); }}
      style={{
        width: px, height: px, borderRadius: 99, background: p.color, color: readableTextOn(p.color),
        fontSize: px < 20 ? 8 : 9, fontWeight: 400, display: "flex", alignItems: "center",
        justifyContent: "center", cursor: "pointer", padding: 0, marginLeft: -6,
        border: dashed ? "1.5px dashed var(--sw-muted)" : "2px solid var(--sw-card)",
        opacity: dashed ? 0.9 : 1,
      }}
    >{initials(p.name)}</button>
  );

  const line = (letter: string, meaning: string, people: Profile[]) => (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0" }}>
      <span style={{ width: 12, flex: "none", fontSize: 10, fontWeight: 800, color: "var(--sw-on-crimson)" }}>{letter}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: "var(--sw-text)" }}>
          {people.length ? people.map((p) => p.name).join(", ") : <span style={{ color: "var(--sw-muted)" }}>—</span>}
        </div>
        <div style={{ fontSize: 9.5, color: "var(--sw-muted)" }}>{meaning}</div>
      </span>
    </div>
  );

  return (
    <span
      style={{ display: "flex", alignItems: "center", position: "relative" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {a && dot(a, aSize, true)}
      {r && dot(r, rSize, false)}
      {!r && !a && <span style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>—</span>}

      {hover && (r || a || c.length || i.length) && (
        <span
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 70, width: 232,
            background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 10,
            boxShadow: "0 14px 40px rgba(23,18,15,.20)", padding: "9px 11px", cursor: "default",
            textAlign: "left",
          }}
        >
          {line("R", "does the work — exactly one person", r ? [r] : [])}
          {line("A", "answerable for the outcome", a ? [a] : (r ? [r] : []))}
          {line("C", `consulted before decisions${c.length ? ` · ${c.length}` : ""}`, c)}
          {line("I", `kept informed${i.length ? ` · ${i.length}` : ""}`, i)}
        </span>
      )}
    </span>
  );
}
