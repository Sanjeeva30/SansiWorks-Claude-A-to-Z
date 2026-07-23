"use client";
import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { STATUS_COLORS, PRIORITY_COLORS, STATUSES, initials, Task } from "@/lib/types";
import { fmtShort, todayIso } from "@/lib/dates";
import { isOpen, isOverdue, onTimeStats, tasksOfPerson, criticalUnblocker } from "@/lib/logic";
import { TopIcons } from "./shared";
import { IconX } from "./icons";

const SPARKS = [
  "M0 15 L15 13 L30 16 L45 11 L60 12 L75 8 L90 10 L105 6 L120 4",
  "M0 12 L15 13 L30 11 L45 13 L60 10 L75 12 L90 8 L105 7 L120 5",
  "M0 8 L15 10 L30 9 L45 12 L60 11 L75 13 L90 12 L105 14 L120 13",
  "M0 14 L15 12 L30 13 L45 10 L60 11 L75 9 L90 10 L105 7 L120 6",
];

export function CompanySection() {
  const store = useStore();
  const { tasks, profiles, departments, deptMembers, deps, docs } = store;
  const { companyPage, setSection, setListPage, setActiveTaskId, setMetricModal, openProfile, setDocDetailId } = useUI();
  const [deptFilter, setDeptFilter] = useState("All departments");
  const [showAllWidgets, setShowAllWidgets] = useState(false);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [removedWidgets, setRemovedWidgets] = useState<number[]>([]);
  const [addedWidgets, setAddedWidgets] = useState<number[]>([]);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [peopleDensity, setPeopleDensity] = useState<"comfortable" | "compact">("comfortable");

  const today = todayIso();
  const sansicoPeople = useMemo(() => profiles.filter((p) => p.email.endsWith("@sansico.com")), [profiles]);

  const personStats = useMemo(
    () =>
      sansicoPeople.map((p) => {
        const pt = tasksOfPerson(tasks, p.id);
        const { onTime, late, total } = onTimeStats(pt);
        const historyPct = total > 0 ? (onTime / total) * 100 : 100;
        const open = pt.filter(isOpen);
        const overdue = open.filter(isOverdue);
        const healthPct = open.length > 0 ? 100 - (overdue.length / open.length) * 100 : 100;
        const eff = Math.round(historyPct * 0.75 + healthPct * 0.25);
        return { p, pt, onTime, late, historyPct: Math.round(historyPct), open, overdue, healthPct: Math.round(healthPct), eff };
      }),
    [sansicoPeople, tasks]
  );

  const effColor = (v: number) => (v >= 80 ? "var(--green)" : v >= 60 ? "#B7791F" : "var(--red)");

  const deptStats = useMemo(
    () =>
      departments.map((d) => {
        const memberIds = deptMembers.filter((m) => m.department_id === d.id).map((m) => m.profile_id);
        const dTasks = tasks.filter((t) => !!t.assignee_id && memberIds.includes(t.assignee_id));
        const open = dTasks.filter(isOpen);
        const overdue = open.filter(isOverdue);
        const risk = open.length ? Math.round((overdue.length / open.length) * 100) : 0;
        const { onTime, late, total } = onTimeStats(dTasks);
        const historyPct = total > 0 ? (onTime / total) * 100 : 100;
        const healthPct = open.length > 0 ? 100 - (overdue.length / open.length) * 100 : 100;
        const eff = Math.round(historyPct * 0.75 + healthPct * 0.25);
        return { d, risk, riskLabel: risk > 50 ? "High" : risk > 20 ? "Moderate" : "Low", eff, overdue, open, onTime, late, historyPct: Math.round(historyPct), healthPct: Math.round(healthPct) };
      }),
    [departments, deptMembers, tasks]
  );

  const openTasks = tasks.filter(isOpen);
  const overdueAll = openTasks.filter(isOverdue);
  const criticalCount = openTasks.filter((t) => t.priority === "Critical").length;
  const { onTime: onT, total: totalDone } = onTimeStats(tasks);
  const onTimeRate = totalDone ? Math.round((onT / totalDone) * 100) : 100;
  const health = deptStats.length ? Math.round(deptStats.reduce((s, x) => s + x.eff, 0) / deptStats.length) : 100;
  const onTrack = deptStats.filter((x) => x.risk < 50).length;

  const goEverything = () => { setSection("list"); setListPage("everything"); };

  const execMetrics = [
    { value: String(openTasks.length), label: "Open tasks", color: "var(--sw-text)", nav: goEverything },
    { value: String(overdueAll.length), label: "Overdue", color: "var(--red)", nav: goEverything },
    { value: String(criticalCount), label: "Critical priority", color: "var(--crimson)", nav: goEverything },
    { value: `${onTimeRate}%`, label: "On-time rate", color: "var(--green)", nav: () => setMetricModal({ title: "On-time rate — recent completions", taskIds: tasks.filter((t) => t.status === "Done").slice(-8).map((t) => t.id) }) },
  ];

  // Predicted late (at-risk with reasons per design)
  const atRisk = useMemo(() => {
    const out: { t: Task; owner: (typeof profiles)[number] | undefined; reason: string; chip: string; chipColor: string; sort: number }[] = [];
    for (const st of personStats) {
      const rate = st.historyPct;
      for (const t of st.pt) {
        if (t.status === "Done" || !t.due) continue;
        const days = Math.round((new Date(t.due + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000);
        const overdue = days < 0;
        const heavy = st.open.length >= 5;
        const slow = rate < 75;
        if (overdue || (days <= 4 && (heavy || slow))) {
          const reasons = [overdue ? `overdue ${-days}d` : `due in ${days}d`];
          if (heavy) reasons.push(`${st.p.name.split(" ")[0]} at ${st.open.length} open`);
          if (slow) reasons.push(`${rate}% on-time history`);
          out.push({ t, owner: st.p, reason: reasons.join(" · "), chip: overdue ? "Late" : "At risk", chipColor: overdue ? "var(--red)" : "#B7791F", sort: overdue ? days - 100 : days });
        }
      }
    }
    const seen = new Set<string>();
    return out.filter((x) => (seen.has(x.t.id) ? false : (seen.add(x.t.id), true))).sort((a, b) => a.sort - b.sort).slice(0, 5);
  }, [personStats, today]);

  const unblocker = useMemo(() => criticalUnblocker(tasks, deps), [tasks, deps]);
  const unblockerDown = useMemo(() => {
    if (!unblocker) return [];
    return deps.filter((d) => d.depends_on === unblocker.task.id).map((d) => tasks.find((t) => t.id === d.task_id)).filter((t) => t && isOpen(t)) as Task[];
  }, [unblocker, deps, tasks]);
  const unblockerOwner = unblocker ? profiles.find((p) => p.id === unblocker.task.assignee_id) : null;

  const overdueRows = overdueAll.slice(0, 5).map((t) => ({
    t,
    label: `${Math.round((new Date(today + "T00:00:00").getTime() - new Date(t.due + "T00:00:00").getTime()) / 86400000)} days overdue`,
  }));

  const filteredDeptStats = deptFilter === "All departments" ? deptStats : deptStats.filter((x) => x.d.name === deptFilter);

  /* widgets */
  const widgetCatalog = [
    { id: 1, title: "Open tasks", desc: "Total open tasks company-wide", render: () => <Metric value={String(openTasks.length)} color="var(--sw-text)" subtitle="Across all departments" />, drill: goEverything },
    { id: 2, title: "On-time rate", desc: "Share of tasks completed by their due date", render: () => <Metric value={`${onTimeRate}%`} color="var(--green)" subtitle="Last 30 days" />, drill: () => setMetricModal({ title: "On-time rate — recent completions", taskIds: tasks.filter((t) => t.status === "Done").slice(-8).map((t) => t.id) }) },
    { id: 3, title: "Tasks by status", desc: "Breakdown of open tasks by status", render: () => <Bars tasks={tasks} onOpen={(ids, title) => setMetricModal({ title, taskIds: ids })} /> },
    { id: 4, title: "At-risk tasks", desc: "Tasks overdue or marked stuck", render: () => (
      <>{atRisk.slice(0, 2).map((r) => (
        <button key={r.t.id} className="sw-row" onClick={() => setActiveTaskId(r.t.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--sw-hair)", fontSize: 12, width: "100%", border: "none", background: "none", cursor: "pointer", textAlign: "left", color: "var(--sw-text)" }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: r.chipColor, flex: "none" }} />
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.t.name}</span>
        </button>
      ))}</>
    ) },
    { id: 5, title: "Critical priority", desc: "Count of Critical-priority open tasks", render: () => <Metric value={String(criticalCount)} color="var(--crimson)" subtitle="Needs attention this week" />, drill: () => setMetricModal({ title: "Critical priority — open tasks", taskIds: openTasks.filter((t) => t.priority === "Critical").map((t) => t.id) }) },
    { id: 6, title: "Recent docs", desc: "Last updated documents in Docs & SOP Library", render: () => (
      <>{docs.slice(0, 2).map((d) => (
        <button key={d.id} className="sw-row" onClick={() => setDocDetailId(d.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--sw-hair)", fontSize: 12, width: "100%", border: "none", background: "none", cursor: "pointer", textAlign: "left", color: "var(--sw-text)" }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--green)", flex: "none" }} />
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</span>
        </button>
      ))}</>
    ) },
  ];
  const defaultWidgetIds = [1, 2, 3, 4];
  const activeWidgetIds = [...defaultWidgetIds.filter((id) => !removedWidgets.includes(id)), ...addedWidgets.filter((id) => !defaultWidgetIds.includes(id))];
  const dashWidgets = widgetCatalog.filter((w) => activeWidgetIds.includes(w.id));

  const peoplePad = peopleDensity === "compact" ? "10px 14px" : "16px 18px";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
      <header className="sw-topbar" style={{ height: 52, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 22px", borderBottom: "1px solid var(--sw-hair)", background: "var(--sw-page)" }}>
        <h1 className="sw-topbar-title" style={{ fontSize: 14, fontWeight: 400, margin: 0 }}>{companyPage === "executive" ? "Overview" : "People"}</h1>
        <div style={{ flex: 1 }} />
        {companyPage === "executive" && (
          <button onClick={() => window.print()} style={{ padding: "7px 14px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>Export PDF</button>
        )}
        <TopIcons />
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "20px 26px 40px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          {companyPage === "executive" && (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 24, margin: "0 0 3px", fontStyle: "italic" }}>Overview</h2>
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--sw-text-soft)" }}>Company-wide performance across all departments.</p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select className="sw-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={{ height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12, color: "var(--sw-text)" }}>
                    <option>All departments</option>
                    {departments.map((d) => <option key={d.id}>{d.name}</option>)}
                  </select>
                  <select className="sw-select" style={{ height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12, color: "var(--sw-text)" }}>
                    <option>This quarter</option><option>This month</option><option>This year</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: 20, alignItems: "center", background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "16px 20px", boxShadow: "var(--shadow-card)", marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ position: "relative", width: 66, height: 66, borderRadius: 99, background: `conic-gradient(var(--green) 0% ${health}%, var(--sw-hair) ${health}% 100%)`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <div style={{ width: 50, height: 50, borderRadius: 99, background: "var(--sw-card)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 400 }}>{health}</div>
                </div>
                <div style={{ flex: "none" }}>
                  <div style={{ fontSize: 13, fontWeight: 400 }}>Company health</div>
                  <div style={{ fontSize: 11.5, color: "var(--sw-muted)" }}>{health >= 70 ? "Healthy" : "Needs attention"} — {onTrack} depts on track</div>
                </div>
                <div className="sw-topbar-label" style={{ width: 1, alignSelf: "stretch", background: "var(--sw-hair)" }} />
                {execMetrics.map((m, i) => (
                  <button key={m.label} onClick={m.nav} style={{ flex: "1 1 90px", minWidth: 90, border: "none", background: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color: m.color, fontVariantNumeric: "tabular-nums" }}>{m.value}</div>
                    <div style={{ fontSize: 11, color: "var(--sw-text-soft)", marginTop: 5, fontWeight: 400 }}>{m.label}</div>
                    <svg width="100%" height="16" viewBox="0 0 120 18" preserveAspectRatio="none" style={{ display: "block", marginTop: 6, opacity: 0.85 }}>
                      <path d={SPARKS[i % SPARKS.length]} fill="none" stroke={m.color === "var(--sw-text)" ? "var(--green)" : m.color} strokeWidth="1.8" />
                    </svg>
                  </button>
                ))}
              </div>

              <div className="sw-grid-2" style={{ gap: 14, marginBottom: 14 }}>
                <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-card)" }}>
                  <h3 style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 400 }}>Predicted late</h3>
                  <p style={{ margin: "0 0 10px", fontSize: 10.5, color: "var(--sw-muted)" }}>Due date proximity × assignee load × on-time history — flagged before they slip.</p>
                  {atRisk.map((r) => (
                    <button key={r.t.id} onClick={() => setActiveTaskId(r.t.id)} className="sw-row" style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "7px 4px", border: "none", borderBottom: "1px solid var(--sw-hair)", background: "none", cursor: "pointer" }}>
                      <span style={{ width: 20, height: 20, borderRadius: 99, background: r.owner?.color || "#9A918A", color: "#fff", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{r.owner ? initials(r.owner.name) : "?"}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "var(--sw-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.t.name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginTop: 1 }}>{r.reason}</div>
                      </span>
                      <span style={{ flex: "none", fontSize: 9.5, fontWeight: 400, color: "#fff", background: r.chipColor, borderRadius: 999, padding: "2px 9px" }}>{r.chip}</span>
                    </button>
                  ))}
                  {!atRisk.length && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--sw-muted)" }}>Nothing at risk this week.</p>}
                </section>

                <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-card)" }}>
                  <h3 style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 400 }}>Critical unblocker of the day</h3>
                  <p style={{ margin: "0 0 10px", fontSize: 10.5, color: "var(--sw-muted)" }}>The one open task blocking the most downstream work.</p>
                  {unblocker ? (
                    <>
                      <button onClick={() => setActiveTaskId(unblocker.task.id)} className="sw-card-h" style={{ display: "block", width: "100%", textAlign: "left", border: "1.5px solid var(--crimson)", borderRadius: 11, background: "rgba(122,13,32,0.04)", padding: "13px 15px", cursor: "pointer", boxShadow: "var(--shadow-card)", marginBottom: 11 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
                          <span style={{ width: 22, height: 22, borderRadius: 99, background: unblockerOwner?.color || "#9A918A", color: "#fff", fontSize: 8.5, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{unblockerOwner ? initials(unblockerOwner.name) : "?"}</span>
                          <span style={{ fontSize: 13, fontWeight: 400, color: "var(--sw-text)" }}>{unblocker.task.name}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--crimson)" }}>
                          Completing this frees {unblocker.unblocks} task{unblocker.unblocks > 1 ? "s" : ""} downstream
                        </div>
                      </button>
                      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 5 }}>Waiting on it</div>
                      {unblockerDown.map((f) => (
                        <button key={f.id} onClick={() => setActiveTaskId(f.id)} className="sw-row" style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", padding: "6px 4px", border: "none", borderBottom: "1px solid var(--sw-hair)", background: "none", cursor: "pointer" }}>
                          <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--sw-hair)", flex: "none" }} />
                          <span style={{ fontSize: 12, color: "var(--sw-text-soft)" }}>{f.name}</span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--sw-muted)" }}>No blocking chains right now.</p>
                  )}
                </section>
              </div>

              <div className="sw-grid-3" style={{ gap: 14 }}>
                <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-card)" }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 400 }}>Department risk</h3>
                  {filteredDeptStats.map((x) => (
                    <button key={x.d.id} onClick={() => setMetricModal({ title: `${x.d.name} — overdue open tasks`, taskIds: x.overdue.map((t) => t.id) })} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", padding: 0, marginBottom: 11, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: x.d.color, flex: "none" }} />
                        <span style={{ fontSize: 12, fontWeight: 400, flex: 1, color: "var(--sw-text)" }}>{x.d.name}</span>
                        <span style={{ fontSize: 11, color: "var(--sw-muted)", fontWeight: 400 }}>{x.riskLabel}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: "var(--sw-hover)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 99, background: x.risk > 50 ? "var(--red)" : x.risk > 20 ? "#B7791F" : "var(--green)", width: `${x.risk}%` }} />
                      </div>
                    </button>
                  ))}
                </section>

                <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-card)" }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 400 }}>Department efficiency</h3>
                  {filteredDeptStats.map((x) => (
                    <button key={x.d.id} onClick={() => setMetricModal({ title: `${x.d.name} — efficiency (75% × ${x.historyPct}% + 25% × ${x.healthPct}% = ${x.eff}%)`, taskIds: x.open.map((t) => t.id) })} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", padding: 0, marginBottom: 11, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: x.d.color, flex: "none" }} />
                        <span style={{ fontSize: 12, fontWeight: 400, flex: 1, color: "var(--sw-text)" }}>{x.d.name}</span>
                        <span style={{ fontSize: 11, color: "var(--sw-muted)", fontWeight: 400 }}>{x.eff}%</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: "var(--sw-hover)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 99, background: effColor(x.eff), width: `${x.eff}%` }} />
                      </div>
                    </button>
                  ))}
                </section>

                <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-card)" }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 400 }}>People efficiency</h3>
                  {personStats.map((st) => (
                    <div key={st.p.id} onClick={() => setMetricModal({ title: `${st.p.name} — efficiency (75% × ${st.historyPct}% + 25% × ${st.healthPct}% = ${st.eff}%)`, taskIds: st.pt.filter(isOpen).map((t) => t.id) })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--sw-hair)", cursor: "pointer" }}>
                      <button onClick={(e) => { e.stopPropagation(); openProfile(st.p.id); }} title="View profile" style={{ width: 24, height: 24, borderRadius: 99, background: st.p.color, color: "#fff", fontSize: 9.5, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", border: "none", cursor: "pointer", padding: 0 }}>{initials(st.p.name)}</button>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{st.p.name}</div>
                        <div style={{ height: 5, borderRadius: 99, background: "var(--sw-hover)", overflow: "hidden", marginTop: 4 }}>
                          <div style={{ height: "100%", borderRadius: 99, background: effColor(st.eff), width: `${st.eff}%` }} />
                        </div>
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-muted)", flex: "none", width: 34, textAlign: "right" }}>{st.eff}%</span>
                    </div>
                  ))}
                </section>
              </div>

              <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-card)", marginTop: 20, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 400 }}>Overdue tasks</h3>
                {overdueRows.map(({ t, label }) => (
                  <button key={t.id} className="sw-row" onClick={() => setActiveTaskId(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 0", border: "none", borderBottom: "1px solid var(--sw-hair)", background: "none", cursor: "pointer" }}>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--sw-text)" }}>{t.name}</span>
                    <span style={{ fontSize: 11.5, color: "var(--red)", fontWeight: 400 }}>{label}</span>
                  </button>
                ))}
                {!overdueRows.length && <p style={{ margin: 0, fontSize: 12, color: "var(--sw-muted)" }}>Nothing overdue.</p>}
              </section>

              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <button onClick={() => setShowAllWidgets(!showAllWidgets)} style={{ padding: "7px 18px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>
                  {showAllWidgets ? "Hide dashboard widgets" : `Show dashboard widgets (${dashWidgets.length})`}
                </button>
              </div>

              {showAllWidgets && (
                <>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 24, margin: "0 0 3px", fontStyle: "italic" }}>Your dashboard</h2>
                      <p style={{ margin: 0, fontSize: 12.5, color: "var(--sw-text-soft)" }}>Add widgets that matter to you.</p>
                    </div>
                    <button onClick={() => setShowWidgetPicker(true)} style={{ padding: "7px 14px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>+ Add widget</button>
                  </div>
                  <div className="sw-grid-3" style={{ gap: 14 }}>
                    {dashWidgets.map((w) => (
                      <div key={w.id} className="sw-card-h" onClick={w.drill} style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "16px 18px", position: "relative", cursor: "pointer" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (defaultWidgetIds.includes(w.id)) setRemovedWidgets([...removedWidgets, w.id]); else setAddedWidgets(addedWidgets.filter((x) => x !== w.id)); }}
                          style={{ position: "absolute", top: 10, right: 10, border: "none", background: "var(--sw-hover)", width: 22, height: 22, borderRadius: 99, cursor: "pointer", fontSize: 11, color: "var(--sw-muted)", zIndex: 2 }}
                        >
                          <IconX size={10} />
                        </button>
                        <h3 style={{ margin: "0 0 12px", fontSize: 12.5, fontWeight: 400 }}>{w.title}</h3>
                        {w.render()}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {showWidgetPicker && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 48, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowWidgetPicker(false)}>
                  <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto", background: "var(--sw-card)", borderRadius: 16, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "22px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 400, flex: 1 }}>Add a widget</h3>
                      <button onClick={() => setShowWidgetPicker(false)} style={{ border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
                    </div>
                    {widgetCatalog.map((w) => {
                      const added = activeWidgetIds.includes(w.id);
                      return (
                        <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 400 }}>{w.title}</div>
                            <div style={{ fontSize: 11, color: "var(--sw-muted)", marginTop: 1 }}>{w.desc}</div>
                          </span>
                          <button
                            onClick={() => { if (!added) { setAddedWidgets([...addedWidgets, w.id]); setRemovedWidgets(removedWidgets.filter((x) => x !== w.id)); } }}
                            disabled={added}
                            style={{ padding: "6px 13px", borderRadius: 999, border: "none", background: added ? "var(--sw-muted)" : "var(--crimson)", color: "#fff", fontSize: 11.5, fontWeight: 400, cursor: added ? "default" : "pointer" }}
                          >
                            {added ? "Added" : "+ Add"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {companyPage === "people" && (
            <>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 24, margin: "0 0 3px", fontStyle: "italic" }}>People</h2>
              <div style={{ display: "flex", alignItems: "center", margin: "0 0 16px" }}>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--sw-text-soft)", flex: 1 }}>{personStats.length} team members across {new Set(personStats.map((x) => x.p.department_id).filter(Boolean)).size} departments.</p>
                <button onClick={() => setPeopleDensity(peopleDensity === "compact" ? "comfortable" : "compact")} style={{ padding: "5px 13px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 11, fontWeight: 400, cursor: "pointer" }}>
                  {peopleDensity === "compact" ? "Comfortable" : "Compact"}
                </button>
              </div>

              {personStats.map((st) => {
                const dept = departments.find((d) => d.id === st.p.department_id);
                const cats = new Map<string, number>();
                for (const t of st.open) {
                  if (!t.list_id) continue;
                  const list = store.lists.find((l) => l.id === t.list_id);
                  if (list) cats.set(list.name, (cats.get(list.name) || 0) + 1);
                }
                const expanded = openPerson === st.p.name;
                return (
                  <div key={st.p.id} style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: peoplePad }}>
                      <button onClick={() => openProfile(st.p.id)} title="View profile" style={{ width: 34, height: 34, borderRadius: 99, background: st.p.color, color: "#fff", fontSize: 12, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", border: "none", cursor: "pointer", padding: 0 }}>{initials(st.p.name)}</button>
                      <button onClick={() => openProfile(st.p.id)} className="sw-person-meta" style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textAlign: "left", padding: 0, border: "none", background: "none", cursor: "pointer" }} title="View full profile">
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 400 }}>{st.p.name}</div>
                          <div style={{ fontSize: 11, color: "var(--sw-muted)" }}>{dept?.name || st.p.role_title}</div>
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--sw-text-soft)", width: 70, textAlign: "right" }}>{st.open.length} open</span>
                        <div className="sw-people-bar" style={{ width: 80, height: 5, borderRadius: 99, background: "var(--sw-hover)", overflow: "hidden", margin: "0 4px" }}>
                          <div style={{ height: "100%", borderRadius: 99, background: effColor(st.eff), width: `${st.eff}%` }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 400, color: effColor(st.eff), width: 76, textAlign: "right" }}>{st.eff}% eff.</span>
                      </button>
                      <button onClick={() => setOpenPerson(expanded ? null : st.p.name)} title="Peek at open tasks" style={{ border: "none", background: "none", cursor: "pointer", padding: 4, flex: "none" }}>
                        <span style={{ fontSize: 11, color: "var(--sw-muted)", display: "inline-block", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 16px 13px 62px" }}>
                      {Array.from(cats.entries()).map(([name, count]) => (
                        <span key={name} style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "3px 10px 3px 8px", fontSize: 11, fontWeight: 400, color: "var(--sw-text-soft)" }}>
                          <span style={{ width: 6, height: 6, borderRadius: 99, background: dept?.color || "var(--crimson)", flex: "none" }} />{name} <span style={{ color: "var(--sw-muted)", fontWeight: 400 }}>{count}</span>
                        </span>
                      ))}
                    </div>
                    {expanded && (
                      <div style={{ padding: "10px 16px 14px 62px", display: "flex", flexDirection: "column", gap: 7, borderTop: "1px solid var(--sw-hair)" }}>
                        {st.open.slice(0, 6).map((t) => (
                          <button key={t.id} onClick={() => setActiveTaskId(t.id)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", border: "none", background: "none", padding: "2px 0", cursor: "pointer" }}>
                            <span style={{ width: 6, height: 6, borderRadius: 99, background: STATUS_COLORS[t.status], flex: "none" }} />
                            <span style={{ flex: 1, fontSize: 12, color: "var(--sw-text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 400, color: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Metric({ value, color, subtitle }: { value: string; color: string; subtitle: string }) {
  return (
    <>
      <div style={{ fontSize: 30, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--sw-muted)", marginTop: 4 }}>{subtitle}</div>
    </>
  );
}

function Bars({ tasks, onOpen }: { tasks: Task[]; onOpen: (ids: string[], title: string) => void }) {
  const max = Math.max(...STATUSES.map((s) => tasks.filter((t) => t.status === s).length), 1);
  return (
    <>
      {STATUSES.map((s) => {
        const rows = tasks.filter((t) => t.status === s);
        return (
          <button key={s} onClick={(e) => { e.stopPropagation(); onOpen(rows.slice(0, 12).map((t) => t.id), s); }} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, width: "100%", border: "none", background: "none", padding: 0, cursor: "pointer" }}>
            <span style={{ width: 70, fontSize: 11, fontWeight: 400, color: "var(--sw-text-soft)", flex: "none", textAlign: "left" }}>{s}</span>
            <div style={{ flex: 1, height: 7, borderRadius: 99, background: "var(--sw-hover)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, background: STATUS_COLORS[s], width: `${(rows.length / max) * 100}%` }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 400, width: 22, textAlign: "right", flex: "none", color: "var(--sw-text)" }}>{rows.length}</span>
          </button>
        );
      })}
    </>
  );
}
