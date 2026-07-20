"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { initials, STATUS_COLORS, PRIORITY_COLORS, Status, Priority, Task, Attachment, Profile } from "@/lib/types";
import {
  updateTask, eligibleAssignees, canEditDueDirectly, canDecideDueDate,
  requestDueDate, decideDueDate, addSubtask, updateSubtask, deleteSubtask,
  addDependency, removeDependency, canAddSubtask, accountableCandidates,
  createReminder, canEditDifficulty, updateTaskDifficulty, updateSubtaskDifficulty,
  listAttachments, uploadAttachment, deleteAttachment, downloadAttachmentUrl,
  createComment,
} from "@/lib/actions";
import { isHeadRank } from "@/lib/colors";
import { ReminderInline } from "./reminders";
import { relTime, fmtShort, todayIso } from "@/lib/dates";
import { taskLink } from "@/lib/ui";
import { scoreMatch } from "@/lib/search";
import { AssigneePicker } from "./assignee-picker";
import { RaciRows, raciNote } from "./raci";
import { SubtaskFields, SubtaskDraft, blankSubtaskDraft } from "./subtask-fields";
import { DifficultyPicker, DifficultyBadge } from "./difficulty";
import { FileDropZone } from "./dropzone";
import { IconLink, IconX } from "./icons";
import { Avatar } from "./shared";
import { useFocusTrap } from "@/lib/a11y";

const label: React.CSSProperties = { fontSize: 12, fontWeight: 400, color: "var(--sw-muted)" };

