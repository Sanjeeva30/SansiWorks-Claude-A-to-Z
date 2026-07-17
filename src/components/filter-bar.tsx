"use client";
import React, { useEffect, useRef, useState } from "react";
import { Profile, STATUSES, PRIORITIES, STATUS_COLORS, PRIORITY_COLORS, initials } from "@/lib/types";
import { FilterState, EMPTY_FILTERS, countActiveFilters, DUE_LABELS, EFFORT_LABELS } from "@/lib/search";
import { IconChevDown, IconX } from "./icons";

/* One popover-chip. Children render the popover body. */
function Chip({
  label, active, activeLabel, children, onClear,
}: {
  label: string;
  active: boolean;
  activeLabel?: string;
  children: React.ReactNode;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 999, border: `1px solid ${active ? "var(--crimson)" : "var(--sw-hair)"}`, background: active ? "rgba(122,13,32,0.07)" : "var(--sw-hover)", color: active ? "var(--crimson)" : "var(--sw-text-soft)", fontSize: 11.5, fontWeight: 400, cursor: "pointer", whiteSpace: "nowrap" }}
      >
        {active && activeLabel ? activeLabel : label}
        {active && onClear ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onClear(); setOpen(false); }}
            style={{ display: "flex", marginLeft: 1, opacity: 0.8 }}
          >
            <IconX size={9} />
          </span>
        ) : (
          <IconChevDown size={10} />
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 190, background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 11, boxShadow: "0 18px 50px rgba(23,18,15,.22)", zIndex: 50, padding: 6, maxHeight: 280, overflowY: "auto" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function CheckRow({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onToggle}
      style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "7px 9px", border: "none", borderRadius: 7, background: "none", cursor: "pointer", fontSize: 12, color: "var(--sw-text)" }}
      className="sw-row"
    >
      <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${checked ? "var(--crimson)" : "var(--sw-hair)"}`, background: checked ? "var(--crimson)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        {checked && <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>}
      </span>
      {children}
    </button>
  );
}

export function FilterBar({
  value, onChange, people, resultCount, extra,
}: {
  value: FilterState;
  onChange: (f: FilterState) => void;
  people: Profile[];
  resultCount: number;
  extra?: React.ReactNode; // right-hand extras (density toggle, save-view etc.)
}) {
  const f = value;
  const toggle = (key: "assignees" | "statuses" | "priorities", v: string) => {
    const cur = f[key];
    onChange({ ...f, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const n = countActiveFilters(f);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input
        value={f.text}
        onChange={(e) => onChange({ ...f, text: e.target.value })}
        placeholder="Filter by name…"
        style={{ width: 180, height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 12, color: "var(--sw-text)", outline: "none" }}
      />

      <Chip
        label="Assignee"
        active={f.assignees.length > 0}
        activeLabel={f.assignees.length === 1 ? people.find((p) => p.id === f.assignees[0])?.name.split(" ")[0] || "1 person" : `${f.assignees.length} people`}
        onClear={() => onChange({ ...f, assignees: [] })}
      >
        {people.map((p) => (
          <CheckRow key={p.id} checked={f.assignees.includes(p.id)} onToggle={() => toggle("assignees", p.id)}>
            <span style={{ width: 18, height: 18, borderRadius: 99, background: p.color, color: "#fff", fontSize: 7.5, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{initials(p.name)}</span>
            {p.name}
          </CheckRow>
        ))}
      </Chip>

      <Chip
        label="Status"
        active={f.statuses.length > 0}
        activeLabel={f.statuses.length === 1 ? f.statuses[0] : `${f.statuses.length} statuses`}
        onClear={() => onChange({ ...f, statuses: [] })}
      >
        {STATUSES.map((s) => (
          <CheckRow key={s} checked={f.statuses.includes(s)} onToggle={() => toggle("statuses", s)}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_COLORS[s], flex: "none" }} />
            {s}
          </CheckRow>
        ))}
      </Chip>

      <Chip
        label="Priority"
        active={f.priorities.length > 0}
        activeLabel={f.priorities.length === 1 ? f.priorities[0] : `${f.priorities.length} priorities`}
        onClear={() => onChange({ ...f, priorities: [] })}
      >
        {PRIORITIES.map((p) => (
          <CheckRow key={p} checked={f.priorities.includes(p)} onToggle={() => toggle("priorities", p)}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: PRIORITY_COLORS[p], flex: "none" }} />
            {p}
          </CheckRow>
        ))}
      </Chip>

      <Chip
        label="Due"
        active={!!f.due}
        activeLabel={DUE_LABELS[f.due] || "Due"}
        onClear={() => onChange({ ...f, due: "" })}
      >
        {(Object.keys(DUE_LABELS) as (keyof typeof DUE_LABELS)[]).map((k) => (
          <CheckRow key={k} checked={f.due === k} onToggle={() => onChange({ ...f, due: f.due === k ? "" : (k as FilterState["due"]) })}>
            {DUE_LABELS[k]}
          </CheckRow>
        ))}
      </Chip>

      <Chip
        label="Effort"
        active={!!f.effort}
        activeLabel={EFFORT_LABELS[f.effort] || "Effort"}
        onClear={() => onChange({ ...f, effort: "" })}
      >
        {(Object.keys(EFFORT_LABELS) as (keyof typeof EFFORT_LABELS)[]).map((k) => (
          <CheckRow key={k} checked={f.effort === k} onToggle={() => onChange({ ...f, effort: f.effort === k ? "" : (k as FilterState["effort"]) })}>
            {EFFORT_LABELS[k]}
          </CheckRow>
        ))}
      </Chip>

      {n > 0 && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          style={{ border: "none", background: "none", color: "var(--sw-muted)", fontSize: 11.5, fontWeight: 400, cursor: "pointer", padding: "6px 4px" }}
        >
          Clear all
        </button>
      )}

      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11.5, color: "var(--sw-muted)", fontWeight: 400 }}>{resultCount} tasks</span>
      {extra}
    </div>
  );
}
