"use client";
import React, { useState } from "react";
import { Task, Profile } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { notify, updateTask, requestDueDate } from "@/lib/actions";
import { AssigneePicker } from "./assignee-picker";

/* Inline actions on an at-risk row.

   The Overview answered "how are we doing?" well and then made you leave the
   page to do anything about it — so the answer and the action lived in
   different places, and the slower one usually won. Nudging, reassigning and
   granting time are the three things anyone actually does about a slipping
   task, and all three already had plumbing (notifications, updateTask, the
   approvals queue); none of it was reachable from here. */
export function RiskActions({ task, owner }: { task: Task; owner: Profile | undefined }) {
  const store = useStore();
  const { me, profiles, supabase, patch, tasks } = store;
  const { pushToast } = useUI();
  const [mode, setMode] = useState<null | "reassign" | "extend">(null);
  const [busy, setBusy] = useState(false);

  if (!me) return null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const btn: React.CSSProperties = {
    fontSize: 10.5, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
    border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)",
    whiteSpace: "nowrap",
  };

  const nudge = async () => {
    if (!owner || owner.id === me.id) { pushToast("That's your own task — no one to nudge."); return; }
    setBusy(true);
    await notify(supabase, owner.id, task.id, `${me.name} flagged "${task.name}" as at risk — can you update it?`, "nudge");
    // Email as well as in-app, using the alert route that already respects
    // each person's channel preferences.
    await fetch("/api/notify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "assigned", taskId: task.id }),
    }).catch(() => null);
    setBusy(false);
    pushToast(`Nudged ${owner.name.split(" ")[0]}`);
  };

  const extend = async (days: number) => {
    const base = task.due ? new Date(`${task.due}T12:00:00Z`) : new Date();
    base.setUTCDate(base.getUTCDate() + days);
    const requested = base.toISOString().slice(0, 10);
    setBusy(true);
    const res = await requestDueDate(supabase, store, patch, task, me, requested, `Flagged at risk on the Overview — asking for ${days} more days`);
    setBusy(false);
    setMode(null);
    pushToast(res ? `Extension to ${requested} sent for approval` : "Couldn't raise that request.");
  };

  return (
    <span onClick={stop} style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
      {mode === null && (
        <>
          <button style={btn} disabled={busy} onClick={nudge} title={owner ? `Alert ${owner.name} in-app and by email` : "No assignee"}>Nudge</button>
          <button style={btn} disabled={busy} onClick={() => setMode("reassign")}>Reassign</button>
          <button style={btn} disabled={busy} onClick={() => setMode("extend")}>Give time</button>
        </>
      )}

      {mode === "extend" && (
        <>
          <span style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>Request</span>
          {[3, 7, 14].map((d) => (
            <button key={d} style={btn} disabled={busy} onClick={() => extend(d)}>+{d}d</button>
          ))}
          <button style={{ ...btn, border: "none" }} onClick={() => setMode(null)}>Cancel</button>
        </>
      )}

      {mode === "reassign" && (
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 220 }}>
          <span style={{ flex: 1, minWidth: 160 }}>
            <AssigneePicker
              compact
              personal={false}
              me={me}
              value={task.assignee_id || ""}
              onChange={async (id) => {
                if (!id) return; // clearing the assignee isn't a reassignment
                setBusy(true);
                await updateTask(supabase, tasks, patch, task.id, { assignee_id: id });
                await notify(supabase, id, task.id, `${me.name} reassigned "${task.name}" to you from the Overview`, "assignment");
                setBusy(false);
                setMode(null);
                pushToast(`Reassigned to ${profiles.find((p) => p.id === id)?.name.split(" ")[0] || "them"}`);
              }}
              deptScoped={profiles}
              allProfiles={profiles}
              deptLabel={() => ""}
              placeholder="Reassign to…"
            />
          </span>
          <button style={{ ...btn, border: "none" }} onClick={() => setMode(null)}>Cancel</button>
        </span>
      )}
    </span>
  );
}
