"use client";
import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { initials, STATUS_COLORS, PRIORITY_COLORS, Status, Priority, Task } from "@/lib/types";
import { updateTask, managerOf } from "@/lib/actions";
import { relTime } from "@/lib/dates";
import { taskLink } from "@/lib/ui";
import { RaciRows, raciNote } from "./raci";
import { IconLink, IconX } from "./icons";
import { Avatar } from "./shared";

// Task detail slide-over (list variant with Details / Activity / Files tabs)
export function TaskDetailSlideOver() {
  const { activeTaskId, setActiveTaskId, pushToast, openProfile } = useUI();
  const store = useStore();
  const { tasks, profiles, lists, spaces, activity, patch, supabase } = store;
  const [tab, setTab] = useState<"details" | "activity" | "files">("details");
  const t = tasks.find((x) => x.id === activeTaskId);
  if (!t) return null;

  const list = lists.find((l) => l.id === t.list_id);
  const space = spaces.find((s) => s.id === list?.space_id);
  const listPath = t.list_id ? `${space?.name || ""} / ${list?.name || ""}` : "My List (personal)";
  const personal = !t.list_id;
  const taskActivity = activity.filter((a) => a.task_id === t.id);

  const set = (fields: Partial<Task>, toast?: string) => {
    const prev = tasks;
    updateTask(supabase, tasks, patch, t.id, fields);
    if (toast) pushToast(toast, () => patch("tasks", prev));
  };

  const autoA = managerOf(profiles, t.assignees[0]);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "activity", label: "Activity" },
    { key: "files", label: "Files" },
  ];

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.4)", zIndex: 40 }} onClick={() => setActiveTaskId(null)} />
      <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 520, maxWidth: "94vw", background: "var(--sw-card)", boxShadow: "-24px 0 60px rgba(23,18,15,.25)", zIndex: 41, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--sw-hair)", flex: "none" }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_COLORS[t.status], flex: "none" }} />
          <span style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-muted)" }}>SW-{t.task_number}</span>
          <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--sw-text-soft)" }}>{listPath}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => {
              try { navigator.clipboard.writeText(taskLink(t.task_number)); pushToast("Task link copied"); } catch {}
            }}
            title="Copy link to this task"
            style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", height: 28, padding: "0 11px", borderRadius: 99, cursor: "pointer", fontSize: 11, color: "var(--sw-text-soft)" }}
          >
            <IconLink size={11} /> Copy link
          </button>
          <button onClick={() => setActiveTaskId(null)} style={{ border: "none", background: "var(--sw-hover)", width: 28, height: 28, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
        </div>

        <div style={{ display: "flex", gap: 4, padding: "0 20px", borderBottom: "1px solid var(--sw-hair)", flex: "none" }}>
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              style={{ padding: "10px 12px", border: "none", background: "none", borderBottom: `2px solid ${tab === tb.key ? "var(--crimson)" : "transparent"}`, color: tab === tb.key ? "var(--sw-text)" : "var(--sw-text-soft)", fontSize: 12.5, fontWeight: 400, cursor: "pointer", marginBottom: -1 }}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {tab === "details" && (
            <>
              <h2 style={{ margin: "0 0 16px", fontSize: 19, fontWeight: 800, lineHeight: 1.3 }}>{t.name}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: "12px 10px", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)" }}>Status</span>
                <select
                  className="sw-select"
                  value={t.status}
                  onChange={(e) => set({ status: e.target.value as Status }, `Status changed to ${e.target.value}`)}
                  style={{ width: "auto", height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12.5, fontWeight: 400, color: STATUS_COLORS[t.status], justifySelf: "start" }}
                >
                  <option>Not Started</option><option>Working on it</option><option>Stuck</option><option>Done</option>
                </select>

                <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)" }}>Priority</span>
                <select
                  className="sw-select"
                  value={t.priority}
                  onChange={(e) => set({ priority: e.target.value as Priority })}
                  style={{ width: "auto", height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12.5, fontWeight: 400, color: PRIORITY_COLORS[t.priority], justifySelf: "start" }}
                >
                  <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                </select>

                <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)" }}>Assignees</span>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {profiles.map((p) => {
                    const on = t.assignees.includes(p.id);
                    if (!on) return null;
                    return (
                      <button
                        key={p.id}
                        onClick={() => set({ assignees: t.assignees.filter((x) => x !== p.id) })}
                        title="Toggle assignee"
                        style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(122,13,32,0.06)", border: "1px solid var(--crimson)", borderRadius: 999, padding: "3px 9px 3px 3px", cursor: "pointer" }}
                      >
                        <span style={{ width: 18, height: 18, borderRadius: 99, background: p.color, color: "#fff", fontSize: 8, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(p.name)}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--crimson)" }}>{p.name.split(" ")[0]}</span>
                      </button>
                    );
                  })}
                  {profiles.filter((p) => !t.assignees.includes(p.id)).slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => set({ assignees: [...t.assignees, p.id] })}
                      title="Toggle assignee"
                      style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "3px 9px 3px 3px", cursor: "pointer" }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: 99, background: p.color, color: "#fff", fontSize: 8, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(p.name)}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--sw-text-soft)" }}>{p.name.split(" ")[0]}</span>
                    </button>
                  ))}
                </span>

                <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6, margin: "2px 0 4px" }}>
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-muted)" }}>{`RACI — ${raciNote(personal)}`}</span>
                  <RaciRows
                    profiles={profiles}
                    personal={personal}
                    autoA={autoA}
                    value={{ a: t.accountable_id, c: t.raci_c, i: t.raci_i }}
                    onChange={(v) => set({ accountable_id: v.a, raci_c: v.c, raci_i: v.i })}
                  />
                </div>

                <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)" }}>Due date</span>
                <input
                  type="date"
                  value={t.due || ""}
                  onChange={(e) => set({ due: e.target.value })}
                  style={{ width: "auto", height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12.5, fontWeight: 400, color: "var(--sw-text)", justifySelf: "start" }}
                />

                <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)" }}>Effort</span>
                <span style={{ fontSize: 12.5, fontWeight: 400 }}>{t.effort} pts</span>
              </div>

              <div style={{ height: 1, background: "var(--sw-hair)", margin: "16px 0" }} />
              <div style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)", marginBottom: 6 }}>Description</div>
              <textarea
                defaultValue={t.description || ""}
                onBlur={(e) => { if (e.target.value !== (t.description || "")) set({ description: e.target.value }); }}
                style={{ width: "100%", height: 90, resize: "vertical", borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "10px 12px", fontSize: 13, lineHeight: 1.55, fontFamily: "var(--font-sans)", color: "var(--sw-text-soft)", outline: "none" }}
              />
            </>
          )}

          {tab === "activity" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {taskActivity.map((ev) => {
                const who = profiles.find((p) => p.id === ev.actor_id);
                return (
                  <div key={ev.id} style={{ display: "flex", gap: 10 }}>
                    {who && <Avatar person={who} size={24} onClick={(e) => { e.stopPropagation(); openProfile(who.id); }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5 }}><b style={{ fontWeight: 400 }}>{who?.name || "Someone"}</b> {ev.action}</div>
                      <div style={{ fontSize: 11, color: "var(--sw-muted)", marginTop: 1 }}>{relTime(ev.created_at)}</div>
                    </div>
                  </div>
                );
              })}
              {!taskActivity.length && <p style={{ margin: 0, fontSize: 12.5, color: "var(--sw-muted)" }}>No activity on this task yet.</p>}
            </div>
          )}

          {tab === "files" && (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--sw-muted)" }}>No files attached to this task.</p>
          )}
        </div>
      </div>
    </>
  );
}
