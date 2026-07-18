"use client";
import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { STATUS_COLORS, PRIORITY_COLORS, STATUSES, initials, Task } from "@/lib/types";
import { iso, fmtShort, todayIso } from "@/lib/dates";
import { updateTask } from "@/lib/actions";
import { FilterState, EMPTY_FILTERS, applyFilters } from "@/lib/search";
import { TopIcons } from "./shared";
import { FilterBar } from "./filter-bar";
import { IconChevLeft, IconChevRight, IconX } from "./icons";

const TYPE_LABELS: Record<string, string> = { text: "Text", number: "Number", select: "Dropdown", date: "Date" };
const TYPE_ABBR: Record<string, string> = { text: "Tx", number: "#", select: "Dd", date: "Dt" };

export function ListSection() {
  const store = useStore();
  const {
    me, tasks, lists, spaces, profiles, templates, customFields, automations,
    savedViews, subtasks, deps, patch, supabase,
  } = store;
  const {
    listPage, activeList, setActiveTaskId, setShowQuickAdd, setQuickAddStatus,
    openProfile, pushToast,
  } = useUI();

  const [view, setView] = useState<"table" | "board" | "calendar" | "gantt">("table");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [ganttSpan, setGanttSpan] = useState(14);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showSaveView, setShowSaveView] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [showFields, setShowFields] = useState(false);
  const [showAutomations, setShowAutomations] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [tpl, setTpl] = useState({ name: "", desc: "", status: "Not Started", priority: "Medium", checklist: [] as string[], draft: "" });

  const today = todayIso();
  const list = lists.find((l) => l.id === activeList?.listId) || lists.find((l) => l.name === "Bank Docs") || lists[0];
  const space = spaces.find((s) => s.id === list?.space_id);

  const listPathOf = (t: Task) => {
    if (!t.list_id) return "My List (personal)";
    const l = lists.find((x) => x.id === t.list_id);
    const s = spaces.find((x) => x.id === l?.space_id);
    return `${s?.name || ""} / ${l?.name || ""}`;
  };

  const filtered = useMemo(
    () => applyFilters(tasks.filter((t) => t.list_id === list?.id), filters, today),
    [tasks, list, filters, today]
  );

  const setTask = (id: string, fields: Partial<Task>, toast?: string) => {
    const prev = tasks;
    updateTask(supabase, tasks, patch, id, fields);
    if (toast) pushToast(toast, () => patch("tasks", prev));
  };

  const rowPad = density === "compact" ? "7px 16px" : "12px 16px";
  const dueColor = (t: Task) => (t.due && t.due < today && t.status !== "Done" ? "var(--red)" : "var(--sw-text-soft)");
  const avatarsOf = (t: Task) => t.assignees.map((id) => profiles.find((p) => p.id === id)).filter(Boolean) as typeof profiles;

  const openQuickAdd = (status?: string) => { setQuickAddStatus(status || "Not Started"); setShowQuickAdd(true); };

  const statusGroups = STATUSES.map((s) => ({
    name: s,
    color: STATUS_COLORS[s],
    rows: filtered.filter((t) => t.status === s),
  })).filter((g) => g.rows.length > 0 || g.name !== "Done");

  /* ------- calendar computed ------- */
  const calStart = useMemo(() => {
    const first = new Date(calMonth);
    const s = new Date(first);
    s.setDate(first.getDate() - first.getDay());
    return s;
  }, [calMonth]);
  const calCells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(calStart);
    d.setDate(calStart.getDate() + i);
    return d;
  });
  const monthIso = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthTasks = filtered.filter((t) => t.due?.startsWith(monthIso));
  const overdueTasks = filtered.filter((t) => t.due && t.due < today && t.status !== "Done");
  const agenda = filtered
    .filter((t) => t.due && t.due >= today && t.status !== "Done")
    .sort((a, b) => a.due!.localeCompare(b.due!))
    .slice(0, 6);

  /* ------- gantt computed ------- */
  const ganttStart = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 3); d.setHours(0, 0, 0, 0); return d; }, []);
  const ganttWide = ganttSpan > 20;
  const dayMs = 86400000;
  const todayOffset = Math.round((new Date(today + "T00:00:00").getTime() - ganttStart.getTime()) / dayMs);
  const showTodayLine = todayOffset >= 0 && todayOffset < ganttSpan;
  const ganttDays = Array.from({ length: ganttSpan }, (_, i) => {
    const d = new Date(ganttStart);
    d.setDate(d.getDate() + i);
    const isToday = iso(d) === today;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const monthMark = d.getDate() === 1 || i === 0;
    return {
      day: d.getDate(),
      dow: monthMark ? d.toLocaleDateString("en-GB", { month: "short" }) : d.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2),
      color: isToday ? "var(--crimson)" : "var(--sw-text)",
      dowColor: isToday || monthMark ? "var(--crimson)" : "var(--sw-muted)",
      weekendBg: isWeekend ? "var(--sw-hover)" : "transparent",
    };
  });
  const ganttEnd = new Date(ganttStart); ganttEnd.setDate(ganttEnd.getDate() + ganttSpan - 1);
  const ganttRangeLabel = `${ganttStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${ganttEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  const ganttLanes = profiles
    .map((p) => {
      const windowStartIso = iso(ganttStart);
      const laneTasks = filtered.filter((t) => t.assignees[0] === p.id && t.due && t.due >= windowStartIso);
      if (!laneTasks.length) return null;
      const bars = laneTasks
        .map((t) => {
          const dueDate = new Date(t.due + "T00:00:00");
          const span = Math.max(1, Math.ceil((t.effort || 1) / 2));
          const startDate = new Date(dueDate);
          startDate.setDate(startDate.getDate() - (span - 1));
          const off = Math.max(0, Math.min(Math.round((startDate.getTime() - ganttStart.getTime()) / dayMs), ganttSpan - 1));
          const sp = Math.max(1, Math.min(span, ganttSpan - off));
          return { t, off, sp, row: 0 };
        })
        .sort((a, b) => a.off - b.off);
      const rowEnds: number[] = [];
      bars.forEach((b) => {
        let r = rowEnds.findIndex((e) => e <= b.off);
        if (r === -1) { r = rowEnds.length; rowEnds.push(0); }
        rowEnds[r] = b.off + b.sp;
        b.row = r;
      });
      const active = laneTasks.filter((t) => t.status !== "Done").length;
      const load: [string, string] = active >= 3 ? ["heavy", "var(--red)"] : active <= 1 ? ["light", "var(--green)"] : ["steady", "var(--sw-muted)"];
      return { p, bars, laneHeight: Math.max(44, 10 + rowEnds.length * 20 + 8), loadLabel: `${active} active · ${load[0]}`, loadColor: load[1] };
    })
    .filter(Boolean) as { p: (typeof profiles)[number]; bars: { t: Task; off: number; sp: number; row: number }[]; laneHeight: number; loadLabel: string; loadColor: string }[];

  /* ------- saved views ------- */
  const saveCurrentView = async () => {
    const name = saveViewName.trim();
    if (!name || !me) return;
    const config = { filters, view, density };
    const { data } = await supabase.from("saved_views").insert({ profile_id: me.id, name, config }).select().single();
    if (data) patch("savedViews", [...savedViews.filter((v) => v.name !== name), data]);
    setShowSaveView(false);
    setSaveViewName("");
    pushToast(`View "${name}" saved`);
  };
  const applySavedView = (config: Record<string, unknown>) => {
    if (config.filters) {
      setFilters({ ...EMPTY_FILTERS, ...(config.filters as Partial<FilterState>) });
    } else {
      // legacy saved views from the quick-filter era
      const legacy = (config.quickFilters as { mine?: boolean; overdue?: boolean } | undefined) || {};
      setFilters({
        ...EMPTY_FILTERS,
        text: (config.query as string) || "",
        assignees: legacy.mine && me ? [me.id] : [],
        due: legacy.overdue ? "overdue" : "",
      });
    }
    setView((config.view as typeof view) || "table");
    setDensity((config.density as typeof density) || "comfortable");
  };

  const listCF = customFields.filter((f) => f.list_id === list?.id);
  const listAuto = automations.filter((a) => a.list_id === list?.id);
  const listTpl = templates.filter((t) => t.list_id === list?.id);

  /* ================================================================ */
  const header = (title: string, dotColor: string, subtitle: string, extra?: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 22px" }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: dotColor, flex: "none" }} />
      <h1 style={{ fontSize: 16, fontWeight: 400, margin: 0 }}>{title}</h1>
      <span style={{ fontSize: 11.5, color: "var(--sw-muted)", fontWeight: 400 }}>{subtitle}</span>
      {extra}
      <div style={{ flex: 1 }} />
      <TopIcons />
    </div>
  );

  /* ---- Everything page ---- */
  if (listPage === "everything") {
    const everythingRows = applyFilters(tasks.filter((t) => t.list_id), filters, today);
    const groups = new Map<string, Task[]>();
    for (const t of everythingRows) {
      const key = listPathOf(t);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
        <header style={{ flex: "none", borderBottom: "1px solid var(--sw-hair)", background: "var(--sw-page)" }}>
          {header("Everything", "var(--navy)", "Every task across every space and list")}
          <div style={{ padding: "0 22px 10px" }}>
            <FilterBar value={filters} onChange={setFilters} people={profiles} resultCount={everythingRows.length} />
          </div>
        </header>
        <main style={{ flex: 1, overflowY: "auto", padding: "16px 22px 40px" }}>
          {Array.from(groups.entries()).map(([name, rows]) => (
            <div key={name} style={{ marginBottom: 18 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 12.5, fontWeight: 400, color: "var(--sw-text-soft)" }}>{name}</h3>
              <div style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
                {rows.slice(0, 30).map((t) => (
                  <button key={t.id} className="sw-row" onClick={() => setActiveTaskId(t.id)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "11px 16px", border: "none", borderBottom: "1px solid var(--sw-hair)", background: "none", cursor: "pointer" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_COLORS[t.status], flex: "none" }} />
                    <span style={{ fontSize: 10, color: "var(--sw-muted)", width: 46, flex: "none" }}>SW-{t.task_number}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 400, color: PRIORITY_COLORS[t.priority], flex: "none" }}>{t.priority}</span>
                    <span style={{ fontSize: 12, color: dueColor(t), width: 60, textAlign: "right", flex: "none", fontWeight: 400 }}>{t.due ? fmtShort(t.due) : ""}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </main>
      </div>
    );
  }

  /* ---- List page (table / board / calendar / gantt) ---- */
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
      <header style={{ flex: "none", borderBottom: "1px solid var(--sw-hair)", background: "var(--sw-page)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 22px 10px" }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: space?.color || "var(--navy)", flex: "none" }} />
          <span style={{ fontSize: 12.5, color: "var(--sw-muted)", fontWeight: 400 }}>{space?.name} /</span>
          <h1 style={{ fontSize: 16, fontWeight: 400, margin: 0 }}>{list?.name}</h1>
          <div style={{ flex: 1 }} />
          <TopIcons />
          <button onClick={() => openQuickAdd()} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--crimson)", color: "#fff", border: "none", borderRadius: 999, padding: "7px 15px", fontSize: 12.5, fontWeight: 400, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.25)" }}>
            <span style={{ fontSize: 13, lineHeight: 1 }}>+</span> New task
          </button>
        </div>

        {/* VIEW SWITCHER */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 22px" }}>
          {(["table", "board", "calendar", "gantt"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "9px 14px", border: "none", background: "none", borderBottom: `2px solid ${view === v ? "var(--crimson)" : "transparent"}`, color: view === v ? "var(--crimson)" : "var(--sw-text-soft)", fontSize: 12.5, fontWeight: 400, cursor: "pointer", marginBottom: -1 }}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowFields(true)} style={{ padding: "7px 13px", border: "none", background: "none", color: "var(--sw-text-soft)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>Fields</button>
          <button onClick={() => setShowAutomations(true)} style={{ padding: "7px 13px", border: "none", background: "none", color: "var(--sw-text-soft)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>Automations</button>
          <button onClick={() => setShowTemplates(true)} style={{ padding: "7px 13px", border: "none", background: "none", color: "var(--sw-text-soft)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>Templates</button>
        </div>

        {/* FILTER BAR */}
        <div style={{ padding: "9px 22px", borderTop: "1px solid var(--sw-hair)" }}>
          <FilterBar
            value={filters}
            onChange={setFilters}
            people={profiles}
            resultCount={filtered.length}
            extra={
              <>
                <button onClick={() => setDensity(density === "comfortable" ? "compact" : "comfortable")} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}>
                  {density === "comfortable" ? "Comfortable" : "Compact"}
                </button>
                <button onClick={() => { setShowSaveView(!showSaveView); setSaveViewName(""); }} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--crimson)", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}>+ Save view</button>
              </>
            }
          />
        </div>
        {showSaveView && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 22px 9px" }}>
            <input value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveCurrentView(); }} placeholder="Name this view (filters, search & layout are saved)…" style={{ width: 300, height: 30, borderRadius: 8, border: "1px solid var(--crimson)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 12, color: "var(--sw-text)", outline: "none" }} />
            <button onClick={saveCurrentView} style={{ padding: "6px 14px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}>Save</button>
            <button onClick={() => setShowSaveView(false)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", color: "var(--sw-text-soft)", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}>Cancel</button>
          </div>
        )}
        {savedViews.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 22px 9px", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 400, color: "var(--sw-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Saved views</span>
            {savedViews.map((v) => (
              <span key={v.id} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--sw-hair)", borderRadius: 999, background: "var(--sw-card)", padding: "4px 5px 4px 12px" }}>
                <button onClick={() => applySavedView(v.config)} style={{ border: "none", background: "none", color: "var(--sw-text)", fontSize: 11.5, fontWeight: 400, cursor: "pointer", padding: 0 }}>{v.name}</button>
                <button
                  onClick={async (e) => { e.stopPropagation(); await supabase.from("saved_views").delete().eq("id", v.id); patch("savedViews", savedViews.filter((x) => x.id !== v.id)); }}
                  title="Delete view"
                  style={{ border: "none", background: "var(--sw-hover)", width: 17, height: 17, borderRadius: 99, cursor: "pointer", fontSize: 9, color: "var(--sw-muted)", padding: 0 }}
                >
                  <IconX size={9} />
                </button>
              </span>
            ))}
          </div>
        )}
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "0 22px 40px" }}>
        {/* TABLE VIEW */}
        {view === "table" &&
          statusGroups.map((grp) => (
            <section key={grp.name} style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: grp.color, flex: "none" }} />
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 400 }}>{grp.name}</h3>
                <span style={{ fontSize: 11.5, color: "var(--sw-muted)", fontWeight: 400 }}>{grp.rows.length}</span>
              </div>
              <div style={{ border: "1px solid var(--sw-hair)", borderRadius: 12, overflow: "hidden", background: "var(--sw-card)", boxShadow: "var(--shadow-card)", marginTop: 8 }}>
                {grp.rows.map((t) => (
                  <div key={t.id} onClick={() => setActiveTaskId(t.id)} role="button" tabIndex={0} className="sw-row" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: rowPad, borderBottom: "1px solid var(--sw-hair)", background: "none", cursor: "pointer" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLORS[t.status], flex: "none" }} />
                    <span style={{ fontSize: 10, color: "var(--sw-muted)", width: 46, flex: "none" }}>SW-{t.task_number}</span>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      {t.milestone && <span title="Milestone" style={{ color: "var(--crimson)", fontSize: 10, flex: "none" }}>◆</span>}
                      <span style={{ fontSize: 12.5, fontWeight: 400, color: "var(--sw-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                      {(() => {
                        const st = subtasks.filter((x) => x.task_id === t.id);
                        return st.length ? <span title="Subtasks done" style={{ fontSize: 9.5, fontWeight: 400, color: "var(--sw-muted)", border: "1px solid var(--sw-hair)", padding: "1px 6px", borderRadius: 999, flex: "none" }}>{st.filter((x) => x.done).length}/{st.length}</span> : null;
                      })()}
                      {(() => {
                        const openBlockers = deps.filter((d) => d.task_id === t.id).map((d) => tasks.find((x) => x.id === d.depends_on)).filter((x) => x && x.status !== "Done");
                        return openBlockers.length ? <span title="Blocked by open tasks" style={{ fontSize: 9.5, fontWeight: 400, color: "var(--red)", background: "rgba(243,38,62,0.1)", padding: "1px 6px", borderRadius: 999, flex: "none" }}>BLOCKED ·{openBlockers.length}</span> : null;
                      })()}
                    </span>
                    <span style={{ display: "flex", marginRight: 2 }}>
                      {avatarsOf(t).map((p) => (
                        <button key={p!.id} onClick={(e) => { e.stopPropagation(); openProfile(p!.id); }} title="View profile" style={{ width: 22, height: 22, borderRadius: 99, background: p!.color, color: "#fff", fontSize: 9, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--sw-card)", marginLeft: -7, cursor: "pointer", padding: 0 }}>
                          {initials(p!.name)}
                        </button>
                      ))}
                    </span>
                    <span style={{ fontSize: 11.5, color: dueColor(t), width: 64, textAlign: "right", flex: "none", fontWeight: 400 }}>{t.due ? fmtShort(t.due) : ""}</span>
                    <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: "0.03em", color: PRIORITY_COLORS[t.priority], width: 56, textAlign: "right", flex: "none" }}>{t.priority}</span>
                  </div>
                ))}
                <button onClick={() => openQuickAdd(grp.name)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 16px", border: "none", background: "none", color: "var(--sw-muted)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>+ Add task</button>
              </div>
            </section>
          ))}

        {/* KANBAN VIEW */}
        {view === "board" && (
          <div style={{ display: "flex", gap: 14, marginTop: 18, paddingBottom: 20, overflowX: "auto" }}>
            {STATUSES.map((s) => {
              const rows = filtered.filter((t) => t.status === s);
              return (
                <div key={s} style={{ width: 264, flex: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 4px 10px", borderTop: `3px solid ${STATUS_COLORS[s]}` }}>
                    <h3 style={{ margin: "10px 0 0", fontSize: 12.5, fontWeight: 400, flex: 1 }}>{s}</h3>
                    <span style={{ fontSize: 11, color: "var(--sw-muted)", fontWeight: 400, marginTop: 10 }}>{rows.length}</span>
                  </div>
                  <div
                    onDragOver={(e) => { e.preventDefault(); if (dragOver !== s) setDragOver(s); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId) setTask(dragId, { status: s as Task["status"] }, `Task moved to ${s}`);
                      setDragId(null);
                      setDragOver(null);
                    }}
                    style={{ display: "flex", flexDirection: "column", gap: 9, minHeight: 40, borderRadius: 11, padding: 4, margin: -4, background: dragOver === s ? "rgba(122,13,32,0.06)" : "transparent", transition: "background .12s" }}
                  >
                    {rows.map((t) => (
                      <div
                        key={t.id}
                        className="sw-card-h"
                        onClick={() => setActiveTaskId(t.id)}
                        draggable
                        onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => { setDragId(null); setDragOver(null); }}
                        role="button"
                        tabIndex={0}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 13px", border: "1px solid var(--sw-hair)", borderRadius: 11, background: "var(--sw-card)", boxShadow: "var(--shadow-card)", cursor: "grab" }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 400, marginBottom: 8, lineHeight: 1.35 }}>{t.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 9.5, fontWeight: 400, color: PRIORITY_COLORS[t.priority], flex: 1 }}>{t.priority}</span>
                          <span style={{ display: "flex" }}>
                            {avatarsOf(t).map((p) => (
                              <button key={p!.id} onClick={(e) => { e.stopPropagation(); openProfile(p!.id); }} title="View profile" style={{ width: 19, height: 19, borderRadius: 99, background: p!.color, color: "#fff", fontSize: 8, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--sw-card)", marginLeft: -6, cursor: "pointer", padding: 0 }}>
                                {initials(p!.name)}
                              </button>
                            ))}
                          </span>
                          <span style={{ fontSize: 10.5, color: dueColor(t), fontWeight: 400 }}>{t.due ? fmtShort(t.due) : ""}</span>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => openQuickAdd(s)} style={{ textAlign: "left", padding: "8px 10px", border: "1px dashed var(--sw-hair)", borderRadius: 10, background: "none", color: "var(--sw-muted)", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}>+ Add task</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CALENDAR VIEW */}
        {view === "calendar" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 12 }}>
              <button onClick={() => { const d = new Date(); setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} style={{ padding: "7px 14px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>Today</button>
              <div style={{ display: "flex", border: "1px solid var(--sw-hair)", borderRadius: 8, overflow: "hidden" }}>
                <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))} style={{ width: 30, height: 30, border: "none", borderRight: "1px solid var(--sw-hair)", background: "var(--sw-hover)", cursor: "pointer", color: "var(--sw-text-soft)", fontSize: 13 }}><IconChevLeft /></button>
                <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))} style={{ width: 30, height: 30, border: "none", background: "var(--sw-hover)", cursor: "pointer", color: "var(--sw-text-soft)", fontSize: 13 }}><IconChevRight /></button>
              </div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 400, fontFamily: "var(--font-serif)", fontStyle: "italic" }}>{calMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h3>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11.5, color: "var(--sw-text-soft)", fontWeight: 400 }}>
                {[["var(--red)", "Critical"], ["var(--crimson)", "High"], ["var(--navy)", "Medium"], ["var(--green)", "Low"]].map(([c, l]) => (
                  <span key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: c }} />{l}</span>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", border: "1px solid var(--sw-hair)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-card)", boxSizing: "border-box", width: "100%" }}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dw) => (
                    <div key={dw} style={{ boxSizing: "border-box", background: "var(--sw-sidebar)", padding: "8px 0", textAlign: "center", fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", color: "var(--sw-muted)", borderBottom: "1px solid var(--sw-hair)" }}>{dw}</div>
                  ))}
                  {calCells.map((d, ci) => {
                    const dIso = iso(d);
                    const inMonth = d.getMonth() === calMonth.getMonth();
                    const isToday = dIso === today;
                    const evs = filtered.filter((t) => t.due === dIso);
                    const shown = evs.slice(0, 2);
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div key={ci} style={{ boxSizing: "border-box", background: isWeekend ? "var(--sw-hover)" : "var(--sw-card)", minHeight: 100, padding: "7px 8px", display: "flex", flexDirection: "column", gap: 4, borderTop: "1px solid var(--sw-hair)", borderLeft: "1px solid var(--sw-hair)", marginLeft: -1, marginTop: -1, outline: isToday ? "2px solid var(--crimson)" : "none", outlineOffset: -2 }}>
                        <span style={{ width: 20, height: 20, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 400, color: isToday ? "#fff" : inMonth ? "var(--sw-text)" : "var(--sw-muted)", background: isToday ? "var(--crimson)" : "transparent", flex: "none" }}>{d.getDate()}</span>
                        {shown.map((t) => {
                          const a = profiles.find((p) => p.id === t.assignees[0]);
                          const overdue = t.due! < today && t.status !== "Done";
                          return (
                            <button key={t.id} onClick={() => setActiveTaskId(t.id)} style={{ boxSizing: "border-box", display: "block", width: "100%", textAlign: "left", border: "none", borderLeft: `3px solid ${STATUS_COLORS[t.status]}`, borderRadius: 5, padding: "4px 6px", background: overdue ? "rgba(243,38,62,0.06)" : "var(--sw-hover)", cursor: "pointer", overflow: "hidden" }}>
                              <span style={{ display: "block", fontSize: 10.5, fontWeight: 400, color: "var(--sw-text)", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                              <span style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                                <span style={{ width: 13, height: 13, borderRadius: 99, background: a?.color || "#9A918A", color: "#fff", fontSize: 7, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{a ? initials(a.name) : "?"}</span>
                                <span style={{ fontSize: 9, color: overdue ? "var(--red)" : t.priority === "Critical" || t.priority === "High" ? PRIORITY_COLORS[t.priority] : "var(--sw-muted)" }}>{overdue ? "Overdue" : t.priority}</span>
                              </span>
                            </button>
                          );
                        })}
                        {evs.length > 2 && <span style={{ fontSize: 10, fontWeight: 400, color: "var(--sw-muted)", paddingLeft: 2 }}>+{evs.length - 2} more</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <aside style={{ width: 240, flex: "none" }}>
                <div style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: 14, boxShadow: "var(--shadow-card)", marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 18, fontWeight: 800, color: "var(--red)" }}>{overdueTasks.length}</div><div style={{ fontSize: 10.5, color: "var(--sw-muted)", fontWeight: 400 }}>Overdue</div></div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 18, fontWeight: 800 }}>{monthTasks.length}</div><div style={{ fontSize: 10.5, color: "var(--sw-muted)", fontWeight: 400 }}>This month</div></div>
                  </div>
                </div>
                <h4 style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 400 }}>Next deadlines</h4>
                {agenda.map((t) => (
                  <button key={t.id} className="sw-row" onClick={() => setActiveTaskId(t.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px 0", border: "none", borderBottom: "1px solid var(--sw-hair)", background: "none", cursor: "pointer" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: PRIORITY_COLORS[t.priority], flex: "none" }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>{t.due ? fmtShort(t.due) : ""}</div>
                    </span>
                  </button>
                ))}
              </aside>
            </div>
          </>
        )}

        {/* GANTT VIEW */}
        {view === "gantt" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, marginBottom: 12 }}>
              <span style={{ fontSize: 11.5, color: "var(--sw-text-soft)", fontWeight: 400 }}>{ganttRangeLabel}</span>
              <div style={{ display: "flex", gap: 3, background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: 3 }}>
                <button onClick={() => setGanttSpan(14)} style={{ padding: "4px 12px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 400, background: !ganttWide ? "var(--crimson)" : "transparent", color: !ganttWide ? "#fff" : "var(--sw-text-soft)" }}>2 weeks</button>
                <button onClick={() => setGanttSpan(90)} style={{ padding: "4px 12px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 400, background: ganttWide ? "var(--crimson)" : "transparent", color: ganttWide ? "#fff" : "var(--sw-text-soft)" }}>3 months</button>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--sw-text-soft)", fontWeight: 400 }}>
                {[["var(--red)", "Critical"], ["var(--crimson)", "High"], ["var(--navy)", "Medium"], ["var(--green)", "Low"]].map(([c, l]) => (
                  <span key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: c }} />{l}</span>
                ))}
              </div>
            </div>

            <div style={{ border: "1px solid var(--sw-hair)", borderRadius: 14, overflowX: "auto", boxShadow: "var(--shadow-card)", background: "var(--sw-card)" }}>
              <div style={{ display: "flex", borderBottom: "1px solid var(--sw-hair)", minWidth: ganttWide ? 240 + ganttSpan * 34 : "100%" }}>
                <div style={{ width: 240, flex: "none", padding: "11px 16px", background: "var(--sw-sidebar)", position: "sticky", left: 0, zIndex: 4 }} />
                <div style={{ flex: 1, display: "flex", position: "relative", background: "var(--sw-sidebar)" }}>
                  {ganttDays.map((gd, i) => (
                    <div key={i} style={{ flex: 1, textAlign: "center", padding: "10px 2px", background: gd.weekendBg }}>
                      <div style={{ fontSize: 9, fontWeight: 400, letterSpacing: "0.03em", color: gd.dowColor, textTransform: "uppercase" }}>{gd.dow}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 400, color: gd.color, marginTop: 1 }}>{gd.day}</div>
                    </div>
                  ))}
                </div>
              </div>

              {ganttLanes.map((gl) => (
                <div key={gl.p.id} style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--sw-hair)", position: "relative", minWidth: ganttWide ? 240 + ganttSpan * 34 : "100%" }}>
                  <button onClick={() => openProfile(gl.p.id)} title="View profile" style={{ width: 240, flex: "none", textAlign: "left", padding: "10px 16px", border: "none", borderRight: "1px solid var(--sw-hair)", background: "var(--sw-card)", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, position: "sticky", left: 0, zIndex: 3 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 99, background: gl.p.color, color: "#fff", fontSize: 9, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{initials(gl.p.name)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{gl.p.name}</span>
                      <span style={{ display: "block", fontSize: 9.5, color: gl.loadColor }}>{gl.loadLabel}</span>
                    </span>
                  </button>
                  <div style={{ flex: 1, position: "relative", height: gl.laneHeight, display: "flex" }}>
                    {ganttDays.map((gd, i) => (
                      <div key={i} style={{ flex: 1, borderLeft: "1px solid var(--sw-hair)", background: gd.weekendBg }} />
                    ))}
                    {showTodayLine && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(todayOffset / ganttSpan) * 100}%`, width: 2, background: "var(--crimson)", zIndex: 2 }} />}
                    {gl.bars.map((b) => (
                      <button key={b.t.id} onClick={() => setActiveTaskId(b.t.id)} title={b.t.name} style={{ position: "absolute", top: 10 + b.row * 20, height: 15, left: `${(b.off / ganttSpan) * 100}%`, width: `${(b.sp / ganttSpan) * 100}%`, borderRadius: 99, border: "none", background: PRIORITY_COLORS[b.t.priority], opacity: b.t.status === "Done" ? 0.4 : 1, cursor: "pointer", display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden", boxShadow: "0 2px 6px rgba(23,18,15,0.15)", zIndex: 1 }}>
                        <span style={{ fontSize: 8.5, fontWeight: 400, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* FIELDS MODAL */}
      {showFields && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 45, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowFields(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "92vw", maxHeight: "82vh", overflowY: "auto", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "24px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 400, flex: 1 }}>Custom fields</h3>
              <button onClick={() => setShowFields(false)} style={{ border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--sw-muted)" }}>Fields defined here appear as extra columns on every task in this list.</p>
            {listCF.map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--sw-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 400, color: "var(--sw-text-soft)", flex: "none" }}>{TYPE_ABBR[f.type]}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 400 }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: "var(--sw-muted)" }}>{TYPE_LABELS[f.type]}</div>
                </span>
                <button
                  onClick={async () => { await supabase.from("custom_fields").delete().eq("id", f.id); patch("customFields", customFields.filter((x) => x.id !== f.id)); }}
                  style={{ border: "none", background: "none", color: "var(--red)", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <input value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} placeholder="New field name…" style={{ flex: 1, height: 38, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, color: "var(--sw-text)", outline: "none" }} />
              <select className="sw-select" value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)} style={{ height: 38, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12.5, color: "var(--sw-text)", width: 120 }}>
                <option value="text">Text</option><option value="number">Number</option><option value="select">Dropdown</option><option value="date">Date</option>
              </select>
              <button
                onClick={async () => {
                  if (!newFieldName.trim() || !list) return;
                  const { data } = await supabase.from("custom_fields").insert({ list_id: list.id, name: newFieldName.trim(), type: newFieldType }).select().single();
                  if (data) patch("customFields", [...customFields, data]);
                  setNewFieldName("");
                }}
                style={{ padding: "0 16px", borderRadius: 9, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 13, fontWeight: 400, cursor: "pointer" }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUTOMATIONS MODAL */}
      {showAutomations && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 45, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowAutomations(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "92vw", maxHeight: "82vh", overflowY: "auto", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "24px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 400, flex: 1 }}>Automations</h3>
              <button onClick={() => setShowAutomations(false)} style={{ border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--sw-muted)" }}>Rules run automatically whenever a task in this list matches the trigger.</p>
            {listAuto.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 400 }}>When <em style={{ fontStyle: "italic", color: "var(--crimson)" }}>{a.trigger}</em></div>
                  <div style={{ fontSize: 11.5, color: "var(--sw-muted)", marginTop: 2 }}>→ {a.action}</div>
                </span>
                <span
                  onClick={async () => {
                    const next = automations.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x));
                    patch("automations", next);
                    await supabase.from("automations").update({ enabled: !a.enabled }).eq("id", a.id);
                  }}
                  style={{ width: 36, height: 20, borderRadius: 999, background: a.enabled ? "var(--crimson)" : "var(--sw-hair)", position: "relative", flex: "none", cursor: "pointer", transition: "background .15s" }}
                >
                  <span style={{ position: "absolute", top: 2, left: a.enabled ? 18 : 2, width: 16, height: 16, borderRadius: 99, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
                </span>
              </div>
            ))}
            <button
              onClick={async () => {
                if (!list) return;
                const { data } = await supabase.from("automations").insert({ list_id: list.id, trigger: "a task is created", action: "Set priority to Medium", enabled: true }).select().single();
                if (data) patch("automations", [...automations, data]);
              }}
              style={{ marginTop: 14, padding: "9px 16px", borderRadius: 999, border: "1px dashed var(--sw-hair)", background: "none", color: "var(--sw-text-soft)", fontSize: 12.5, fontWeight: 400, cursor: "pointer" }}
            >
              + Add automation rule
            </button>
          </div>
        </div>
      )}

      {/* TEMPLATES MODAL */}
      {showTemplates && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 45, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowTemplates(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "92vw", maxHeight: "82vh", overflowY: "auto", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "24px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 400, flex: 1 }}>Task templates</h3>
              <button onClick={() => setShowTemplates(false)} style={{ border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--sw-muted)" }}>A template saves a task&apos;s recurring shape — starting status/priority, a checklist, and a description — so creating similar work is one click instead of retyping it each time.</p>
            {listTpl.map((tp) => {
              const expanded = expandedTemplate === tp.id;
              return (
                <div key={tp.id} style={{ border: "1px solid var(--sw-hair)", borderRadius: 10, marginBottom: 9, overflow: "hidden" }}>
                  <button onClick={() => setExpandedTemplate(expanded ? null : tp.id)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "12px 14px", border: "none", background: "var(--sw-hover)", cursor: "pointer" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 400 }}>{tp.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--sw-muted)", marginTop: 2 }}>{tp.description}</div>
                    </span>
                    <span style={{ fontSize: 11, color: "var(--sw-muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
                  </button>
                  {expanded && (
                    <div style={{ padding: "12px 14px", borderTop: "1px solid var(--sw-hair)" }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-text-soft)", background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "3px 10px" }}>Starts: {tp.status}</span>
                        <span style={{ fontSize: 11, fontWeight: 400, color: PRIORITY_COLORS[tp.priority] || "var(--sw-text-soft)", background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "3px 10px" }}>{tp.priority} priority</span>
                      </div>
                      {tp.checklist.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 6 }}>Checklist</div>
                          {tp.checklist.map((ci, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--sw-text-soft)", padding: "3px 0" }}>
                              <span style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid var(--sw-hair)", flex: "none" }} />{ci}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  <div style={{ padding: "10px 14px", borderTop: "1px solid var(--sw-hair)", display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={async () => {
                        if (!me || !list) return;
                        const desc = tp.checklist.length ? `${tp.description || ""}\n\nChecklist:\n${tp.checklist.map((c) => `☐ ${c}`).join("\n")}` : tp.description || "";
                        const { createTask } = await import("@/lib/actions");
                        const created = await createTask(supabase, tasks, patch, {
                          name: tp.name, list_id: list.id, owner_id: me.id, status: tp.status, priority: tp.priority,
                          due: today, description: desc, assignees: [me.id],
                        });
                        if (created) pushToast(`Task "${created.name}" created from template`);
                        setShowTemplates(false);
                      }}
                      style={{ padding: "6px 13px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}
                    >
                      Use this template →
                    </button>
                  </div>
                </div>
              );
            })}
            <button onClick={() => { setShowCreateTemplate(true); setTpl({ name: "", desc: "", status: "Not Started", priority: "Medium", checklist: [], draft: "" }); }} style={{ marginTop: 14, padding: "9px 16px", borderRadius: 999, border: "1px dashed var(--sw-hair)", background: "none", color: "var(--sw-text-soft)", fontSize: 12.5, fontWeight: 400, cursor: "pointer" }}>
              + Save current view as template
            </button>
          </div>
        </div>
      )}

      {/* CREATE TEMPLATE MODAL */}
      {showCreateTemplate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 46, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowCreateTemplate(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "24px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 400, flex: 1 }}>New template</h3>
              <button onClick={() => setShowCreateTemplate(false)} style={{ border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--sw-muted)" }}>Saves a reusable task shape — name, defaults, and a starting checklist.</p>
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Template name</label>
            <input value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} placeholder="e.g. Vendor onboarding checklist" style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13.5, marginBottom: 14, outline: "none", color: "var(--sw-text)" }} />
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Description</label>
            <input value={tpl.desc} onChange={(e) => setTpl({ ...tpl, desc: e.target.value })} placeholder="Shown under the template name" style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 14, outline: "none", color: "var(--sw-text)" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Starting status</label>
                <select className="sw-select" value={tpl.status} onChange={(e) => setTpl({ ...tpl, status: e.target.value })} style={{ width: "100%", height: 38, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12.5, color: "var(--sw-text)" }}>
                  <option>Not Started</option><option>Working on it</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Priority</label>
                <select className="sw-select" value={tpl.priority} onChange={(e) => setTpl({ ...tpl, priority: e.target.value })} style={{ width: "100%", height: 38, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12.5, color: "var(--sw-text)" }}>
                  <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                </select>
              </div>
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Checklist items</label>
            {tpl.checklist.map((ci, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ flex: 1, fontSize: 12.5, padding: "8px 10px", background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 8 }}>{ci}</span>
                <button onClick={() => setTpl({ ...tpl, checklist: tpl.checklist.filter((_, j) => j !== i) })} style={{ border: "none", background: "none", color: "var(--red)", fontSize: 13, cursor: "pointer" }}><IconX /></button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              <input
                value={tpl.draft}
                onChange={(e) => setTpl({ ...tpl, draft: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter" && tpl.draft.trim()) { e.preventDefault(); setTpl({ ...tpl, checklist: [...tpl.checklist, tpl.draft.trim()], draft: "" }); } }}
                placeholder="Add a checklist item, press Enter"
                style={{ flex: 1, height: 36, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 12.5, color: "var(--sw-text)", outline: "none" }}
              />
              <button onClick={() => { if (tpl.draft.trim()) setTpl({ ...tpl, checklist: [...tpl.checklist, tpl.draft.trim()], draft: "" }); }} style={{ padding: "0 14px", borderRadius: 9, border: "1px solid var(--sw-hair)", background: "none", color: "var(--sw-text-soft)", fontSize: 12.5, fontWeight: 400, cursor: "pointer" }}>Add</button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowCreateTemplate(false)} style={{ padding: "9px 16px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", fontSize: 13, fontWeight: 400, cursor: "pointer", color: "var(--sw-text-soft)" }}>Cancel</button>
              <button
                onClick={async () => {
                  if (!tpl.name.trim() || !list) return;
                  const description = tpl.desc.trim() || `${tpl.priority} priority · starts ${tpl.status}${tpl.checklist.length ? ` · ${tpl.checklist.length}-step checklist` : ""}`;
                  const { data } = await supabase.from("templates").insert({ list_id: list.id, name: tpl.name.trim(), description, status: tpl.status, priority: tpl.priority, checklist: tpl.checklist }).select().single();
                  if (data) patch("templates", [...templates, { ...data, checklist: data.checklist || [] }]);
                  setShowCreateTemplate(false);
                }}
                style={{ padding: "9px 18px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 13, fontWeight: 400, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.3)" }}
              >
                Save template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
