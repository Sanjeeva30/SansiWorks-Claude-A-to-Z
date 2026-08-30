// Locked logic from the handover README:
// - Department risk = % of that department's open tasks that are overdue
// - Team/People efficiency = 75% completed-on-time-vs-late ratio + 25% still-overdue (current-state adjustment)
// - Department efficiency = same formula, applied department-wide
// - At-risk prediction = overdue OR (due ≤4 days AND (assignee has ≥5 open tasks OR assignee's on-time history <75%))
// - Critical unblocker of the day = open task with the largest downstream dependency chain of other open tasks
import { Task, Dependency, Profile, Department, Level, DocVisibility, DIFFICULTY_LEVELS } from "./types";
import { todayIso } from "./dates";

export const isOpen = (t: Task) => t.status !== "Done";
export const isOverdue = (t: Task) => isOpen(t) && !!t.due && t.due < todayIso();

/* ----- metric trends -----
   The Overview stat tiles used to draw four hardcoded SVG squiggles cycled by
   index: decorative fiction implying trend data that did not exist. These
   reconstruct the real series from task history, so a rising overdue line means
   overdue actually rose.

   Each point is the state of the world at the END of that week, derived from
   created_at / completed_at / due / status. Caveat: priority is only stored as a
   current value, so the "critical" series applies today's priority to historical
   weeks — it shows when critical work was open, not when it was labelled
   critical. Good enough for a sparkline, wrong for an audit. */
export type TrendKind = "open" | "overdue" | "critical" | "onTime";

/** Was this task open at end-of-day `dayIso`? (created by then, not yet completed) */
function wasOpenAt(t: Task, dayIso: string): boolean {
  const created = (t.created_at || "").slice(0, 10);
  if (created && created > dayIso) return false;
  const done = (t.completed_at || "").slice(0, 10);
  return !done || done > dayIso;
}

export function metricTrend(tasks: Task[], kind: TrendKind, points = 12, today: Date = new Date()): number[] {
  const series: number[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const dayIso = d.toISOString().slice(0, 10);

    if (kind === "onTime") {
      // Cumulative on-time share of everything completed up to that week.
      const done = tasks.filter(
        (t) => t.completed_at && t.due && t.completed_at.slice(0, 10) <= dayIso
      );
      const onTime = done.filter((t) => t.completed_at!.slice(0, 10) <= t.due!).length;
      // NaN, not 100, before anything has been completed: "no completions yet" is
      // not a perfect record, and plotting it as 100 invented a cliff.
      series.push(done.length ? Math.round((onTime / done.length) * 100) : NaN);
      continue;
    }

    // Before any task existed there is nothing to plot — NaN keeps the sparkline
    // from drawing a fake ramp up from zero on the day the workspace was seeded.
    const existedThen = tasks.some((t) => (t.created_at || "").slice(0, 10) <= dayIso);
    if (!existedThen) { series.push(NaN); continue; }
    const openThen = tasks.filter((t) => wasOpenAt(t, dayIso));
    if (kind === "open") series.push(openThen.length);
    else if (kind === "overdue") series.push(openThen.filter((t) => t.due && t.due < dayIso).length);
    else series.push(openThen.filter((t) => t.priority === "Critical").length);
  }
  return series;
}

/** Change vs `lookback` points ago (default 4 weeks = "vs last month") for the
 *  stat tile's delta chip. Returns null when either end of the comparison has no
 *  real data — comparing against a week before the workspace existed produced a
 *  meaningless "+27". */
export function trendDelta(series: number[], lookback = 4): { diff: number } | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 1 - Math.min(lookback, series.length - 1)];
  if (!Number.isFinite(last) || !Number.isFinite(prev)) return null;
  return { diff: last - prev };
}

/** Build an SVG polyline for a sparkline, plus the last point so the caller can
 *  accent the current period. Y is inverted (SVG origin is top-left) and a flat
 *  series is drawn through the vertical middle rather than dividing by zero. */