// Task detail slide-over (Details / Subtasks / Activity / Files tabs)
export function TaskDetailSlideOver() {
  const { activeTaskId, setActiveTaskId, pushToast, openProfile } = useUI();
  const store = useStore();
  const { me, tasks, profiles, levels, lists, spaces, activity, subtasks, deps, approvals, comments, patch, supabase } = store;
  const [tab, setTab] = useState<"details" | "activity" | "files" | "comments">("details");
  const [commentDraft, setCommentDraft] = useState("");
  const [pendingMentions, setPendingMentions] = useState<string[]>([]);
  const [mentionFilter, setMentionFilter] = useState<string | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const [newSub, setNewSub] = useState<SubtaskDraft | null>(null);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [reqDate, setReqDate] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [depQuery, setDepQuery] = useState("");
  const [decideNote, setDecideNote] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const t = tasks.find((x) => x.id === activeTaskId);

  const today = todayIso();
  const scoped = useMemo(() => (t ? eligibleAssignees(store, t.list_id) : []), [store, t]);

  useEffect(() => {
    if (!t) { setAttachments([]); return; }
    listAttachments(supabase, t.id).then(setAttachments);
  }, [t?.id, supabase]);
  const trapRef = useFocusTrap(!!t);

  if (!t) return null;

  const handleFiles = async (files: File[]) => {
    setUploading(true);
    let failures = 0;
    for (const f of files) {
      const { attachment, error } = await uploadAttachment(supabase, t.id, f);
      if (attachment) setAttachments((a) => [attachment, ...a]);
      if (error) failures++;
    }
    setUploading(false);
    if (failures) pushToast(`${failures} file${failures > 1 ? "s" : ""} failed to upload`);
  };
  const handleDelete = async (a: Attachment) => {
    setAttachments((cur) => cur.filter((x) => x.id !== a.id));
    await deleteAttachment(supabase, a);
  };
  const handleDownload = async (a: Attachment) => {
    const url = await downloadAttachmentUrl(supabase, a.storage_path);
    if (url) window.open(url, "_blank");
    else pushToast("Couldn't get a download link — try again.");
  };

  const list = lists.find((l) => l.id === t.list_id);
  const space = spaces.find((s) => s.id === list?.space_id);
  const listPath = t.list_id ? `${space?.name || ""} / ${list?.name || ""}` : "Personal";
  const personal = !t.list_id;
  const taskActivity = activity.filter((a) => a.task_id === t.id);
  const mySubtasks = subtasks.filter((s) => s.task_id === t.id);
  const doneCount = mySubtasks.filter((s) => s.done).length;
  const blockedBy = deps.filter((d) => d.task_id === t.id).map((d) => tasks.find((x) => x.id === d.depends_on)).filter(Boolean) as Task[];
  const blocking = deps.filter((d) => d.depends_on === t.id).map((d) => tasks.find((x) => x.id === d.task_id)).filter(Boolean) as Task[];
  const pendingReq = approvals.find((a) => a.task_id === t.id && a.kind === "due_date" && a.status === "pending");
  const decidedReqs = approvals.filter((a) => a.task_id === t.id && a.kind === "due_date" && a.status !== "pending").slice(0, 3);
  const mayEditDue = canEditDueDirectly(me, levels, t);
  const maySubtask = canAddSubtask(me, profiles, levels, t);
  const aCands = accountableCandidates(store, t.assignee_id);
  const deptLabel = (p: (typeof profiles)[number]) => store.departments.find((d) => d.id === p.department_id)?.name?.split(" ")[0] || null;
  const mayDecide = pendingReq ? canDecideDueDate(me, profiles, levels, pendingReq) : false;

  const set = (fields: Partial<Task>, toast?: string) => {
    const prev = tasks;
    updateTask(supabase, tasks, patch, t.id, fields);
    if (toast) pushToast(toast, () => patch("tasks", prev));
  };

  const depCandidates = depQuery.trim()
    ? tasks
        .filter((x) => x.id !== t.id && x.status !== "Done" && !blockedBy.some((b) => b.id === x.id))
        .map((x) => ({ x, s: Math.max(scoreMatch(depQuery, x.name), depQuery === String(x.task_number) ? 100 : 0) }))
        .filter((r) => r.s > 12)
        .sort((a, b) => b.s - a.s)
        .slice(0, 5)
        .map((r) => r.x)
    : [];

  const submitSubtask = async () => {
    if (!newSub || !newSub.name.trim() || !newSub.assignee_id || !me) return;
    const sub = await addSubtask(supabase, store, patch, t.id, newSub.name.trim(), newSub.assignee_id, newSub.due || null,
      { accountable_id: newSub.raci.a, raci_c: newSub.raci.c, raci_i: newSub.raci.i },
      { value: newSub.difficulty, setById: me.id });
    if (sub && newSub.reminder) {
      await createReminder(supabase, store, patch, { profile_id: me.id, task_id: t.id, subtask_id: sub.id, title: newSub.name.trim(), remind_at: new Date(newSub.reminder).toISOString() });
    }
    setNewSub(null);
  };

  const chip = (x: Task, onRemove?: () => void) => (
    <span key={x.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, background: "var(--sw-hover)" }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: STATUS_COLORS[x.status], flex: "none" }} />
      <button onClick={() => setActiveTaskId(x.id)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11.5, color: "var(--sw-text)", padding: 0 }}>
        SW-{x.task_number} {x.name.length > 34 ? x.name.slice(0, 34) + "…" : x.name}
      </button>
      {onRemove && (
        <button onClick={onRemove} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--sw-muted)", padding: 0, display: "flex" }}><IconX size={9} /></button>
      )}
    </span>
  );

  const taskComments = comments.filter((c) => c.task_id === t.id);
  const tabs: { key: typeof tab; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "comments", label: "Comments" },
    { key: "activity", label: "Activity" },
    { key: "files", label: "Files" },
  ];

  const mentionCandidates = mentionFilter !== null
    ? profiles.filter((p) => p.name.toLowerCase().includes(mentionFilter.toLowerCase())).slice(0, 6)
    : [];

  const onDraftChange = (v: string) => {
    setCommentDraft(v);
    const m = v.match(/@([^\s@]*)$/);
    setMentionFilter(m ? m[1] : null);
  };
  const pickMention = (p: Profile) => {
    setCommentDraft((v) => v.replace(/@([^\s@]*)$/, `@${p.name} `));
    setPendingMentions((ids) => (ids.includes(p.id) ? ids : [...ids, p.id]));
    setMentionFilter(null);
  };
  const postComment = async () => {
    if (!commentDraft.trim() || !me) return;
    setPostingComment(true);
    await createComment(supabase, store, patch, t, me, commentDraft.trim(), pendingMentions);
    setCommentDraft("");
    setPendingMentions([]);
    setMentionFilter(null);
    setPostingComment(false);
  };
  const renderCommentBody = (body: string, mentionedIds: string[]) => {
    const names = mentionedIds.map((id) => profiles.find((p) => p.id === id)?.name).filter((n): n is string => !!n);
    if (!names.length) return body;
    const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
    return body.split(re).map((part, i) => (names.some((n) => part === `@${n}`) ? <span key={i} style={{ color: "var(--crimson)", fontWeight: 500 }}>{part}</span> : <React.Fragment key={i}>{part}</React.Fragment>));
  };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.4)", zIndex: 40 }} onClick={() => setActiveTaskId(null)} />
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label={t.name} onClick={(e) => e.stopPropagation()} className="sw-slideover-card" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 560, maxWidth: "94vw", background: "var(--sw-card)", boxShadow: "-24px 0 60px rgba(23,18,15,.25)", zIndex: 41, display: "flex", flexDirection: "column" }}>
        <div className="sw-topbar" style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--sw-hair)", flex: "none" }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_COLORS[t.status], flex: "none" }} />
          <span style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-muted)" }}>SW-{t.task_number}</span>
          {t.milestone && <span style={{ fontSize: 10, fontWeight: 400, color: "var(--crimson)", border: "1px solid var(--crimson)", borderRadius: 99, padding: "1px 8px" }}>◆ Milestone</span>}
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
          <button onClick={() => setActiveTaskId(null)} aria-label="Close" style={{ border: "none", background: "var(--sw-hover)", width: 28, height: 28, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
        </div>

        <div style={{ display: "flex", gap: 4, padding: "0 20px", borderBottom: "1px solid var(--sw-hair)", flex: "none" }}>
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              style={{ padding: "10px 12px", border: "none", background: "none", borderBottom: `2px solid ${tab === tb.key ? "var(--crimson)" : "transparent"}`, color: tab === tb.key ? "var(--sw-text)" : "var(--sw-text-soft)", fontSize: 12.5, fontWeight: 400, cursor: "pointer", marginBottom: -1 }}
            >
              {tb.label}
              {tb.key === "details" && mySubtasks.length > 0 && <span style={{ marginLeft: 5, fontSize: 10.5, color: "var(--sw-muted)" }}>{doneCount}/{mySubtasks.length}</span>}
              {tb.key === "comments" && taskComments.length > 0 && <span style={{ marginLeft: 5, fontSize: 10.5, color: "var(--sw-muted)" }}>{taskComments.length}</span>}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {tab === "details" && (
            <>
              <h2 style={{ margin: "0 0 16px", fontSize: 19, fontWeight: 800, lineHeight: 1.3 }}>{t.name}</h2>
              <div className="sw-grid-label" style={{ gap: "12px 10px", alignItems: "center", marginBottom: 6 }}>
                <span style={label}>Status</span>
                <select
                  className="sw-select"
                  value={t.status}
                  onChange={(e) => set({ status: e.target.value as Status }, `Status changed to ${e.target.value}`)}
                  style={{ width: "auto", height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12.5, fontWeight: 400, color: STATUS_COLORS[t.status], justifySelf: "start" }}
                >
                  <option>Not Started</option><option>Working on it</option><option>Stuck</option><option>Done</option>
                </select>

                <span style={label}>Priority</span>
                <select
                  className="sw-select"
                  value={t.priority}
                  onChange={(e) => set({ priority: e.target.value as Priority })}
                  style={{ width: "auto", height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12.5, fontWeight: 400, color: PRIORITY_COLORS[t.priority], justifySelf: "start" }}
                >
                  <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                </select>

                <span style={label}>Responsible (R)</span>
                <span style={{ justifySelf: "start" }}>
                  {me && (
                    <AssigneePicker
                      personal={personal}
                      me={me}
                      value={t.assignee_id}
                      onChange={(id) => set({ assignee_id: id, accountable_id: t.accountable_id === id ? null : t.accountable_id })}
                      deptScoped={scoped}
                      allProfiles={profiles}
                      deptLabel={deptLabel}
                      compact
                    />
                  )}
                </span>

                <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6, margin: "2px 0 4px" }}>
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-muted)" }}>{`RACI — ${raciNote(personal)}`}</span>
                  <RaciRows
                    profiles={profiles}
                    aCandidates={aCands}
                    deptLabel={deptLabel}
                    personal={personal}
                    value={{ a: t.accountable_id, c: t.raci_c, i: t.raci_i }}
                    onChange={(v) => set({ accountable_id: v.a, raci_c: v.c, raci_i: v.i })}
                  />
                </div>

                <span style={label}>Due date</span>
                <span style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                  {mayEditDue ? (
                    <input
                      type="date"
                      value={t.due || ""}
                      onChange={(e) => set({ due: e.target.value })}
                      style={{ height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12.5, fontWeight: 400, color: "var(--sw-text)" }}
                    />
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 400, color: t.due && t.due < today && t.status !== "Done" ? "var(--red)" : "var(--sw-text)" }}>
                        {t.due ? fmtShort(t.due) : "No due date"}
                      </span>
                      {!pendingReq && (
                        <button onClick={() => { setReqOpen(!reqOpen); setReqDate(t.due || today); }} style={{ border: "1px dashed var(--sw-hair)", background: "none", borderRadius: 999, padding: "3px 10px", fontSize: 11, color: "var(--crimson)", cursor: "pointer" }}>
                          Request change
                        </button>
                      )}
                    </span>
                  )}

                  {pendingReq && (
                    <div style={{ border: "1px solid var(--sw-hair)", borderLeft: "3px solid #B7791F", borderRadius: 9, padding: "9px 12px", background: "var(--sw-hover)", width: "100%" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 400 }}>
                        Pending: {profiles.find((p) => p.id === pendingReq.requester_id)?.name.split(" ")[0]} requested <b style={{ fontWeight: 800 }}>{pendingReq.requested_due ? fmtShort(pendingReq.requested_due) : ""}</b>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--sw-muted)", marginTop: 2 }}>&ldquo;{pendingReq.detail}&rdquo;</div>
                      {mayDecide && (
                        <div style={{ display: "flex", gap: 7, marginTop: 8, alignItems: "center" }}>
                          <input value={decideNote} onChange={(e) => setDecideNote(e.target.value)} placeholder="Decision note (optional)" style={{ flex: 1, height: 27, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-card)", padding: "0 9px", fontSize: 11, outline: "none", color: "var(--sw-text)" }} />
                          <button onClick={() => { decideDueDate(supabase, store, patch, pendingReq, me!, "approved", decideNote); setDecideNote(""); pushToast("Due-date request approved"); }} style={{ border: "none", background: "var(--green)", color: "#fff", borderRadius: 999, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>Approve</button>
                          <button onClick={() => { decideDueDate(supabase, store, patch, pendingReq, me!, "declined", decideNote); setDecideNote(""); pushToast("Due-date request declined"); }} style={{ border: "none", background: "var(--red)", color: "#fff", borderRadius: 999, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>Decline</button>
                        </div>
                      )}
                      {!mayDecide && <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginTop: 4 }}>Awaiting approval from a superior.</div>}
                    </div>
                  )}

                  {reqOpen && !pendingReq && !mayEditDue && (
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
                      <input type="date" value={reqDate} onChange={(e) => setReqDate(e.target.value)} style={{ height: 30, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 9px", fontSize: 12, color: "var(--sw-text)" }} />
                      <input value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="Reason for the change…" style={{ flex: 1, minWidth: 140, height: 30, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12, outline: "none", color: "var(--sw-text)" }} />
                      <button
                        onClick={async () => {
                          if (!reqDate || !reqReason.trim() || !me) return;
                          await requestDueDate(supabase, store, patch, t, me, reqDate, reqReason.trim());
                          setReqOpen(false); setReqReason("");
                          pushToast("Due-date request sent for approval");
                        }}
                        style={{ border: "none", background: "var(--crimson)", color: "#fff", borderRadius: 999, padding: "6px 13px", fontSize: 11.5, cursor: "pointer" }}
                      >
                        Submit
                      </button>
                    </div>
                  )}

                  {decidedReqs.map((r) => (
                    <span key={r.id} style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>
                      {r.status === "approved" ? "✓" : "✕"} {r.requested_due ? fmtShort(r.requested_due) : ""} {r.status} by {profiles.find((p) => p.id === r.decided_by)?.name.split(" ")[0] || "—"}{r.decision_note ? ` — "${r.decision_note}"` : ""}
                    </span>
                  ))}
                </span>

                <span style={label}>Effort</span>
                <span style={{ fontSize: 12.5, fontWeight: 400 }}>{t.effort} pts</span>

                <span style={label}>Difficulty</span>
                <span style={{ justifySelf: "start", width: 180 }}>
                  <DifficultyPicker
                    value={t.difficulty}
                    disabled={!canEditDifficulty(profiles, levels, me, t.difficulty_set_by)}
                    lockedReason={t.difficulty_set_by ? `Only ${profiles.find((p) => p.id === t.difficulty_set_by)?.name || "the setter"} or someone who outranks them can change this` : undefined}
                    onChange={(v) => me && updateTaskDifficulty(supabase, store, patch, t, me, v)}
                    compact
                  />
                </span>

                <span style={label}>Reminder</span>
                <span style={{ justifySelf: "start" }}><ReminderInline taskId={t.id} title={t.name} /></span>

                <span style={label}>Milestone</span>
                <button
                  onClick={() => set({ milestone: !t.milestone }, t.milestone ? "Milestone removed" : "Marked as milestone")}
                  style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: 6, border: `1px solid ${t.milestone ? "var(--crimson)" : "var(--sw-hair)"}`, background: t.milestone ? "rgba(122,13,32,0.07)" : "none", color: t.milestone ? "var(--crimson)" : "var(--sw-text-soft)", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, cursor: "pointer" }}
                >
                  ◆ {t.milestone ? "Milestone" : "Mark as milestone"}
                </button>
              </div>

              {/* SUBTASKS */}
              <div style={{ height: 1, background: "var(--sw-hair)", margin: "16px 0" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)" }}>Subtasks</span>
                {mySubtasks.length > 0 && (
                  <>
                    <span style={{ fontSize: 11, color: "var(--sw-muted)" }}>{doneCount}/{mySubtasks.length}</span>
                    <span style={{ flex: 1, height: 4, borderRadius: 99, background: "var(--sw-hover)", overflow: "hidden", maxWidth: 130 }}>
                      <span style={{ display: "block", height: "100%", width: `${mySubtasks.length ? Math.round((doneCount / mySubtasks.length) * 100) : 0}%`, background: "var(--green)", borderRadius: 99 }} />
                    </span>
                  </>
                )}
              </div>
              {mySubtasks.map((s) => {
                const who = profiles.find((p) => p.id === s.assignee_id);
                return (
                  <React.Fragment key={s.id}>
                  <div className="sw-row" style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 4px", borderRadius: 7 }}>
                    <button
                      onClick={() => updateSubtask(supabase, store, patch, s.id, { done: !s.done })}
                      title={s.done ? "Reopen" : "Mark complete"}
                      style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${s.done ? "var(--green)" : "var(--sw-hair)"}`, background: s.done ? "var(--green)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none", padding: 0 }}
                    >
                      {s.done && <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>}
                    </button>
                    <span style={{ flex: 1, fontSize: 12.5, color: s.done ? "var(--sw-muted)" : "var(--sw-text)", textDecoration: s.done ? "line-through" : "none" }}>{s.name}</span>
                    <select
                      className="sw-select"
                      value={s.assignee_id || ""}
                      onChange={(e) => updateSubtask(supabase, store, patch, s.id, { assignee_id: e.target.value || null })}
                      title="Assign subtask"
                      style={{ height: 24, borderRadius: 6, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 10.5, color: "var(--sw-text-soft)", padding: "0 4px", maxWidth: 96 }}
                    >
                      <option value="">Unassigned</option>
                      {profiles.map((p) => <option key={p.id} value={p.id}>{p.name.split(" ")[0]}</option>)}
                    </select>
                    <input
                      type="date"
                      value={s.due || ""}
                      onChange={(e) => updateSubtask(supabase, store, patch, s.id, { due: e.target.value || null })}
                      title="Subtask due date"
                      style={{ height: 24, borderRadius: 6, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 10.5, color: s.due && s.due < today && !s.done ? "var(--red)" : "var(--sw-text-soft)", padding: "0 4px", width: 112 }}
                    />
                    <DifficultyBadge value={s.difficulty} />
                    {who && <span title={who.name} style={{ width: 18, height: 18, borderRadius: 99, background: who.color, color: "#fff", fontSize: 7.5, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{initials(who.name)}</span>}
                    <button onClick={() => setExpandedSub(expandedSub === s.id ? null : s.id)} title="RACI & reminder" style={{ border: "none", background: expandedSub === s.id ? "var(--sw-hover)" : "none", borderRadius: 6, color: "var(--sw-muted)", cursor: "pointer", padding: "2px 5px", fontSize: 11, lineHeight: 1 }}>⋯</button>
                    <button onClick={() => deleteSubtask(supabase, store, patch, s.id)} title="Delete subtask" style={{ border: "none", background: "none", color: "var(--sw-muted)", cursor: "pointer", padding: 2, display: "flex" }}><IconX size={10} /></button>
                  </div>
                  {expandedSub === s.id && (
                    <div style={{ margin: "2px 0 8px 24px", padding: "10px 12px", border: "1px solid var(--sw-hair)", borderRadius: 10, background: "var(--sw-hover)", display: "flex", flexDirection: "column", gap: 8 }}>
                      <RaciRows
                        profiles={profiles}
                        aCandidates={accountableCandidates(store, s.assignee_id)}
                        deptLabel={deptLabel}
                        value={{ a: s.accountable_id, c: s.raci_c, i: s.raci_i }}
                        onChange={(v) => updateSubtask(supabase, store, patch, s.id, { accountable_id: v.a, raci_c: v.c, raci_i: v.i })}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, color: "var(--sw-muted)", width: 92, flex: "none" }}>Reminder</span>
                        <ReminderInline taskId={t.id} subtaskId={s.id} title={s.name} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, color: "var(--sw-muted)", width: 92, flex: "none" }}>Difficulty</span>
                        <span style={{ width: 160 }}>
                          <DifficultyPicker
                            value={s.difficulty}
                            disabled={!canEditDifficulty(profiles, levels, me, s.difficulty_set_by)}
                            lockedReason={s.difficulty_set_by ? `Only ${profiles.find((p) => p.id === s.difficulty_set_by)?.name || "the setter"} or someone who outranks them can change this` : undefined}
                            onChange={(v) => me && updateSubtaskDifficulty(supabase, store, patch, s, me, v)}
                            compact
                          />
                        </span>
                      </div>
                    </div>
                  )}
                  </React.Fragment>
                );
              })}
              {maySubtask ? (
                newSub ? (
                  <>
                    <SubtaskFields
                      draft={newSub}
                      onChange={setNewSub}
                      onRemove={() => setNewSub(null)}
                      personal={personal}
                      deptLabel={deptLabel}
                    />
                    <button
                      onClick={submitSubtask}
                      disabled={!newSub.name.trim() || !newSub.assignee_id}
                      style={{ border: "none", background: newSub.name.trim() && newSub.assignee_id ? "var(--crimson)" : "var(--sw-hair)", color: "#fff", borderRadius: 999, padding: "7px 16px", fontSize: 12, cursor: newSub.name.trim() && newSub.assignee_id ? "pointer" : "not-allowed" }}
                    >
                      Add subtask
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setNewSub(blankSubtaskDraft())}
                    style={{ width: "100%", height: 32, borderRadius: 8, border: "1px dashed var(--sw-hair)", background: "none", fontSize: 12, color: "var(--sw-text-soft)", cursor: "pointer", marginTop: 6 }}
                  >
                    + Add a subtask
                  </button>
                )
              ) : (
                <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--sw-muted)" }}>
                  Only the assignor ({profiles.find((p) => p.id === t.owner_id)?.name.split(" ")[0] || "owner"}), the Accountable, or someone senior to them can add subtasks here.
                </div>
              )}

              {/* DEPENDENCIES */}
              <div style={{ height: 1, background: "var(--sw-hair)", margin: "16px 0" }} />
              <div style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)", marginBottom: 7 }}>Blocked by</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {blockedBy.map((x) => chip(x, () => removeDependency(supabase, store, patch, t.id, x.id)))}
                {!blockedBy.length && <span style={{ fontSize: 11.5, color: "var(--sw-muted)" }}>Nothing blocks this task.</span>}
              </div>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <input
                  value={depQuery}
                  onChange={(e) => setDepQuery(e.target.value)}
                  placeholder="+ Link a blocking task (name or SW number)…"
                  style={{ width: "100%", height: 30, borderRadius: 8, border: "1px dashed var(--sw-hair)", background: "none", padding: "0 11px", fontSize: 12, outline: "none", color: "var(--sw-text)", boxSizing: "border-box" }}
                />
                {depCandidates.length > 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 10, boxShadow: "0 14px 40px rgba(23,18,15,.2)", zIndex: 10, padding: 5 }}>
                    {depCandidates.map((x) => (
                      <button
                        key={x.id}
                        className="sw-row"
                        onClick={async () => {
                          const err = await addDependency(supabase, store, patch, t.id, x.id);
                          if (err) pushToast(err); else pushToast(`Linked SW-${x.task_number} as a blocker`);
                          setDepQuery("");
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 9px", border: "none", borderRadius: 7, background: "none", cursor: "pointer" }}
                      >
                        <span style={{ fontSize: 10, color: "var(--sw-muted)", width: 44, flex: "none" }}>SW-{x.task_number}</span>
                        <span style={{ flex: 1, fontSize: 12, color: "var(--sw-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {blocking.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)", marginBottom: 7 }}>Blocks {blocking.length} downstream task{blocking.length > 1 ? "s" : ""}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{blocking.map((x) => chip(x))}</div>
                </>
              )}

              <div style={{ height: 1, background: "var(--sw-hair)", margin: "16px 0" }} />
              <div style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)", marginBottom: 6 }}>Description</div>
              <textarea
                defaultValue={t.description || ""}
                onBlur={(e) => { if (e.target.value !== (t.description || "")) set({ description: e.target.value }); }}
                style={{ width: "100%", height: 90, resize: "vertical", borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "10px 12px", fontSize: 13, lineHeight: 1.55, fontFamily: "var(--font-sans)", color: "var(--sw-text-soft)", outline: "none" }}
              />
            </>
          )}

          {tab === "comments" && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
                {taskComments.map((c) => {
                  const who = profiles.find((p) => p.id === c.author_id);
                  return (
                    <div key={c.id} style={{ display: "flex", gap: 10 }}>
                      {who && <Avatar person={who} size={24} ring={isHeadRank(who, levels)} onClick={(e) => { e.stopPropagation(); openProfile(who.id); }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5 }}><b style={{ fontWeight: 400 }}>{who?.name || "Someone"}</b></div>
                        <div style={{ fontSize: 12.5, marginTop: 2, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{renderCommentBody(c.body, c.mentioned_ids)}</div>
                        <div style={{ fontSize: 11, color: "var(--sw-muted)", marginTop: 3 }}>{relTime(c.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                {!taskComments.length && <p style={{ margin: 0, fontSize: 12.5, color: "var(--sw-muted)" }}>No comments yet — @mention anyone in the company to loop them in.</p>}
              </div>
              <div style={{ position: "relative" }}>
                <textarea
                  value={commentDraft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  placeholder="Write a comment — type @ to mention anyone…"
                  style={{ width: "100%", height: 70, resize: "vertical", borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "10px 12px", fontSize: 12.5, fontFamily: "var(--font-sans)", color: "var(--sw-text)", outline: "none", boxSizing: "border-box" }}
                />
                {mentionCandidates.length > 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, width: 220, background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 10, boxShadow: "0 14px 40px rgba(23,18,15,.2)", zIndex: 5, overflow: "hidden" }}>
                    {mentionCandidates.map((p) => (
                      <button key={p.id} onClick={() => pickMention(p)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: "none", background: "none", cursor: "pointer", textAlign: "left" }}>
                        <Avatar person={p} size={20} />
                        <span style={{ fontSize: 12 }}>{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button disabled={postingComment || !commentDraft.trim()} onClick={postComment} style={{ padding: "7px 16px", borderRadius: 999, border: "none", background: commentDraft.trim() ? "var(--crimson)" : "var(--sw-hair)", color: "#fff", fontSize: 12, cursor: commentDraft.trim() ? "pointer" : "default" }}>
                  {postingComment ? "Posting…" : "Comment"}
                </button>
              </div>
            </div>
          )}

          {tab === "activity" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {taskActivity.map((ev) => {
                const who = profiles.find((p) => p.id === ev.actor_id);
                return (
                  <div key={ev.id} style={{ display: "flex", gap: 10 }}>
                    {who && <Avatar person={who} size={24} ring={isHeadRank(who, levels)} onClick={(e) => { e.stopPropagation(); openProfile(who.id); }} />}
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
            <div>
              <FileDropZone inputId="sw-file-input-detail" onFiles={handleFiles} />
              {uploading && <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--sw-muted)" }}>Uploading…</p>}
              {attachments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                  {attachments.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", border: "1px solid var(--sw-hair)", borderRadius: 9, background: "var(--sw-card)" }}>
                      <span style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(122,13,32,0.08)", color: "var(--crimson)", fontSize: 11, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                        {(a.name.split(".").pop() || "").toUpperCase().slice(0, 3)}
                      </span>
                      <button onClick={() => handleDownload(a)} style={{ flex: 1, minWidth: 0, border: "none", background: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--sw-text)" }}>{a.name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>{Math.max(1, Math.round(a.size_bytes / 1024))} KB · {relTime(a.created_at)}</div>
                      </button>
                      <button onClick={() => handleDelete(a)} title="Delete" style={{ border: "none", background: "none", color: "var(--sw-muted)", fontSize: 14, cursor: "pointer", flex: "none", lineHeight: 1 }}><IconX /></button>
                    </div>
                  ))}
                </div>
              ) : (
                !uploading && <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--sw-muted)" }}>No files attached to this task yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
