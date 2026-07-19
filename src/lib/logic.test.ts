import { describe, it, expect } from "vitest";
import {
  isOpen, isOverdue, onTimeStats, efficiencyScore, departmentRisk, atRiskTasks,
  criticalUnblocker, workloadPct, canViewSop, isSeniorRank, isInternalAudit,
  isDeptHead, isInternalAuditManager,
} from "./logic";
import { Task, Profile, Department, Dependency } from "./types";

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

let seq = 0;
function task(fields: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`, task_number: seq, list_id: "l1", owner_id: "p1", name: `Task ${seq}`,
    status: "Not Started", priority: "Medium", due: null, effort: 1, blocked: false,
    description: null, reminder_at: null, recur: "none", accountable_id: null,
    completed_at: null, created_at: iso(0), milestone: false, assignee_id: "p1",
    raci_c: [], raci_i: [], difficulty: null, difficulty_set_by: null,
    ...fields,
  };
}

function profile(fields: Partial<Profile> = {}): Profile {
  seq += 1;
  return {
    id: `p${seq}`, name: `Person ${seq}`, email: `p${seq}@sansico.com`, phone: null,
    role_title: null, department_id: null, location: null, manager_id: null,
    color: "#000", joined_at: null, level_id: "l6", is_super: false, last_login: null,
    wa_enabled: true, wa_number: null, digest_time: "08:00", theme: "light",
    avatar_url: null, template_id: null, permission_overrides: null,
    capacity_points: null, birthday_day: null, birthday_month: null, birthday_year: null,
    designation: null,
    ...fields,
  };
}

function dept(fields: Partial<Department> = {}): Department {
  seq += 1;
  return { id: `d${seq}`, name: `Dept ${seq}`, color: "#000", mode: "Workspace visible", type: "department", parent_id: null, archived: false, sort: 0, dormant: false, ...fields };
}

describe("isOpen / isOverdue", () => {
  it("a Done task is never open or overdue, even with a past due date", () => {
    const t = task({ status: "Done", due: iso(-5) });
    expect(isOpen(t)).toBe(false);
    expect(isOverdue(t)).toBe(false);
  });
  it("an open task with a past due date is overdue", () => {
    const t = task({ status: "Working on it", due: iso(-1) });
    expect(isOverdue(t)).toBe(true);
  });
  it("an open task with no due date is never overdue", () => {
    const t = task({ status: "Stuck", due: null });
    expect(isOverdue(t)).toBe(false);
  });
});

describe("onTimeStats / efficiencyScore (75% history + 25% current health)", () => {
  it("counts a task completed on/before its due date as on-time", () => {
    const t = task({ status: "Done", due: iso(0), completed_at: new Date().toISOString() });
    const { onTime, late, total } = onTimeStats([t]);
    expect({ onTime, late, total }).toEqual({ onTime: 1, late: 0, total: 1 });
  });
  it("counts a task completed after its due date as late", () => {
    const t = task({ status: "Done", due: iso(-3), completed_at: new Date().toISOString() });
    const { onTime, late } = onTimeStats([t]);
    expect({ onTime, late }).toEqual({ onTime: 0, late: 1 });
  });
  it("scores 100 with no history and no open overdue work", () => {
    expect(efficiencyScore([]).score).toBe(100);
  });
  it("penalizes a mix of late history and currently-overdue open work", () => {
    const lateDone = task({ status: "Done", due: iso(-3), completed_at: new Date().toISOString() });
    const overdueOpen = task({ status: "Working on it", due: iso(-1) });
    const { score } = efficiencyScore([lateDone, overdueOpen]);
    // historyPct=0 (all late) *.75 + healthPct=0 (all open overdue) *.25 = 0
    expect(score).toBe(0);
  });
});

describe("departmentRisk (% of open tasks overdue)", () => {
  it("is 0 when there are no open tasks", () => {
    expect(departmentRisk([task({ status: "Done" })])).toBe(0);
  });
  it("is 50 when half the open tasks are overdue", () => {
    const rows = [task({ due: iso(-1) }), task({ due: iso(5) })];
    expect(departmentRisk(rows)).toBe(50);
  });
});

describe("atRiskTasks (overdue OR due<=4d AND (heavy load OR poor history))", () => {
  it("flags a Stuck task regardless of due date", () => {
    const t = task({ status: "Stuck", due: iso(30) });
    const flagged = atRiskTasks([t]);
    expect(flagged.map((f) => f.task.id)).toContain(t.id);
    expect(flagged[0].reason).toBe("Marked as stuck");
  });
  it("flags an overdue open task", () => {
    const t = task({ due: iso(-2) });
    expect(atRiskTasks([t])[0].reason).toContain("Overdue");
  });
  it("does NOT flag a task due soon for someone with a light load and clean history", () => {
    const t = task({ due: iso(2), assignee_id: "solo" });
    expect(atRiskTasks([t])).toHaveLength(0);
  });
  it("flags a task due soon when the assignee has >=5 open tasks", () => {
    const heavy = "busy-person";
    const filler = Array.from({ length: 4 }, () => task({ assignee_id: heavy, due: iso(20) }));
    const target = task({ assignee_id: heavy, due: iso(2) });
    const flagged = atRiskTasks([...filler, target]);
    expect(flagged.map((f) => f.task.id)).toContain(target.id);
    expect(flagged.find((f) => f.task.id === target.id)!.reason).toContain("heavy open workload");
  });
});

describe("criticalUnblocker (largest downstream chain of open tasks)", () => {
  it("returns null when nothing is blocked by anything", () => {
    const a = task();
    expect(criticalUnblocker([a], [])).toBeNull();
  });
  it("picks the task that unblocks the longest open chain", () => {
    const root = task();
    const mid = task();
    const leaf = task();
    const isolated = task();
    const deps: Dependency[] = [
      { id: "dep1", task_id: mid.id, depends_on: root.id, created_at: iso(0) } as Dependency,
      { id: "dep2", task_id: leaf.id, depends_on: mid.id, created_at: iso(0) } as Dependency,
    ];
    const result = criticalUnblocker([root, mid, leaf, isolated], deps);
    expect(result?.task.id).toBe(root.id);
    expect(result?.unblocks).toBe(2);
  });
  it("does not count a downstream task that's already Done", () => {
    const root = task();
    const doneChild = task({ status: "Done" });
    const deps: Dependency[] = [{ id: "dep1", task_id: doneChild.id, depends_on: root.id, created_at: iso(0) } as Dependency];
    expect(criticalUnblocker([root, doneChild], deps)).toBeNull();
  });
});

describe("workloadPct (capacity defaults to 20 pts/week)", () => {
  it("is 0 with no open tasks", () => {
    const p = profile({ id: "solo" });
    expect(workloadPct([], p)).toBe(0);
  });
  it("uses the default 20pt capacity when capacity_points is unset", () => {
    const p = profile({ id: "solo", capacity_points: null });
    const rows = [task({ assignee_id: "solo", effort: 10 })];
    expect(workloadPct(rows, p)).toBe(50);
  });
  it("caps at 100 even when massively over capacity", () => {
    const p = profile({ id: "solo", capacity_points: 5 });
    const rows = [task({ assignee_id: "solo", effort: 40 })];
    expect(workloadPct(rows, p)).toBe(100);
  });
});

describe("SOP rank/visibility rules — always by rank, never by name", () => {
  it("Board of Directors (l1) counts as senior rank", () => {
    expect(isSeniorRank(profile({ level_id: "l1" }))).toBe(true);
  });
  it("Group Head (l2) and Regional Group Head (l2r) count as senior rank", () => {
    expect(isSeniorRank(profile({ level_id: "l2" }))).toBe(true);
    expect(isSeniorRank(profile({ level_id: "l2r" }))).toBe(true);
  });
  it("a Department Head (l3) does NOT count as senior rank", () => {
    expect(isSeniorRank(profile({ level_id: "l3" }))).toBe(false);
  });

  it("isInternalAudit is true only for members of the department literally named Internal Audit", () => {
    const audit = dept({ name: "Internal Audit" });
    const other = dept({ name: "Finance & Shared Services" });
    expect(isInternalAudit(profile({ department_id: audit.id }), [audit, other])).toBe(true);
    expect(isInternalAudit(profile({ department_id: other.id }), [audit, other])).toBe(false);
  });

  it("isDeptHead / isInternalAuditManager resolve from org_unit_heads rows, not from any hardcoded name", () => {
    const audit = dept({ name: "Internal Audit" });
    const manager = profile({ id: "juwita-like", department_id: audit.id });
    const heads = [{ unit_id: audit.id, profile_id: manager.id }];
    expect(isDeptHead(manager.id, audit.id, heads)).toBe(true);
    expect(isInternalAuditManager(manager, [audit], heads)).toBe(true);
    // swap who holds the headship row — the same check now resolves to someone else, proving it's role-derived
    const successor = profile({ id: "successor", department_id: audit.id });
    const newHeads = [{ unit_id: audit.id, profile_id: successor.id }];
    expect(isInternalAuditManager(manager, [audit], newHeads)).toBe(false);
    expect(isInternalAuditManager(successor, [audit], newHeads)).toBe(true);
  });

  it("canViewSop: owning department, senior rank, and Internal Audit can all see it; an unrelated department cannot", () => {
    const finance = dept({ name: "Finance & Shared Services" });
    const audit = dept({ name: "Internal Audit" });
    const other = dept({ name: "Sourcing & Trade" });
    expect(canViewSop(finance.id, profile({ department_id: finance.id }), [finance, audit, other])).toBe(true);
    expect(canViewSop(finance.id, profile({ level_id: "l1" }), [finance, audit, other])).toBe(true);
    expect(canViewSop(finance.id, profile({ department_id: audit.id }), [finance, audit, other])).toBe(true);
    expect(canViewSop(finance.id, profile({ department_id: other.id, level_id: "l6" }), [finance, audit, other])).toBe(false);
  });
  it("canViewSop is false with no signed-in profile", () => {
    expect(canViewSop("any-dept", null, [])).toBe(false);
  });
});
