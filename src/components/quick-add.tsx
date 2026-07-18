"use client";
import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { initials } from "@/lib/types";
import { parseNLDate } from "@/lib/dates";
import { createTask, managerOf, eligibleAssignees, accountableCandidates, suggestAssignees, addSubtask, createReminder } from "@/lib/actions";
import { RaciRows, RaciValue, raciNote } from "./raci";
import { Subtask } from "@/lib/types";
import { IconSparkle, IconTaskPlus, IconX } from "./icons";

export function QuickAddModal() {
  const { showQuickAdd, setShowQuickAdd, quickAddStatus, pushToast, activeList } = useUI();
  const store = useStore();
  const { me, profiles, lists, spaces, tasks, patch, supabase } = store;

  const listOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: "my", label: "My List (personal)" }];
    for (const l of lists) {
      const sp = spaces.find((s) => s.id === l.space_id);
      opts.push({ value: l.id, label: `${sp?.name || ""} / ${l.name}` });
    }
    return opts;
  }, [lists, spaces]);

  const [name, setName] = useState("");
  const [listVal, setListVal] = useState<string>(activeList?.listId || "my");
  const [assignees, setAssignees] = useState<string[]>(me ? [me.id] : []);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [dueText, setDueText] = useState("");
  const [due, setDue] = useState("");
  const [dueLabel, setDueLabel] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [reminder, setReminder] = useState("");
  const [recur, setRecur] = useState("none");
  const [raci, setRaci] = useState<RaciValue>({ a: null, c: [], i: [] });
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: number }[]>([]);
  const [drafts, setDrafts] = useState<{ id: string; name: string; assignee_id: string | null; due: string; reminder: string; raci: RaciValue; open: boolean }[]>([]);
  const [draftName, setDraftName] = useState("");
  const [addAnother, setAddAnother] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  if (!showQuickAdd || !me) return null;

  const personal = listVal === "my";
  const deptScoped = eligibleAssignees(store, personal ? null : listVal);
  const aCands = accountableCandidates(profiles, store.levels, assignees.length ? assignees : [me.id]);
  const deptLabel = (p: (typeof profiles)[number]) => store.departments.find((d) => d.id === p.department_id)?.name?.split(" ")[0] || null;
  const autoA = managerOf(profiles, assignees[0]);
  const close = () => setShowQuickAdd(false);

  const reset = () => {
    setName(""); setDueText(""); setDue(""); setDueLabel(""); setDescription("");
    setAttachments([]); setRaci({ a: null, c: [], i: [] }); setReminder(""); setDrafts([]); setDraftName("");
  };

  const submit = async () => {
    if (!name.trim()) return;
    const created = await createTask(supabase, tasks, patch, {
      name: name.trim(),
      list_id: personal ? null : listVal,
      owner_id: me.id,
      status: quickAddStatus || "Not Started",
      priority,
      due: due || null,
      description,
      assignees: assignees.length ? assignees : [me.id],
      accountable_id: personal ? null : raci.a || autoA || me.id, // exactly one Accountable, always
      raci_c: raci.c,
      raci_i: raci.i,
      reminder_at: reminder || null,
      recur,
    });
    if (created) {
      // draft subtasks (with their RACI) and any reminders ride along
      for (const d of drafts) {
        const sub = await addSubtask(supabase, store, patch, created.id, d.name, d.assignee_id, d.due || null,
          { accountable_id: d.raci.a, raci_c: d.raci.c, raci_i: d.raci.i });
        if (sub && d.reminder) {
          await createReminder(supabase, store, patch, { profile_id: me.id, task_id: created.id, subtask_id: (sub as Subtask).id, title: d.name, remind_at: new Date(d.reminder).toISOString() });
        }
      }
      if (reminder) {
        await createReminder(supabase, store, patch, { profile_id: me.id, task_id: created.id, title: created.name, remind_at: new Date(reminder).toISOString() });
      }
      pushToast(`Task "${created.name}" created${drafts.length ? ` with ${drafts.length} subtask${drafts.length > 1 ? "s" : ""}` : ""}`);
    }
    if (addAnother) reset();
    else close();
  };

  const q = assigneeQuery.trim().toLowerCase();
  const filteredPeople = personal
    ? [] // personal task: just you — no other names offered
    : q.length >= 2
      ? profiles.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) // cross-department by search
      : deptScoped.filter((p) => !q || p.name.toLowerCase().includes(q));
  const selected = profiles.filter((p) => assignees.includes(p.id));

  const dueChips = ["Today", "Tomorrow", "Next week", "End of month"];
  const priorityRows = [
    { label: "Low", dot: "var(--green)" },
    { label: "Medium", dot: "var(--navy)" },
    { label: "High", dot: "var(--crimson)" },
    { label: "Critical", dot: "var(--red)" },
  ];
  const recurRows = [
    { value: "none", label: "Doesn't repeat" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  const label = (text: React.ReactNode) => (
    <label style={{ display: "block", fontSize: 12.5, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>{text}</label>
  );

  const dd = (key: string, current: string, rows: { value?: string; label: string; dot?: string }[], onPick: (v: string) => void) => (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === key ? null : key); }}
        style={{ width: "100%", height: "var(--sw-field-h)", borderRadius: 10, border: `1.5px solid ${openDropdown === key ? "var(--crimson)" : "var(--sw-hair)"}`, background: "var(--sw-hover)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 14px", fontSize: 13, fontWeight: 400, color: "var(--sw-text)", cursor: "pointer", textAlign: "left", transition: "border-color .15s" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current}</span>
        <span style={{ color: "var(--sw-muted)", fontSize: 10, transform: openDropdown === key ? "rotate(180deg)" : "none", transition: "transform .15s", flex: "none" }}>▾</span>
      </button>
      {openDropdown === key && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card-hover)", padding: 6, zIndex: 50, maxHeight: 220, overflowY: "auto" }}>
          {rows.map((row) => (
            <button
              key={row.value ?? row.label}
              onClick={(e) => { e.stopPropagation(); onPick(row.value ?? row.label); setOpenDropdown(null); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 8, border: "none", background: "none", fontSize: 13, fontWeight: 400, color: "var(--sw-text)", cursor: "pointer" }}
              className="sw-row"
            >
              {row.dot && <span style={{ width: 7, height: 7, borderRadius: 99, background: row.dot, flex: "none" }} />}
              <span style={{ flex: 1 }}>{row.label}</span>
              {(row.value ?? row.label) === current && <span style={{ color: "var(--crimson)", fontWeight: 400 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const currentListLabel = listOptions.find((o) => o.value === listVal)?.label || "My List (personal)";
  const currentRecurLabel = recurRows.find((r) => r.value === recur)?.label || "Doesn't repeat";

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={close}
    >
      <div
        onClick={(e) => { e.stopPropagation(); if (openDropdown) setOpenDropdown(null); }}
        style={{ width: 900, maxWidth: "94vw", maxHeight: "90vh", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", animation: "swModalIn .22s var(--ease-brand)", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "22px 26px", borderBottom: "1px solid var(--sw-hair)", flex: "none" }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(122,13,32,0.1)", color: "var(--crimson)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <IconTaskPlus />
          </span>
          <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, flex: 1 }}>Create new task</h3>
          <button onClick={close} style={{ border: "none", background: "var(--sw-hover)", width: 30, height: 30, borderRadius: 99, cursor: "pointer", fontSize: 14, color: "var(--sw-text-soft)" }}><IconX /></button>
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "22px 26px 20px" }}>
            {label(<>Task title <span style={{ color: "var(--crimson)" }}>*</span></>)}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Send Bank Mandiri trade documents"
              style={{ width: "100%", height: "var(--sw-field-h)", borderRadius: 10, border: "1.5px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 14px", fontSize: 14.5, marginBottom: 18, outline: "none", color: "var(--sw-text)" }} />

            {label("Where")}
            <div style={{ marginBottom: 6 }}>{dd("list", currentListLabel, listOptions, (v) => {
              setListVal(v);
              // switching to a personal task drops other people
              if (v === "my") { setAssignees(me ? [me.id] : []); setRaci({ a: null, c: [], i: [] }); }
            })}</div>
            <div style={{ marginBottom: 12 }} />

            <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 400, color: "var(--sw-text-soft)", flex: 1 }}>Assign to <span style={{ color: "var(--crimson)" }}>*</span></label>
              <button onClick={() => { if (!assignees.includes(me.id)) setAssignees([...assignees, me.id]); }} style={{ border: "none", background: "none", color: "var(--crimson)", fontSize: 12.5, fontWeight: 400, cursor: "pointer" }}>+ Add me</button>
            </div>
            {personal ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "8px 12px", border: "1px solid var(--sw-hair)", borderRadius: 10, background: "var(--sw-hover)" }}>
                <span style={{ width: 22, height: 22, borderRadius: 99, background: me.color, color: "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(me.name)}</span>
                <span style={{ fontSize: 12.5 }}>{me.name} <span style={{ color: "var(--sw-muted)" }}>— personal tasks are yours alone</span></span>
              </div>
            ) : (
            <input value={assigneeQuery} onChange={(e) => setAssigneeQuery(e.target.value)} placeholder="Department shown below — type 2+ letters to search any department…"
              style={{ width: "100%", height: "var(--sw-field-h)", borderRadius: 10, border: "1.5px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 10, outline: "none", color: "var(--sw-text)" }} />
            )}

            {selected.length > 0 && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 400, color: "var(--sw-muted)", marginBottom: 6 }}>{selected.length} assignee{selected.length > 1 ? "s" : ""} selected</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
                  {selected.map((s) => (
                    <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 5px", borderRadius: 999, border: "1.5px solid var(--crimson)", background: "rgba(122,13,32,0.06)" }}>
                      <span style={{ width: 20, height: 20, borderRadius: 99, background: s.color, color: "#fff", fontSize: 8.5, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(s.name)}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 400, color: "var(--crimson)" }}>{s.name}</span>
                      <button onClick={() => setAssignees(assignees.filter((x) => x !== s.id))} style={{ border: "none", background: "none", color: "var(--crimson)", fontSize: 13, cursor: "pointer", padding: 0, lineHeight: 1 }}><IconX /></button>
                    </span>
                  ))}
                </div>
              </>
            )}

            {!personal && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
              {filteredPeople.map((p) => {
                const on = assignees.includes(p.id);
                const crossDept = !deptScoped.some((x) => x.id === p.id);
                return (
                  <button key={p.id} onClick={() => setAssignees(on ? assignees.filter((x) => x !== p.id) : [...assignees, p.id])}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px 5px 5px", borderRadius: 999, border: `1.5px solid ${on ? "var(--crimson)" : "var(--sw-hair)"}`, background: on ? "rgba(122,13,32,0.06)" : "none", cursor: "pointer" }}>
                    <span style={{ width: 20, height: 20, borderRadius: 99, background: p.color, color: "#fff", fontSize: 8.5, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(p.name)}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 400, color: on ? "var(--crimson)" : "var(--sw-text-soft)" }}>{p.name}</span>
                    {crossDept && <span style={{ fontSize: 9, color: "var(--sw-muted)", background: "var(--sw-hover)", borderRadius: 999, padding: "1px 7px" }}>{deptLabel(p) || "other dept"}</span>}
                  </button>
                );
              })}
              {!filteredPeople.length && <span style={{ fontSize: 12.5, color: "var(--sw-muted)", padding: "6px 0" }}>{q.length === 1 ? "Type one more letter to search all departments…" : "No match."}</span>}
            </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
              <div>
                {label("Due date")}
                <div style={{ position: "relative" }}>
                  <input
                    value={dueText}
                    onChange={(e) => {
                      const v = e.target.value;
                      const p = parseNLDate(v);
                      setDueText(v); setDue(p ? p.iso : ""); setDueLabel(p ? p.label : "");
                    }}
                    placeholder="Type: fri, tomorrow, 25/07…"
                    style={{ width: "100%", height: "var(--sw-field-h)", borderRadius: 10, border: "1.5px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 100px 0 12px", fontSize: 13, color: "var(--sw-text)", outline: "none", boxSizing: "border-box" }}
                  />
                  {dueLabel && <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--green)" }}>→ {dueLabel}</span>}
                </div>
                <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                  {dueChips.map((c) => (
                    <button key={c} onClick={() => { const p = parseNLDate(c.toLowerCase()); if (p) { setDueText(c); setDue(p.iso); setDueLabel(p.label); } }}
                      style={{ fontSize: 10.5, border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "2px 9px", background: "var(--sw-card)", color: "var(--sw-text-soft)", cursor: "pointer" }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                {label("Priority")}
                {dd("priority", priority, priorityRows, setPriority)}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
              <div>
                {label("Reminder (optional)")}
                <input type="datetime-local" value={reminder} onChange={(e) => setReminder(e.target.value)}
                  style={{ width: "100%", height: "var(--sw-field-h)", borderRadius: 10, border: "1.5px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 12.5, color: "var(--sw-text)" }} />
              </div>
              <div>
                {label("Repeats")}
                {dd("recur", currentRecurLabel, recurRows, setRecur)}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 400, color: "var(--sw-text-soft)" }}>RACI</label>
              <span style={{ fontSize: 11, color: "var(--sw-muted)" }}>{raciNote(personal)}</span>
            </div>
            <div style={{ marginBottom: 18 }}>
              <RaciRows profiles={profiles} aCandidates={aCands} deptLabel={deptLabel} personal={personal} autoA={autoA} value={raci} onChange={setRaci} />
            </div>

            {label("Subtasks")}
            <div style={{ marginBottom: 6 }}>
              {drafts.map((d, i) => {
                const dp = profiles.find((x) => x.id === d.assignee_id);
                return (
                  <div key={d.id} style={{ border: "1px solid var(--sw-hair)", borderRadius: 10, marginBottom: 7, background: "var(--sw-card)", overflow: "visible" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px" }}>
                      <span style={{ fontSize: 10.5, color: "var(--sw-muted)", width: 16, flex: "none" }}>{i + 1}.</span>
                      <input
                        value={d.name}
                        onChange={(e) => setDrafts(drafts.map((x) => x.id === d.id ? { ...x, name: e.target.value } : x))}
                        style={{ flex: 1, border: "none", background: "none", outline: "none", fontSize: 12.5, color: "var(--sw-text)", minWidth: 0 }}
                      />
                      <select
                        className="sw-select"
                        value={d.assignee_id || ""}
                        onChange={(e) => setDrafts(drafts.map((x) => x.id === d.id ? { ...x, assignee_id: e.target.value || null } : x))}
                        style={{ height: 26, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11, color: "var(--sw-text-soft)", padding: "0 5px", maxWidth: 110 }}
                      >
                        <option value="">{personal ? "Me" : "Assignee…"}</option>
                        {(personal ? [me] : deptScoped).map((p) => <option key={p.id} value={p.id}>{p.name.split(" ")[0]}</option>)}
                      </select>
                      <input type="date" value={d.due} onChange={(e) => setDrafts(drafts.map((x) => x.id === d.id ? { ...x, due: e.target.value } : x))}
                        style={{ height: 26, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 10.5, color: "var(--sw-text-soft)", padding: "0 5px", width: 118 }} />
                      <button onClick={() => setDrafts(drafts.map((x) => x.id === d.id ? { ...x, open: !x.open } : x))} title="RACI & reminder"
                        style={{ border: "none", background: d.open ? "var(--sw-hover)" : "none", borderRadius: 6, color: "var(--sw-muted)", cursor: "pointer", padding: "3px 6px", fontSize: 11 }}>⋯</button>
                      <button onClick={() => setDrafts(drafts.filter((x) => x.id !== d.id))} style={{ border: "none", background: "none", color: "var(--sw-muted)", cursor: "pointer", padding: 2, display: "flex" }}><IconX /></button>
                    </div>
                    {d.open && (
                      <div style={{ borderTop: "1px solid var(--sw-hair)", padding: "9px 12px", background: "var(--sw-hover)", display: "flex", flexDirection: "column", gap: 8 }}>
                        <RaciRows
                          profiles={profiles}
                          aCandidates={accountableCandidates(profiles, store.levels, d.assignee_id ? [d.assignee_id] : assignees.length ? assignees : [me.id])}
                          deptLabel={deptLabel}
                          autoA={d.assignee_id ? managerOf(profiles, d.assignee_id) : autoA}
                          value={d.raci}
                          onChange={(v) => setDrafts(drafts.map((x) => x.id === d.id ? { ...x, raci: v } : x))}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, color: "var(--sw-muted)", width: 92, flex: "none" }}>Reminder</span>
                          <input type="datetime-local" value={d.reminder} onChange={(e) => setDrafts(drafts.map((x) => x.id === d.id ? { ...x, reminder: e.target.value } : x))}
                            style={{ height: 27, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-card)", fontSize: 11, color: "var(--sw-text)", padding: "0 7px" }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draftName.trim()) {
                    setDrafts([...drafts, { id: Math.random().toString(36).slice(2), name: draftName.trim(), assignee_id: personal ? me.id : (assignees[0] || null), due: "", reminder: "", raci: { a: null, c: [], i: [] }, open: false }]);
                    setDraftName("");
                  }
                }}
                placeholder="+ Break this task down — type a subtask and press Enter"
                style={{ width: "100%", height: 34, borderRadius: 9, border: "1.5px dashed var(--sw-hair)", background: "none", padding: "0 12px", fontSize: 12.5, outline: "none", color: "var(--sw-text)", boxSizing: "border-box" }}
              />
              {drafts.length > 0 && <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginTop: 5 }}>Subtasks inherit this task&apos;s department scope · use ⋯ for RACI and a reminder.</div>}
            </div>
            <div style={{ marginBottom: 12 }} />

            {label("Description")}
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add more details about this task…"
              style={{ width: "100%", height: 88, resize: "vertical", borderRadius: 10, border: "1.5px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "12px 14px", fontSize: 13.5, fontFamily: "var(--font-sans)", color: "var(--sw-text)", outline: "none", marginBottom: 18 }} />

            {label("Attachments")}
            <label htmlFor="sw-file-input" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, width: "100%", minHeight: 76, borderRadius: 10, border: "1.5px dashed var(--sw-hair)", background: "var(--sw-hover)", cursor: "pointer", textAlign: "center", padding: 12 }}>
              <span style={{ fontSize: 19, color: "var(--sw-muted)" }}>📎</span>
              <span style={{ fontSize: 12.5, fontWeight: 400, color: "var(--sw-text)" }}>Click to attach files</span>
              <span style={{ fontSize: 11, color: "var(--sw-muted)" }}>or drag and drop — PDF, image, doc, spreadsheet</span>
              <input
                id="sw-file-input" type="file" multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []).map((f) => ({ id: Math.random().toString(36).slice(2), name: f.name, size: f.size }));
                  if (files.length) setAttachments((a) => [...a, ...files]);
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>
            {attachments.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                {attachments.map((f) => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", border: "1px solid var(--sw-hair)", borderRadius: 9, background: "var(--sw-card)" }}>
                    <span style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(122,13,32,0.08)", color: "var(--crimson)", fontSize: 11, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                      {(f.name.split(".").pop() || "").toUpperCase().slice(0, 3)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>{Math.max(1, Math.round(f.size / 1024))} KB</div>
                    </span>
                    <button onClick={() => setAttachments(attachments.filter((a) => a.id !== f.id))} style={{ border: "none", background: "none", color: "var(--sw-muted)", fontSize: 14, cursor: "pointer", flex: "none", lineHeight: 1 }}><IconX /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: SANSI ASSIST */}
          <div style={{ width: 300, flex: "none", overflowY: "auto", background: "var(--sw-sidebar)", borderLeft: "1px solid var(--sw-hair)", padding: "22px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ display: "inline-flex", color: "var(--crimson)" }}><IconSparkle size={15} /></span>
              <span style={{ fontSize: 14, fontWeight: 400, flex: 1 }}>Sansi Assist</span>
              <span style={{ background: "rgba(122,13,32,0.1)", color: "var(--crimson)", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", padding: "2px 8px", borderRadius: 999 }}>BETA</span>
            </div>

            <div style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 400, marginBottom: 3 }}>Smart suggestions</div>
              <div style={{ fontSize: 11.5, color: "var(--sw-muted)", marginBottom: 10 }}>Based on similar tasks and your activity.</div>
              {[
                { label: "Assign to Budi Hartono (worked on similar)", act: () => { const budi = profiles.find((p) => p.name === "Budi Hartono"); if (budi && !assignees.includes(budi.id)) setAssignees([...assignees, budi.id]); } },
                { label: "Set due date to this Friday", act: () => { const p = parseNLDate("fri"); if (p) { setDueText("fri"); setDue(p.iso); setDueLabel(p.label); } } },
                { label: "Add a reminder 1 day before", act: () => { const d = new Date(); d.setDate(d.getDate() + 4); d.setHours(9, 0, 0, 0); setReminder(d.toISOString().slice(0, 16)); } },
              ].map((sg) => (
                <button key={sg.label} onClick={sg.act} style={{ display: "block", width: "100%", textAlign: "left", border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, fontWeight: 400, color: "var(--sw-text)", cursor: "pointer", marginBottom: 7 }}>
                  {sg.label}
                </button>
              ))}
            </div>

            <div style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 400, marginBottom: 10 }}>Suggested assignees</div>
              {personal && <div style={{ fontSize: 11.5, color: "var(--sw-muted)" }}>Personal task — no suggestions needed.</div>}
              {!personal && suggestAssignees(store, name, listVal === "my" ? null : listVal, assignees).map(({ p: sa, reason }) => (
                <button key={sa.id} onClick={() => { if (!assignees.includes(sa.id)) setAssignees([...assignees, sa.id]); }}
                  style={{ display: "flex", alignItems: "flex-start", gap: 9, width: "100%", textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: "7px 0" }}>
                  <span style={{ width: 26, height: 26, borderRadius: 99, background: sa.color, color: "#fff", fontSize: 9.5, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", marginTop: 1 }}>{initials(sa.name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 400 }}>{sa.name}</span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--navy)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{reason}</span>
                  </span>
                </button>
              ))}
            </div>

            <div style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 400, marginBottom: 8 }}>Similar tasks</div>
              {tasks
                .filter((t) => name.trim().length > 2 && t.name.toLowerCase().includes(name.trim().toLowerCase().split(" ")[0]))
                .slice(0, 3)
                .map((t) => (
                  <div key={t.id} style={{ fontSize: 12.5, color: "var(--sw-text-soft)", padding: "5px 0", borderBottom: "1px solid var(--sw-hair)" }}>{t.name}</div>
                ))}
              {!(name.trim().length > 2) && <div style={{ fontSize: 12, color: "var(--sw-muted)" }}>Start typing a title to see similar tasks.</div>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 26px", borderTop: "1px solid var(--sw-hair)", flex: "none" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 400, color: "var(--sw-text-soft)", cursor: "pointer" }}>
            <input type="checkbox" checked={addAnother} onChange={(e) => setAddAnother(e.target.checked)} style={{ width: 16, height: 16 }} />
            Add another
          </label>
          <div style={{ flex: 1 }} />
          <button onClick={close} style={{ padding: "10px 18px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", fontSize: 13.5, fontWeight: 400, cursor: "pointer", color: "var(--sw-text-soft)" }}>Cancel</button>
          <button onClick={submit} style={{ padding: "10px 20px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 13.5, fontWeight: 400, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.3)" }}>Create task</button>
        </div>
      </div>
    </div>
  );
}