export function sparkPath(series: number[], w: number, h: number, pad = 2): { line: string; area: string; lastX: number; lastY: number } {
  // Points can be NaN where no data existed yet; the line simply starts later
  // rather than ramping up from a fabricated zero.
  const idx = series.map((v, i) => [v, i] as const).filter(([v]) => Number.isFinite(v));
  if (!idx.length) return { line: "", area: "", lastX: 0, lastY: h / 2 };
  const vals = idx.map(([v]) => v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min;
  const stepX = series.length > 1 ? w / (series.length - 1) : 0;
  const pts = idx.map(([v, i]) => {
    const x = i * stepX;
    const y = span === 0 ? h / 2 : pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [firstX] = pts[0];
  const [lastX, lastY] = pts[pts.length - 1];
  const area = `${line} L${lastX.toFixed(1)} ${h} L${firstX.toFixed(1)} ${h} Z`;
  return { line, area, lastX, lastY };
}

/** Birthdays in the next 7 days, org-wide — year is optional and never shown.
 *  Wraps the new-year boundary (e.g. today Dec 28 picks up a Jan 2 birthday). */
export function upcomingBirthdays(profiles: Profile[], today: Date = new Date()): { p: Profile; daysAway: number }[] {
  const y = today.getFullYear();
  const todayMidnight = new Date(y, today.getMonth(), today.getDate());
  return profiles
    .filter((p) => p.birthday_day && p.birthday_month)
    .map((p) => {
      let next = new Date(y, p.birthday_month! - 1, p.birthday_day!);
      if (next < todayMidnight) next = new Date(y + 1, p.birthday_month! - 1, p.birthday_day!);
      const daysAway = Math.round((next.getTime() - todayMidnight.getTime()) / 86400000);
      return { p, daysAway };
    })
    .filter((x) => x.daysAway >= 0 && x.daysAway <= 7)
    .sort((a, b) => a.daysAway - b.daysAway);
}

export function onTimeStats(tasks: Task[]) {
  const done = tasks.filter((t) => t.status === "Done" && t.completed_at && t.due);
  const onTime = done.filter((t) => t.completed_at!.slice(0, 10) <= t.due!).length;
  const late = done.length - onTime;
  return { onTime, late, total: done.length };
}

/* Efficiency = 75% on-time history + 25% current health.
   `hasData` is false when there is nothing to score — no completed tasks with a
   due date AND no open tasks. The formula returns 100 in that case (both halves
   default to "nothing has gone wrong"), which reads as a perfect record when it
   actually means "no tracked work". Callers must show "—" instead of a number
   when hasData is false: these figures are visible to peers and may inform
   reviews, so rewarding an empty workload would be indefensible. */
export function efficiencyScore(tasks: Task[]): { score: number; color: string; hasData: boolean } {
  const { onTime, total } = onTimeStats(tasks);
  const historyPct = total > 0 ? (onTime / total) * 100 : 100;
  const open = tasks.filter(isOpen);
  const overdue = open.filter(isOverdue);
  const healthPct = open.length > 0 ? 100 - (overdue.length / open.length) * 100 : 100;
  const score = Math.round(historyPct * 0.75 + healthPct * 0.25);
  return {
    score,
    color: score >= 80 ? "var(--sw-on-green)" : score >= 60 ? "var(--sw-on-amber)" : "var(--sw-on-red)",
    hasData: total > 0 || open.length > 0,
  };
}

/* The formula in words, for the in-app explainer. Employees are measured by this,
   so it should never be a black box they have to take on trust. */
export const EFFICIENCY_EXPLAINER =
  "Efficiency blends two things: 75% is your on-time history — the share of tasks " +
  "you finished on or before their due date — and 25% is the current health of your " +
  "open work, which drops as tasks go overdue. It is shown as “—” until you have " +
  "tracked work to measure, so an empty workload never counts as a perfect score.";

export function tasksOfPerson(tasks: Task[], pid: string) {
  return tasks.filter((t) => t.assignee_id === pid);
}

export function departmentRisk(deptTasks: Task[]): number {
  const open = deptTasks.filter(isOpen);
  if (!open.length) return 0;
  return Math.round((open.filter(isOverdue).length / open.length) * 100);
}

export function personOnTimeHistoryPct(tasks: Task[], pid: string): number {
  const { onTime, total } = onTimeStats(tasksOfPerson(tasks, pid));
  return total > 0 ? (onTime / total) * 100 : 100;
}

export function atRiskTasks(tasks: Task[]): { task: Task; reason: string }[] {
  const today = todayIso();
  const soon = new Date();
  soon.setDate(soon.getDate() + 4);
  const soonIso = soon.toISOString().slice(0, 10);
  const openCounts = new Map<string, number>();
  for (const t of tasks)
    if (isOpen(t) && t.assignee_id) openCounts.set(t.assignee_id, (openCounts.get(t.assignee_id) || 0) + 1);

  const out: { task: Task; reason: string }[] = [];
  for (const t of tasks) {
    if (!isOpen(t) || !t.due) continue;
    if (t.status === "Stuck") {
      out.push({ task: t, reason: "Marked as stuck" });
      continue;
    }
    if (t.due < today) {
      out.push({ task: t, reason: `Overdue since ${t.due}` });
      continue;
    }
    if (t.due <= soonIso && t.assignee_id) {
      const heavy = (openCounts.get(t.assignee_id) || 0) >= 5;
      const slowHistory = personOnTimeHistoryPct(tasks, t.assignee_id) < 75;
      if (heavy) out.push({ task: t, reason: "Assignee has a heavy open workload" });
      else if (slowHistory) out.push({ task: t, reason: "Assignee's on-time history below 75%" });
    }
  }
  return out;
}

export function criticalUnblocker(tasks: Task[], deps: Dependency[]): { task: Task; unblocks: number } | null {
  const openIds = new Set(tasks.filter(isOpen).map((t) => t.id));
  const children = new Map<string, string[]>(); // depends_on -> [task_id]
  for (const d of deps) {
    if (!children.has(d.depends_on)) children.set(d.depends_on, []);
    children.get(d.depends_on)!.push(d.task_id);
  }
  const chainSize = (id: string, seen = new Set<string>()): number => {
    let n = 0;
    for (const c of children.get(id) || []) {
      if (seen.has(c) || !openIds.has(c)) continue;
      seen.add(c);
      n += 1 + chainSize(c, seen);
    }
    return n;
  };
  let best: { task: Task; unblocks: number } | null = null;
  for (const t of tasks) {
    if (!openIds.has(t.id)) continue;
    const n = chainSize(t.id);
    if (n > 0 && (!best || n > best.unblocks)) best = { task: t, unblocks: n };
  }
  return best;
}

/* Difficulty is the single sizing scale. `effort` used to be a second,
   parallel points field that fed the workload math while difficulty — the one
   with rank-gated editing and a labelled 1-5 scale — fed nothing at all.
   People filled in both; only one counted. Difficulty now carries the weight,
   using the Fibonacci spacing in DIFFICULTY_LEVELS: a Complex task is 8 points
   against a Trivial task's 1, because hard work costs disproportionately more
   than a linear 1..5 implies. Unsized tasks count as Moderate (3) rather than
   0, so an unestimated backlog can't read as free capacity. */
export const DIFFICULTY_DEFAULT = 3;
export function difficultyPoints(difficulty: number | null | undefined): number {
  const level = DIFFICULTY_LEVELS.find((d) => d.value === difficulty);
  return level ? level.weight : DIFFICULTY_LEVELS.find((d) => d.value === DIFFICULTY_DEFAULT)!.weight;
}

// capacity defaults to 20 points/week until the "capacity tracking" admin
// toggle is on and a real capacity_points value is set per person.
export function workloadPct(tasks: Task[], person: Profile): number {
  const open = tasksOfPerson(tasks, person.id).filter(isOpen);
  const points = open.reduce((s, t) => s + difficultyPoints(t.difficulty), 0);
  const capacity = person.capacity_points || 20;
  return Math.min(100, Math.round((points / capacity) * 100));
}

/* ---- rank checks, used for SOP visibility/approval — always by rank/level, never by name ---- */
export const isBoardOfDirectors = (p: Profile | null) => p?.level_id === "l1";
export const isGroupHead = (p: Profile | null) => p?.level_id === "l2";
export const isRegionalGroupHead = (p: Profile | null) => p?.level_id === "l2r";
export const isSeniorRank = (p: Profile | null) => isBoardOfDirectors(p) || isGroupHead(p) || isRegionalGroupHead(p);

/* ---- flag-driven rank checks — read the levels table's own boolean columns
   instead of hardcoding which level ids they apply to. A brand-new custom
   level (built via Admin console -> Organization levels -> + Add level) only
   gets real capability if these read its flags rather than a fixed id list —
   the whole point of "custom" levels. Mirrors the matching Postgres RLS
   helpers (app_is_dept_admin, app_is_multi_dept_admin, app_has_exec_visibility)
   so a level's toggles mean the same thing in the UI as at the database. */
function levelFlag(p: { is_super?: boolean; level_id?: string } | null, levels: Level[], key: keyof Level): boolean {
  if (!p) return false;
  if (p.is_super) return true;
  return !!levels.find((l) => l.id === p.level_id)?.[key];
}
export const isMultiDeptAdmin = (p: { is_super?: boolean; level_id?: string } | null, levels: Level[]) => levelFlag(p, levels, "multi_dept_admin");
export const isDeptAdmin = (p: { is_super?: boolean; level_id?: string } | null, levels: Level[]) => levelFlag(p, levels, "dept_admin");
export const hasExecVisibility = (p: { is_super?: boolean; level_id?: string } | null, levels: Level[]) => levelFlag(p, levels, "exec_visibility");

export function internalAuditDept(departments: Department[]): Department | undefined {
  return departments.find((d) => d.name === "Internal Audit");
}
export function isInternalAudit(p: Profile | null, departments: Department[]): boolean {
  const dept = internalAuditDept(departments);
  return !!dept && p?.department_id === dept.id;
}
export function isDeptHead(profileId: string, deptId: string | null, deptHeads: { unit_id: string; profile_id: string }[]): boolean {
  return !!deptId && deptHeads.some((h) => h.unit_id === deptId && h.profile_id === profileId);
}
export function isInternalAuditManager(p: Profile | null, departments: Department[], deptHeads: { unit_id: string; profile_id: string }[]): boolean {
  const dept = internalAuditDept(departments);
  return !!dept && !!p && isDeptHead(p.id, dept.id, deptHeads);
}

/** SOP visibility: owning department + exec-visibility levels (Board/Group/Regional
   Heads, or any custom level flagged the same way) + Internal Audit (always,
   everywhere). Plain (non-SOP) docs are unrestricted. Mirrors app_can_read_doc()
   in Postgres — that's the real enforcement; this is the matching UI filter. */
export function canViewSop(deptId: string | null, me: Profile | null, departments: Department[], levels: Level[] = []): boolean {
  if (!me) return false;
  if (hasExecVisibility(me, levels)) return true;
  if (isInternalAudit(me, departments)) return true;
  return !!deptId && me.department_id === deptId;
}

/* Per-doc visibility. Mirrors app_can_read_doc() in Postgres — that function is
   the real enforcement; this exists so the list a reader sees matches what the
   database would hand back, instead of rendering rows that silently vanish. */
export function canViewDoc(
  doc: { department_id: string | null; visibility?: DocVisibility; owner_id?: string | null },
  me: Profile | null,
  departments: Department[],
  levels: Level[] = []
): boolean {
  if (!me) return false;
  const visibility = doc.visibility || "department";
  if (visibility === "company") return true;
  if (hasExecVisibility(me, levels)) return true;
  if (isInternalAudit(me, departments)) return true;
  if (visibility === "restricted") return doc.owner_id === me.id;
  return !!doc.department_id && me.department_id === doc.department_id;
}


/* Move one id to another id's position, returning the new order.

   This is the whole of a drag-and-drop reorder that can actually be wrong: the
   splice indices. The gesture itself needs a real browser (synthetic mouse
   events do not produce native HTML5 drag events), but the arithmetic does not,
   and an off-by-one here is what silently drops an item one slot short. */
export function moveInOrder(ids: string[], fromId: string, toId: string): string[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** The `sort` values a reordered list should be written back with. Re-spaced by
    10 so a later single-item move never has to renumber its neighbours. */
export function sortValuesFor(ids: string[]): { id: string; sort: number }[] {
  return ids.map((id, i) => ({ id, sort: (i + 1) * 10 }));
}
