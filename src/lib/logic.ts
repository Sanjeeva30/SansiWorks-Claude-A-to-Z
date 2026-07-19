// Locked logic from the handover README:
// - Department risk = % of that department's open tasks that are overdue
// - Team/People efficiency = 75% completed-on-time-vs-late ratio + 25% still-overdue (current-state adjustment)
// - Department efficiency = same formula, applied department-wide
// - At-risk prediction = overdue OR (due ≤4 days AND (assignee has ≥5 open tasks OR assignee's on-time history <75%))
// - Critical unblocker of the day = open task with the largest downstream dependency chain of other open tasks
import { Task, Dependency, Profile, Department } from "./types";
import { todayIso } from "./dates";

export const isOpen = (t: Task) => t.status !== "Done";
export const isOverdue = (t: Task) => isOpen(t) && !!t.due && t.due < todayIso();

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

export function efficiencyScore(tasks: Task[]): { score: number; color: string } {
  const { onTime, total } = onTimeStats(tasks);
  const historyPct = total > 0 ? (onTime / total) * 100 : 100;
  const open = tasks.filter(isOpen);
  const overdue = open.filter(isOverdue);
  const healthPct = open.length > 0 ? 100 - (overdue.length / open.length) * 100 : 100;
  const score = Math.round(historyPct * 0.75 + healthPct * 0.25);
  return { score, color: score >= 80 ? "var(--green)" : score >= 60 ? "#B7791F" : "var(--red)" };
}

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

// capacity defaults to 20 points/week until the "capacity tracking" admin
// toggle is on and a real capacity_points value is set per person.
export function workloadPct(tasks: Task[], person: Profile): number {
  const open = tasksOfPerson(tasks, person.id).filter(isOpen);
  const points = open.reduce((s, t) => s + (t.effort || 1), 0);
  const capacity = person.capacity_points || 20;
  return Math.min(100, Math.round((points / capacity) * 100));
}

/* ---- rank checks, used for SOP visibility/approval — always by rank/level, never by name ---- */
export const isBoardOfDirectors = (p: Profile | null) => p?.level_id === "l1";
export const isGroupHead = (p: Profile | null) => p?.level_id === "l2";
export const isRegionalGroupHead = (p: Profile | null) => p?.level_id === "l2r";
export const isSeniorRank = (p: Profile | null) => isBoardOfDirectors(p) || isGroupHead(p) || isRegionalGroupHead(p);

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

/** SOP visibility: owning department + Board + Group Heads + Regional Group Heads + Internal Audit (always, everywhere). Plain (non-SOP) docs are unrestricted. */
export function canViewSop(deptId: string | null, me: Profile | null, departments: Department[]): boolean {
  if (!me) return false;
  if (isSeniorRank(me)) return true;
  if (isInternalAudit(me, departments)) return true;
  return !!deptId && me.department_id === deptId;
}
