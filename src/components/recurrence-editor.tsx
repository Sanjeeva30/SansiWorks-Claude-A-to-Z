"use client";
import React, { useState } from "react";
import {
  type Recurrence, type Freq, DEFAULT_RECURRENCE, describeRecurrence, WEEKDAY_LABELS,
} from "@/lib/recurrence";

/* The repeat control used by quick-add and the task detail panel.

   The old control offered four words (Doesn't repeat / Daily / Weekly /
   Monthly). Almost no real schedule is one of those four: "every other Tuesday",
   "the last Friday of the month", "every weekday", "weekly until the audit" all
   had to be faked by hand. This builds the whole rule and always shows the
   plain-English result, because a repeat rule you can't read back is a repeat
   rule you don't trust. */

const FREQS: { value: Freq; label: string; unit: string }[] = [
  { value: "daily", label: "Daily", unit: "day" },
  { value: "weekly", label: "Weekly", unit: "week" },
  { value: "monthly", label: "Monthly", unit: "month" },
  { value: "yearly", label: "Yearly", unit: "year" },
];

const NTH_OPTIONS = [
  { value: 1, label: "first" }, { value: 2, label: "second" }, { value: 3, label: "third" },
  { value: 4, label: "fourth" }, { value: -1, label: "last" },
];

const fieldSt: React.CSSProperties = {
  height: 30, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)",
  fontSize: 12, color: "var(--sw-text)", padding: "0 8px",
};
const labelSt: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
  color: "var(--sw-muted)", marginBottom: 6,
};

