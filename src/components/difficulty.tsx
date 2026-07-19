"use client";
import React from "react";
import { DIFFICULTY_LEVELS } from "@/lib/types";

const DOT_COLOR: Record<number, string> = {
  1: "var(--sw-muted)", 2: "var(--green)", 3: "var(--navy)", 4: "#B7791F", 5: "var(--crimson)",
};

/* 5-step difficulty picker — Trivial..Complex. Used identically at task and
   subtask creation, and (read+edit, permission-gated) in the detail views. */
export function DifficultyPicker({
  value, onChange, disabled, lockedReason, compact,
}: {
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
  lockedReason?: string;
  compact?: boolean;
}) {
  return (
    <div title={disabled ? lockedReason : undefined}>
      <select
        className="sw-select"
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          height: compact ? 30 : "var(--sw-field-h)", borderRadius: 9, border: "1.5px solid var(--sw-hair)",
          background: disabled ? "var(--sw-hover)" : "var(--sw-card)", padding: "0 8px",
          fontSize: compact ? 12 : 13, color: value ? DOT_COLOR[value] : "var(--sw-muted)",
          opacity: disabled ? 0.7 : 1, cursor: disabled ? "not-allowed" : "pointer", width: "100%",
        }}
      >
        <option value="">Difficulty — unset</option>
        {DIFFICULTY_LEVELS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      {disabled && lockedReason && (
        <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginTop: 3 }}>{lockedReason}</div>
      )}
    </div>
  );
}

export function DifficultyBadge({ value }: { value: number | null }) {
  if (!value) return null;
  const d = DIFFICULTY_LEVELS.find((x) => x.value === value);
  if (!d) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: DOT_COLOR[value] }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: DOT_COLOR[value] }} />
      {d.label}
    </span>
  );
}
