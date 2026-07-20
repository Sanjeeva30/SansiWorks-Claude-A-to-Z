"use client";
import React from "react";
import { Profile } from "@/lib/types";
import { AssigneePicker } from "./assignee-picker";
import { DifficultyPicker } from "./difficulty";
import { RaciRows, RaciValue, raciNote } from "./raci";
import { accountableCandidates } from "@/lib/actions";
import { useStore } from "@/lib/store";
import { IconX } from "./icons";

export interface SubtaskDraft {
  id: string;
  name: string;
  assignee_id: string | null;
  due: string;
  reminder: string;
  raci: RaciValue;
  difficulty: number | null;
}

export const blankSubtaskDraft = (): SubtaskDraft => ({
  id: Math.random().toString(36).slice(2),
  name: "", assignee_id: null, due: "", reminder: "", raci: { a: null, c: [], i: [] }, difficulty: null,
});

/* Same fields as a top-level task — assignee (R), due date, full RACI (A/C/I), and a
   reminder — rendered identically wherever a subtask is created.
   Unlike the main task, a subtask's R is NOT scoped to the main task's department —
   multi-person work often needs a subtask done by someone in a completely different
   department, so the picker shows the whole organisation by default. Once that R is
   picked, Accountable narrows to that R's own department peers/superiors — computed
   fresh per subtask, independent of the main task's A. */
export function SubtaskFields({
  draft, onChange, onRemove, personal, deptLabel,
}: {
  draft: SubtaskDraft;
  onChange: (d: SubtaskDraft) => void;
  onRemove: () => void;
  personal: boolean;
  deptLabel: (p: Profile) => string | null;
}) {
  const store = useStore();
  const { me, profiles } = store;
  if (!me) return null;
  const aCands = accountableCandidates(store, draft.assignee_id);

  return (
    <div style={{ border: "1px solid var(--sw-hair)", borderRadius: 11, marginBottom: 10, background: "var(--sw-card)", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Subtask name…"
          style={{ flex: 1, border: "none", borderBottom: "1.5px solid var(--sw-hair)", background: "none", outline: "none", fontSize: 13, color: "var(--sw-text)", padding: "4px 2px", minWidth: 0 }}
        />
        <button onClick={onRemove} title="Remove subtask" style={{ border: "none", background: "none", color: "var(--sw-muted)", cursor: "pointer", padding: 2, display: "flex", flex: "none" }}><IconX /></button>
      </div>

      <div className="sw-grid-2" style={{ gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginBottom: 5 }}>Assignee (R)</div>
          <AssigneePicker
            personal={personal}
            me={me}
            value={draft.assignee_id}
            onChange={(id) => onChange({ ...draft, assignee_id: id, raci: id === draft.assignee_id ? draft.raci : { ...draft.raci, a: draft.raci.a === id ? null : draft.raci.a } })}
            deptScoped={profiles}
            allProfiles={profiles}
            deptLabel={deptLabel}
            placeholder="Anyone in the organisation — subtasks aren't limited to the main task's department…"
            compact
          />
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginBottom: 5 }}>Due date</div>
          <input type="date" value={draft.due} onChange={(e) => onChange({ ...draft, due: e.target.value })}
            style={{ width: "100%", height: 30, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 12, color: "var(--sw-text-soft)", padding: "0 8px", boxSizing: "border-box" }} />
        </div>
      </div>

      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginBottom: 5 }}>RACI — {raciNote(personal)}</div>
        <RaciRows
          profiles={profiles}
          aCandidates={aCands}
          deptLabel={deptLabel}
          personal={personal}
          value={draft.raci}
          onChange={(v) => onChange({ ...draft, raci: v })}
        />
      </div>

      <div className="sw-grid-2" style={{ gap: 10, marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginBottom: 5 }}>Reminder</div>
          <input type="datetime-local" value={draft.reminder} onChange={(e) => onChange({ ...draft, reminder: e.target.value })}
            style={{ width: "100%", height: 28, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11.5, color: "var(--sw-text)", padding: "0 8px", boxSizing: "border-box" }} />
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginBottom: 5 }}>Difficulty (optional)</div>
          <DifficultyPicker value={draft.difficulty} onChange={(v) => onChange({ ...draft, difficulty: v })} compact />
        </div>
      </div>
    </div>
  );
}