export function RecurrenceEditor({
  value, onChange, presetWeekday,
}: {
  value: Recurrence | null;
  onChange: (r: Recurrence | null) => void;
  /** Weekday of the task's due date, so "Weekly" preselects the right chip. */
  presetWeekday?: number;
}) {
  const [open, setOpen] = useState(false);
  const rule = value;

  const set = (patch: Partial<Recurrence>) => onChange({ ...(rule || DEFAULT_RECURRENCE), ...patch });

  const enable = (freq: Freq) => {
    if (freq === "weekly" && presetWeekday !== undefined) {
      onChange({ ...DEFAULT_RECURRENCE, freq, byWeekday: [presetWeekday] });
    } else {
      onChange({ ...DEFAULT_RECURRENCE, freq });
    }
  };

  const unit = FREQS.find((f) => f.value === rule?.freq)?.unit || "week";
  const ends = rule?.ends || { type: "never" as const };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          width: "100%", height: "var(--sw-field-h, 38px)", borderRadius: 10,
          border: `1.5px solid ${open ? "var(--crimson)" : "var(--sw-hair)"}`,
          background: "var(--sw-hover)", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 8, padding: "0 14px", fontSize: 13,
          color: rule ? "var(--sw-text)" : "var(--sw-text-soft)", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {describeRecurrence(rule)}
        </span>
        <span style={{ color: "var(--sw-muted)", fontSize: 10, flex: "none" }}>▾</span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, minWidth: 300,
            background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12,
            boxShadow: "var(--shadow-card-hover)", padding: 14, zIndex: 60,
            maxHeight: 400, overflowY: "auto",
          }}
        >
          {/* Frequency */}
          <div style={labelSt}>Repeats</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            <button type="button" onClick={() => onChange(null)}
              style={chip(!rule)}>Never</button>
            {FREQS.map((f) => (
              <button key={f.value} type="button" onClick={() => enable(f.value)}
                style={chip(rule?.freq === f.value)}>{f.label}</button>
            ))}
          </div>

          {rule && (
            <>
              {/* Interval */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: "var(--sw-text-soft)" }}>Every</span>
                <input
                  type="number" min={1} max={365} value={rule.interval || 1}
                  onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
                  style={{ ...fieldSt, width: 62 }}
                />
                <span style={{ fontSize: 12, color: "var(--sw-text-soft)" }}>
                  {(rule.interval || 1) === 1 ? unit : `${unit}s`}
                </span>
              </div>

              {/* Weekly: which days */}
              {rule.freq === "weekly" && (
                <div style={{ marginBottom: 14 }}>
                  <div style={labelSt}>On these days</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {WEEKDAY_LABELS.map((lbl, i) => {
                      const on = (rule.byWeekday || []).includes(i);
                      return (
                        <button
                          key={i} type="button"
                          onClick={() => {
                            const cur = rule.byWeekday || [];
                            set({ byWeekday: on ? cur.filter((d) => d !== i) : [...cur, i].sort((a, b) => a - b) });
                          }}
                          title={lbl}
                          style={{
                            width: 30, height: 30, borderRadius: 99, fontSize: 11,
                            border: `1px solid ${on ? "var(--crimson)" : "var(--sw-hair)"}`,
                            background: on ? "var(--crimson)" : "var(--sw-hover)",
                            color: on ? "#fff" : "var(--sw-text-soft)", cursor: "pointer",
                          }}
                        >{lbl[0]}</button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => set({ byWeekday: [1, 2, 3, 4, 5] })}
                    style={{ marginTop: 8, border: "none", background: "none", padding: 0, fontSize: 11.5, color: "var(--sw-on-crimson)", cursor: "pointer" }}
                  >Every weekday (Mon–Fri)</button>
                </div>
              )}

              {/* Monthly: by date or by nth weekday */}
              {rule.freq === "monthly" && (
                <div style={{ marginBottom: 14 }}>
                  <div style={labelSt}>Monthly pattern</div>
                  <label style={radioRow}>
                    <input type="radio" checked={rule.monthlyMode !== "nthWeekday"}
                      onChange={() => set({ monthlyMode: "dayOfMonth" })} />
                    <span>On the same date each month</span>
                  </label>
                  <label style={radioRow}>
                    <input type="radio" checked={rule.monthlyMode === "nthWeekday"}
                      onChange={() => set({ monthlyMode: "nthWeekday", nth: rule.nth ?? 1, weekday: rule.weekday ?? (presetWeekday ?? 1) })} />
                    <span>On the</span>
                  </label>
                  {rule.monthlyMode === "nthWeekday" && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, marginLeft: 22 }}>
                      <select style={fieldSt} value={rule.nth ?? 1}
                        onChange={(e) => set({ nth: Number(e.target.value) })}>
                        {NTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <select style={fieldSt} value={rule.weekday ?? 1}
                        onChange={(e) => set({ weekday: Number(e.target.value) })}>
                        {WEEKDAY_LABELS.map((lbl, i) => <option key={i} value={i}>{lbl}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* End condition */}
              <div style={{ marginBottom: 14 }}>
                <div style={labelSt}>Ends</div>
                <label style={radioRow}>
                  <input type="radio" checked={ends.type === "never"}
                    onChange={() => set({ ends: { type: "never" } })} />
                  <span>Never</span>
                </label>
                <label style={radioRow}>
                  <input type="radio" checked={ends.type === "after"}
                    onChange={() => set({ ends: { type: "after", count: ends.count ?? 10 } })} />
                  <span>After</span>
                  <input
                    type="number" min={1} max={999} value={ends.count ?? 10}
                    disabled={ends.type !== "after"}
                    onChange={(e) => set({ ends: { type: "after", count: Math.max(1, Number(e.target.value) || 1) } })}
                    style={{ ...fieldSt, width: 62, opacity: ends.type === "after" ? 1 : 0.5 }}
                  />
                  <span>times</span>
                </label>
                <label style={radioRow}>
                  <input type="radio" checked={ends.type === "on"}
                    onChange={() => set({ ends: { type: "on", date: ends.date || "" } })} />
                  <span>On</span>
                  <input
                    type="date" value={ends.date || ""}
                    disabled={ends.type !== "on"}
                    onChange={(e) => set({ ends: { type: "on", date: e.target.value } })}
                    style={{ ...fieldSt, opacity: ends.type === "on" ? 1 : 0.5 }}
                  />
                </label>
              </div>

              {/* Modifiers */}
              <label style={{ ...radioRow, marginBottom: 4 }}>
                <input type="checkbox" checked={!!rule.skipWeekends}
                  onChange={(e) => set({ skipWeekends: e.target.checked })} />
                <span>Skip weekends (move to Monday)</span>
              </label>
              <label style={radioRow} title="Useful for chores: 'every 3 days after I last did it', rather than a fixed calendar slot.">
                <input type="checkbox" checked={rule.anchor === "completion"}
                  onChange={(e) => set({ anchor: e.target.checked ? "completion" : "due" })} />
                <span>Count from the day it&apos;s completed</span>
              </label>

              {/* Plain-English echo of whatever was just built */}
              <div style={{
                marginTop: 12, padding: "9px 11px", borderRadius: 8,
                background: "var(--sw-hover)", border: "1px solid var(--sw-hair)",
                fontSize: 11.5, color: "var(--sw-text-soft)", lineHeight: 1.5,
              }}>
                {describeRecurrence(rule)}
                <div style={{ marginTop: 4, color: "var(--sw-muted)" }}>
                  The next occurrence is created when this one is marked Done.
                </div>
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => setOpen(false)}
              style={{ padding: "7px 16px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 12, cursor: "pointer" }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const radioRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 7, fontSize: 12,
  color: "var(--sw-text)", padding: "4px 0", cursor: "pointer",
};

function chip(active: boolean): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 999, fontSize: 11.5, cursor: "pointer",
    border: `1px solid ${active ? "var(--crimson)" : "var(--sw-hair)"}`,
    background: active ? "var(--crimson)" : "var(--sw-hover)",
    color: active ? "#fff" : "var(--sw-text-soft)",
  };
}
