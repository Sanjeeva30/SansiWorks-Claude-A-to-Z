"use client";
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { updateReminder, deleteReminder } from "@/lib/actions";
import { IconX } from "./icons";

const SNOOZES: { label: string; minutes: number | "tomorrow" }[] = [
  { label: "10 minutes", minutes: 10 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "Tomorrow 09:00", minutes: "tomorrow" },
];

/* Watches the user's reminders; when one comes due it flips to `fired` and pops a
   card (bottom-right) with Open / Snooze / Edit / Dismiss — until acted upon. */
export function ReminderEngine() {
  const store = useStore();
  const { reminders, tasks, subtasks, patch, supabase } = store;
  const { setActiveTaskId } = useUI();
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const firing = useRef(false);

  // promote due reminders to `fired`
  useEffect(() => {
    const tick = async () => {
      if (firing.current) return;
      firing.current = true;
      try {
        const now = new Date().toISOString();
        const due = reminders.filter((r) => r.status === "pending" && r.remind_at <= now);
        for (const r of due) await updateReminder(supabase, store, patch, r.id, { status: "fired" });
      } finally {
        firing.current = false;
      }
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, [reminders, supabase, store, patch]);

  const active = reminders.filter((r) => r.status === "fired").slice(0, 3);
  if (!active.length) return null;

  const snooze = (id: string, m: number | "tomorrow") => {
    const d = new Date();
    if (m === "tomorrow") { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    else d.setMinutes(d.getMinutes() + m);
    updateReminder(supabase, store, patch, id, { remind_at: d.toISOString(), status: "pending" });
    setSnoozeFor(null);
  };

  return (
    <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 70, display: "flex", flexDirection: "column", gap: 10, width: 330, maxWidth: "90vw" }}>
      {active.map((r) => {
        const task = tasks.find((t) => t.id === r.task_id);
        const sub = subtasks.find((s) => s.id === r.subtask_id);
        const openId = sub ? sub.task_id : task?.id;
        return (
          <div key={r.id} style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderLeft: "4px solid var(--crimson)", borderRadius: 13, boxShadow: "0 22px 60px rgba(23,18,15,.3)", padding: "13px 15px", animation: "swModalIn .2s var(--ease-brand)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
              <span style={{ fontSize: 15, lineHeight: 1, marginTop: 1 }}>⏰</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 1 }}>Reminder</div>
                <div style={{ fontSize: 12.5, color: "var(--sw-text)", lineHeight: 1.4 }}>{r.title}</div>
                {(task || sub) && (
                  <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginTop: 2 }}>
                    {sub ? `Subtask of SW-${tasks.find((t) => t.id === sub.task_id)?.task_number ?? "?"}` : `Task SW-${task?.task_number}`}
                  </div>
                )}
              </div>
              <button onClick={() => updateReminder(supabase, store, patch, r.id, { status: "dismissed" })} title="Dismiss" style={{ border: "none", background: "var(--sw-hover)", width: 22, height: 22, borderRadius: 99, cursor: "pointer", color: "var(--sw-text-soft)", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={10} /></button>
            </div>

            {editFor === r.id ? (
              <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                <input type="datetime-local" value={editVal} onChange={(e) => setEditVal(e.target.value)} style={{ flex: 1, height: 28, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11, padding: "0 8px", color: "var(--sw-text)" }} />
                <button
                  onClick={() => { if (editVal) updateReminder(supabase, store, patch, r.id, { remind_at: new Date(editVal).toISOString(), status: "pending" }); setEditFor(null); }}
                  style={{ border: "none", background: "var(--crimson)", color: "#fff", borderRadius: 999, padding: "0 12px", fontSize: 11, cursor: "pointer" }}
                >Save</button>
              </div>
            ) : snoozeFor === r.id ? (
              <div style={{ display: "flex", gap: 5, marginTop: 9, flexWrap: "wrap" }}>
                {SNOOZES.map((s) => (
                  <button key={s.label} onClick={() => snooze(r.id, s.minutes)} style={{ border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", borderRadius: 999, padding: "4px 10px", fontSize: 10.5, cursor: "pointer", color: "var(--sw-text)" }}>{s.label}</button>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                {openId && (
                  <button onClick={() => { setActiveTaskId(openId); updateReminder(supabase, store, patch, r.id, { status: "dismissed" }); }} style={{ border: "none", background: "var(--crimson)", color: "#fff", borderRadius: 999, padding: "5px 13px", fontSize: 11, cursor: "pointer" }}>Open</button>
                )}
                <button onClick={() => setSnoozeFor(r.id)} style={{ border: "1px solid var(--sw-hair)", background: "none", borderRadius: 999, padding: "5px 13px", fontSize: 11, cursor: "pointer", color: "var(--sw-text)" }}>Snooze</button>
                <button onClick={() => { setEditFor(r.id); setEditVal(r.remind_at.slice(0, 16)); }} style={{ border: "1px solid var(--sw-hair)", background: "none", borderRadius: 999, padding: "5px 13px", fontSize: 11, cursor: "pointer", color: "var(--sw-text)" }}>Edit</button>
                <button onClick={() => deleteReminder(supabase, store, patch, r.id)} style={{ border: "none", background: "none", color: "var(--sw-muted)", fontSize: 11, cursor: "pointer", padding: "5px 6px" }}>Delete</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Compact reminder row for the task drawer — shows the viewer's reminder on this
   task/subtask with edit & delete, or an add control. */
export function ReminderInline({ taskId, subtaskId, title }: { taskId: string | null; subtaskId?: string | null; title: string }) {
  const store = useStore();
  const { me, reminders, patch, supabase } = store;
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState("");
  if (!me) return null;
  const mine = reminders.find((r) => (subtaskId ? r.subtask_id === subtaskId : r.task_id === taskId && !r.subtask_id) && r.status !== "dismissed");

  const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  if (mine) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--sw-text-soft)" }}>
        ⏰ {fmt(mine.remind_at)}
        <input
          type="datetime-local"
          value={mine.remind_at.slice(0, 16)}
          onChange={(e) => e.target.value && updateReminder(supabase, store, patch, mine.id, { remind_at: new Date(e.target.value).toISOString(), status: "pending" })}
          title="Edit reminder"
          style={{ width: 18, height: 18, opacity: 0.55, border: "none", background: "none", cursor: "pointer", padding: 0 }}
        />
        <button onClick={() => deleteReminder(supabase, store, patch, mine.id)} title="Delete reminder" style={{ border: "none", background: "none", cursor: "pointer", color: "var(--sw-muted)", padding: 0, display: "flex" }}><IconX size={9} /></button>
      </span>
    );
  }
  if (adding) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)} style={{ height: 26, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 10.5, padding: "0 7px", color: "var(--sw-text)" }} />
        <button
          onClick={async () => {
            if (!val) return;
            const { createReminder } = await import("@/lib/actions");
            await createReminder(supabase, store, patch, { profile_id: me.id, task_id: taskId, subtask_id: subtaskId || null, title, remind_at: new Date(val).toISOString() });
            setAdding(false); setVal("");
          }}
          style={{ border: "none", background: "var(--crimson)", color: "#fff", borderRadius: 999, padding: "4px 11px", fontSize: 10.5, cursor: "pointer" }}
        >Set</button>
        <button onClick={() => setAdding(false)} style={{ border: "none", background: "none", color: "var(--sw-muted)", fontSize: 10.5, cursor: "pointer" }}>Cancel</button>
      </span>
    );
  }
  return (
    <button onClick={() => setAdding(true)} style={{ border: "1px dashed var(--sw-hair)", background: "none", borderRadius: 999, padding: "3px 10px", fontSize: 10.5, color: "var(--sw-text-soft)", cursor: "pointer" }}>
      ⏰ Remind me
    </button>
  );
}
