"use client";
import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { STATUS_COLORS, PRIORITY_COLORS, STATUSES, Task, initials } from "@/lib/types";
import { iso, fmtShort, fmtFull, todayIso } from "@/lib/dates";
import { atRiskTasks, isOpen, tasksOfPerson, workloadPct, efficiencyScore, departmentRisk } from "@/lib/logic";
import { FilterState, EMPTY_FILTERS, applyFilters } from "@/lib/search";
import { TopIcons, Avatar } from "./shared";
import { GlobalSearch } from "./global-search";
import { FilterBar } from "./filter-bar";
import { IconCheckSquare, IconClock, IconFlag, IconGrid, IconSquare, IconX } from "./icons";

/* My Work hub — one home for everything assigned to you.
   Tabs: Today (overview) · This Week (day columns) · All tasks (filterable) · Personal. */
export function HomeSection() {
  const store = useStore();
  const { me, tasks, lists, spaces, profiles, notifications, departments, deptMembers } = store;
  const {
    homePage, setHomePage, setShowQuickAdd, setActiveTaskId,
    setCompanyPage, setWorkspacePage, openProfile,
  } = useUI();
  const [statusTab, setStatusTab] = useState("Not Started");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [missedDismissed, setMissedDismissed] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const today = todayIso();
  const myTasks = useMemo(() => (me ? tasksOfPerson(tasks, me.id) : []), [tasks, me]);

  const weekStart = useMemo(() => {
    const m = new Date();
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return m;
  }, []);
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 6);
    return iso(e);
  }, [weekStart]);
  const weekStartIso = iso(weekStart);

  if (!me) return null;

  const myOpen = myTasks.filter(isOpen);
  const dueThisWeek = myOpen.filter((t) => t.due && t.due >= weekStartIso && t.due <= weekEnd);
  const atRiskAll = atRiskTasks(tasks);
  const myAtRisk = atRiskAll.filter((r) => r.task.assignee_id === me.id);
  const completedThisWeek = myTasks.filter((t) => t.status === "Done" && t.completed_at && t.completed_at.slice(0, 10) >= weekStartIso);
  const activeProjects = lists.filter((l) => tasks.some((t) => t.list_id === l.id && isOpen(t))).length;

  const goAll = () => setHomePage("all");

  const metrics = [
    { icon: <IconSquare />, label: "My open tasks", value: myOpen.length, tint: "var(--sw-hover)", nav: goAll },
    { icon: <IconClock />, label: "Due this week", value: dueThisWeek.length, tint: "rgba(34,64,158,0.12)", nav: goAll },
    { icon: <IconFlag />, label: "At risk", value: myAtRisk.length, tint: "rgba(243,38,62,0.12)", nav: goAll },
    { icon: <IconCheckSquare />, label: "Completed this week", value: completedThisWeek.length, tint: "rgba(13,79,49,0.12)", nav: goAll },
    { icon: <IconGrid />, label: "Projects active", value: activeProjects, tint: "var(--sw-hover)", nav: () => setCompanyPage("executive") },
  ];

  const listPathOf = (t: Task) => {
    if (!t.list_id) return "Personal";
    const l = lists.find((x) => x.id === t.list_id);
    const s = spaces.find((x) => x.id === l?.space_id);
    return `${s?.name || ""} / ${l?.name || ""}`;
  };

  const tabRows = myTasks.filter((t) => t.status === statusTab && (statusTab === "Done" ? (t.completed_at || "") >= weekStartIso : true)).slice(0, 8);
  const tabCounts: Record<string, number> = {};
  for (const s of STATUSES) tabCounts[s] = myTasks.filter((t) => t.status === s && (s === "Done" ? (t.completed_at || "") >= weekStartIso : true)).length;

  const deadlines = [...myOpen]
    .filter((t) => t.due)
    .sort((a, b) => (a.due! < b.due! ? -1 : 1))
    .slice(0, 4);

  const workloadPeople = profiles.filter((p) => p.email.endsWith("@sansico.com")).slice(0, 3)
    .map((p) => ({ p, pct: workloadPct(tasks, p) }))
    .sort((a, b) => b.pct - a.pct);

  // Company pulse: average dept efficiency
  const deptScores = departments.map((d) => {
    const memberIds = deptMembers.filter((m) => m.department_id === d.id).map((m) => m.profile_id);
    const dTasks = tasks.filter((t) => !!t.assignee_id && memberIds.includes(t.assignee_id));
    return { d, eff: efficiencyScore(dTasks).score, risk: departmentRisk(dTasks) };
  });
  const health = deptScores.length ? Math.round(deptScores.reduce((s, x) => s + x.eff, 0) / deptScores.length) : 100;
  const onTrack = deptScores.filter((x) => x.risk < 50).length;

  const unread = notifications.filter((n) => !n.read);
  const missedAssigned = unread.filter((n) => n.reason === "Assigned").length;
  const missedOther = unread.length - missedAssigned;
  const missedLine =
    "While you were away: " +
    (missedAssigned ? `${missedAssigned} new assignment${missedAssigned > 1 ? "s" : ""}` : "") +
    (missedAssigned && missedOther ? " and " : "") +
    (missedOther ? `${missedOther} other update${missedOther > 1 ? "s" : ""}` : "") + ".";

  const homePad = density === "compact" ? "5px 4px" : "8px 4px";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = me.name.split(" ")[0];

  // This Week view
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const weekDays = DAY_NAMES.map((dn, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const isoD = iso(d);
    const rows = myTasks.filter((t) => t.due === isoD);
    return {
      name: dn,
      dateLabel: `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`,
      isToday: isoD === today,
      rows,
    };
  }).filter((d, i) => d.rows.length > 0 || i < 5);
  const weekOverdue = myTasks.filter((t) => t.due && t.due < today && t.status !== "Done");

  // All / Personal tab rows
  const personalTasks = tasks.filter((t) => !t.list_id && (t.owner_id === me.id || t.assignee_id === me.id));
  const allSource = homePage === "personal" ? personalTasks : myTasks;
  const allFiltered = applyFilters(allSource, filters, today);
  const allGroups = STATUSES.map((s) => ({ name: s, color: STATUS_COLORS[s], rows: allFiltered.filter((t) => t.status === s) }))
    .filter((g) => g.rows.length > 0);

  const TABS: { key: typeof homePage; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "myweek", label: "This Week" },
    { key: "all", label: "All tasks" },
    { key: "personal", label: "Personal" },
  ];

  const taskTable = (
    <>
      <div style={{ marginBottom: 14 }}>
        <FilterBar
          value={filters}
          onChange={setFilters}
          people={profiles}
          resultCount={allFiltered.length}
          extra={
            <button onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}>
              {density === "comfortable" ? "Comfortable" : "Compact"}
            </button>
          }
        />
      </div>
      {allGroups.map((grp) => (
        <section key={grp.name} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: grp.color, flex: "none" }} />
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 400 }}>{grp.name}</h3>
            <span style={{ fontSize: 11.5, color: "var(--sw-muted)", fontWeight: 400 }}>{grp.rows.length}</span>
          </div>
          <div style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
            {grp.rows.map((t) => (
              <button key={t.id} className="sw-row" onClick={() => setActiveTaskId(t.id)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: density === "compact" ? "7px 16px" : "11px 16px", border: "none", borderBottom: "1px solid var(--sw-hair)", background: "none", cursor: "pointer" }}>
                <span style={{ fontSize: 10, color: "var(--sw-muted)", fontWeight: 400, width: 48, flex: "none" }}>SW-{t.task_number}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 400, color: "var(--sw-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginTop: 1 }}>{listPathOf(t)}</div>
                </span>
                <span style={{ display: "flex", marginRight: 2 }}>
                  {[t.assignee_id].map((id) => profiles.find((p) => p.id === id)).filter(Boolean).map((p) => (
                    <span key={p!.id} style={{ width: 20, height: 20, borderRadius: 99, background: p!.color, color: "#fff", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--sw-card)", marginLeft: -6 }}>{initials(p!.name)}</span>
                  ))}
                </span>
                <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: "0.04em", color: PRIORITY_COLORS[t.priority], width: 52, textAlign: "right", flex: "none" }}>{t.priority}</span>
                <span style={{ fontSize: 11, color: t.due && t.due < today && t.status !== "Done" ? "var(--red)" : "var(--sw-text-soft)", width: 54, textAlign: "right", flex: "none" }}>{t.due ? fmtShort(t.due) : ""}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {!allFiltered.length && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--sw-muted)" }}>
          <p style={{ margin: "0 0 10px", fontSize: 13 }}>{homePage === "personal" ? "No personal tasks yet." : "Nothing matches these filters."}</p>
          {homePage === "personal" && (
            <button onClick={() => setShowQuickAdd(true)} style={{ padding: "8px 18px", borderRadius: 999, border: "1px dashed var(--sw-hair)", background: "none", color: "var(--sw-text-soft)", fontSize: 12.5, cursor: "pointer" }}>+ Add a personal task</button>
          )}
        </div>
      )}
    </>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
      {/* TOPBAR */}
      <header style={{ height: 52, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 18px", borderBottom: "1px solid var(--sw-hair)", background: "var(--sw-page)" }}>
        <h1 style={{ fontSize: 14, fontWeight: 400, margin: 0, letterSpacing: "-0.01em" }}>My Work</h1>
        <div style={{ marginLeft: 6 }}>
          <GlobalSearch />
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowQuickAdd(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--crimson)", color: "#fff", border: "none", borderRadius: 999, padding: "7px 15px", fontSize: 12.5, fontWeight: 400, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.25)" }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>+</span> New task
        </button>
        <TopIcons />
      </header>

      {/* CONTENT */}
      <main style={{ flex: 1, overflowY: "auto", padding: "20px 26px 40px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          {!missedDismissed && unread.length > 0 && homePage === "today" && (
            <div style={{ display: "flex", alignItems: "center", gap: 11, background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "11px 16px", boxShadow: "var(--shadow-card)", marginBottom: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--crimson)", flex: "none" }} />
              <span style={{ flex: 1, fontSize: 12.5, color: "var(--sw-text)" }}>{missedLine}</span>
              <button onClick={() => setWorkspacePage("inbox")} style={{ padding: "6px 14px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}>Review inbox</button>
              <button onClick={() => setMissedDismissed(true)} style={{ border: "none", background: "var(--sw-hover)", width: 24, height: 24, borderRadius: 99, cursor: "pointer", fontSize: 11, color: "var(--sw-text-soft)", flex: "none" }}><IconX /></button>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 26, margin: "0 0 3px", letterSpacing: "-0.01em" }}>
                {greeting}, <em style={{ fontStyle: "italic" }}>{firstName}</em>.
              </h2>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--sw-text-soft)" }}>Here&apos;s what&apos;s happening with your work today.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 3, background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: 3 }}>
                {TABS.map((tb) => (
                  <button key={tb.key} onClick={() => setHomePage(tb.key)} style={{ padding: "4px 13px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 400, background: homePage === tb.key ? "var(--crimson)" : "transparent", color: homePage === tb.key ? "#fff" : "var(--sw-text-soft)" }}>
                    {tb.label}
                  </button>
                ))}
              </div>
              {homePage === "today" && (
                <button onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")} style={{ padding: "5px 13px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 11, fontWeight: 400, cursor: "pointer" }}>
                  {density === "compact" ? "Comfortable" : "Compact"}
                </button>
              )}
              <span style={{ fontSize: 11.5, color: "var(--sw-muted)", fontWeight: 400 }}>{fmtFull(today)}</span>
            </div>
          </div>

          {(homePage === "all" || homePage === "personal") && taskTable}

          {homePage === "myweek" && (
            <>
              {weekOverdue.length > 0 && (
                <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "14px 18px", boxShadow: "var(--shadow-card)", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 9px", fontSize: 13, fontWeight: 400, color: "var(--red)" }}>Overdue</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {weekOverdue.map((t) => (
                      <button key={t.id} onClick={() => setActiveTaskId(t.id)} className="sw-row" style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--sw-hair)", borderRadius: 999, background: "none", padding: "6px 13px", cursor: "pointer" }}>
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--red)", flex: "none" }} />
                        <span style={{ fontSize: 12, color: "var(--sw-text)" }}>{t.name}</span>
                        <span style={{ fontSize: 11, color: "var(--red)" }}>{t.due ? fmtShort(t.due) : ""}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                {weekDays.map((d) => (
                  <div key={d.name} style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: d.isToday ? "var(--crimson)" : "var(--sw-hover)", color: d.isToday ? "#fff" : "var(--sw-text-soft)", fontSize: 11, fontWeight: 400 }}>
                      <span>{d.name}</span><span>{d.dateLabel}</span>
                    </div>
                    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 7, minHeight: 84 }}>
                      {d.rows.map((t) => (
                        <button key={t.id} onClick={() => setActiveTaskId(t.id)} className="sw-row" style={{ textAlign: "left", border: "1px solid var(--sw-hair)", borderRadius: 9, background: "none", padding: "8px 10px", cursor: "pointer" }}>
                          <div style={{ fontSize: 12, color: "var(--sw-text)", marginBottom: 4, lineHeight: 1.35 }}>{t.name}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLORS[t.status], flex: "none" }} />
                            <span style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>{t.status}</span>
                            <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 400, color: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>
                          </div>
                        </button>
                      ))}
                      {!d.rows.length && <span style={{ fontSize: 11, color: "var(--sw-muted)", padding: "6px 4px" }}>Nothing due</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {homePage === "today" && (
            <>
              {/* metric tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 18 }}>
                {metrics.map((m) => (
                  <button key={m.label} className="sw-card-h" onClick={m.nav} style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "12px 14px", boxShadow: "var(--shadow-card)", cursor: "pointer", textAlign: "left", display: "block", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: m.tint, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--sw-text-soft)", flex: "none" }}>{m.icon}</span>
                      <div>
                        <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1, color: "var(--sw-text)" }}>{m.value}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--sw-text-soft)", marginTop: 7, fontWeight: 400 }}>{m.label}</div>
                  </button>
                ))}
              </div>

              {/* my tasks module */}
              <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-card)", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
                  <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 400 }}>My tasks overview</h3>
                </div>
                <div style={{ display: "flex", gap: 5, borderBottom: "1px solid var(--sw-hair)", marginBottom: 2, paddingBottom: 8 }}>
                  {STATUSES.map((s) => (
                    <button key={s} onClick={() => setStatusTab(s)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 999, border: `1px solid ${statusTab === s ? "var(--crimson)" : "var(--sw-hair)"}`, background: statusTab === s ? "var(--crimson)" : "transparent", color: statusTab === s ? "#fff" : "var(--sw-text-soft)", fontSize: 11, fontWeight: 400, cursor: "pointer" }}>
                      {s} <span style={{ opacity: 0.7 }}>{tabCounts[s]}</span>
                    </button>
                  ))}
                </div>
                {tabRows.map((t) => (
                  <button key={t.id} onClick={() => setActiveTaskId(t.id)} className="sw-row" style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: homePad, border: "none", borderBottom: "1px solid var(--sw-hair)", background: "none", cursor: "pointer" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLORS[t.status], flex: "none" }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 400, color: "var(--sw-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginTop: 1 }}>{listPathOf(t)}</div>
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: "0.04em", color: PRIORITY_COLORS[t.priority], flex: "none" }}>{t.priority}</span>
                    <span style={{ fontSize: 11, color: "var(--sw-text-soft)", width: 54, textAlign: "right", flex: "none" }}>{t.due ? fmtShort(t.due) : ""}</span>
                  </button>
                ))}
                {!tabRows.length && <p style={{ margin: "12px 0 0", fontSize: 11.5, color: "var(--sw-muted)" }}>Nothing in this status.</p>}
                <button onClick={goAll} style={{ marginTop: 10, border: "none", background: "none", color: "var(--crimson)", fontSize: 11.5, fontWeight: 400, cursor: "pointer", padding: 0 }}>View all tasks →</button>
              </section>

              {/* deadlines + at risk */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-card)" }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 400 }}>Upcoming deadlines</h3>
                  {deadlines.map((t) => {
                    const overdue = t.due! < today;
                    const d = new Date(t.due! + "T00:00:00");
                    return (
                      <div key={t.id} onClick={() => setActiveTaskId(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--sw-hair)", cursor: "pointer" }}>
                        <span style={{ width: 32, height: 32, borderRadius: 8, background: overdue ? "rgba(243,38,62,0.12)" : "var(--sw-hover)", color: overdue ? "var(--red)" : "var(--sw-text)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: "none" }}>
                          <b style={{ fontSize: 11.5, fontWeight: 400, lineHeight: 1 }}>{String(d.getDate()).padStart(2, "0")}</b>
                          <span style={{ fontSize: 7.5, fontWeight: 400, textTransform: "uppercase" }}>{d.toLocaleDateString("en-GB", { month: "short" })}</span>
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                          <div style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>{listPathOf(t).split(" / ")[0]}</div>
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 400, color: PRIORITY_COLORS[t.priority], flex: "none" }}>{t.priority}</span>
                      </div>
                    );
                  })}
                </section>

                <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-card)" }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 400 }}>⚠ At-risk items</h3>
                  {atRiskAll.slice(0, 3).map(({ task: t, reason }) => (
                    <div key={t.id} onClick={() => setActiveTaskId(t.id)} style={{ padding: "9px 10px", borderRadius: 9, background: "var(--sw-hover)", marginBottom: 6, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 400, letterSpacing: "0.04em", color: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 400 }}>{t.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginTop: 1 }}>{reason.replace(/\d{4}-\d{2}-\d{2}/, (m) => fmtShort(m))} · {listPathOf(t).split(" / ")[0]}</div>
                    </div>
                  ))}
                  {!atRiskAll.length && <p style={{ margin: 0, fontSize: 12, color: "var(--sw-muted)" }}>Nothing at risk right now.</p>}
                </section>
              </div>

              {/* company pulse */}
              <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-card)", display: "flex", gap: 26, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
                  <div style={{ position: "relative", width: 52, height: 52, borderRadius: 99, background: `conic-gradient(var(--green) 0% ${health}%, var(--sw-hair) ${health}% 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 99, background: "var(--sw-card)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 400 }}>{health}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 400 }}>Company health</div>
                    <div style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>{health >= 70 ? "Healthy" : "Needs attention"} — {onTrack} depts on track</div>
                  </div>
                </div>
                <div style={{ width: 1, alignSelf: "stretch", background: "var(--sw-hair)" }} />
                <div style={{ flex: 1, display: "flex", gap: 20 }}>
                  {workloadPeople.map(({ p, pct }) => (
                    <div key={p.id} style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                        <Avatar person={p} size={19} fontSize={8.5} onClick={(e) => { e.stopPropagation(); openProfile(p.id); }} />
                        <span style={{ fontSize: 11.5, fontWeight: 400 }}>{p.name}</span>
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--sw-muted)", fontWeight: 400 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: "var(--sw-hover)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 99, background: pct > 100 ? "var(--red)" : pct > 80 ? "#B7791F" : "var(--green)", width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <a
                  href="/overview"
                  onClick={(e) => { e.preventDefault(); setCompanyPage("executive"); }}
                  style={{ flex: "none", textDecoration: "none", color: "var(--crimson)", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}
                >
                  View executive report →
                </a>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
