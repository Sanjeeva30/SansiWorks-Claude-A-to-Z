"use client";
// Mutation helpers: optimistic local patch + Supabase write + instant-alert hook.
import { StoreData } from "./store";
import { Task } from "./types";
import { createClient } from "./supabase/client";

type Supabase = ReturnType<typeof createClient>;
type Patch = <K extends keyof StoreData>(key: K, value: StoreData[K]) => void;

export async function updateTask(
  supabase: Supabase,
  tasks: Task[],
  patch: Patch,
  id: string,
  fields: Partial<Task>
) {
  const next = tasks.map((t) => (t.id === id ? { ...t, ...fields } : t));
  patch("tasks", next);
  const dbFields: Record<string, unknown> = { ...fields };
  delete dbFields.assignees;
  delete dbFields.raci_c;
  delete dbFields.raci_i;
  if (fields.status === "Done") dbFields.completed_at = new Date().toISOString();
  if (fields.status && fields.status !== "Done") dbFields.completed_at = null;
  if (Object.keys(dbFields).length) {
    await supabase.from("tasks").update(dbFields).eq("id", id);
  }
  if (fields.assignees) {
    await supabase.from("task_assignees").delete().eq("task_id", id);
    if (fields.assignees.length) {
      await supabase.from("task_assignees").insert(fields.assignees.map((p) => ({ task_id: id, profile_id: p })));
    }
  }
  if (fields.raci_c || fields.raci_i) {
    const t = next.find((x) => x.id === id)!;
    await supabase.from("task_raci").delete().eq("task_id", id);
    const rows = [
      ...t.raci_c.map((p) => ({ task_id: id, profile_id: p, role: "C" })),
      ...t.raci_i.map((p) => ({ task_id: id, profile_id: p, role: "I" })),
    ];
    if (rows.length) await supabase.from("task_raci").insert(rows);
  }
}

export async function createTask(
  supabase: Supabase,
  tasks: Task[],
  patch: Patch,
  input: {
    name: string;
    list_id: string | null;
    owner_id: string;
    status?: string;
    priority?: string;
    due?: string | null;
    description?: string;
    assignees: string[];
    accountable_id?: string | null;
    raci_c?: string[];
    raci_i?: string[];
    reminder_at?: string | null;
    recur?: string;
  }
): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      name: input.name,
      list_id: input.list_id,
      owner_id: input.owner_id,
      status: input.status || "Not Started",
      priority: input.priority || "Medium",
      due: input.due || null,
      description: input.description || null,
      accountable_id: input.accountable_id || null,
      reminder_at: input.reminder_at || null,
      recur: input.recur || "none",
    })
    .select()
    .single();
  if (error || !data) return null;
  const assignees = input.assignees.length ? input.assignees : [input.owner_id];
  await supabase.from("task_assignees").insert(assignees.map((p) => ({ task_id: data.id, profile_id: p })));
  const raciRows = [
    ...(input.raci_c || []).map((p) => ({ task_id: data.id, profile_id: p, role: "C" })),
    ...(input.raci_i || []).map((p) => ({ task_id: data.id, profile_id: p, role: "I" })),
  ];
  if (raciRows.length) await supabase.from("task_raci").insert(raciRows);
  const task: Task = { ...data, assignees, raci_c: input.raci_c || [], raci_i: input.raci_i || [] };
  patch("tasks", [...tasks, task]);
  // fire-and-forget instant alerts for assignment
  fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "assigned", taskId: data.id }),
  }).catch(() => {});
  return task;
}

/* ---------------- Phase 2: governance, subtasks, dependencies ---------------- */
import { Approval, Dependency, Level, List, Profile, Space, Subtask, Task as TaskT } from "./types";

async function logActivity(supabase: Supabase, store: Pick<StoreData, "activity">, patch: Patch, taskId: string, actorId: string, action: string) {
  const { data } = await supabase.from("task_activity").insert({ task_id: taskId, actor_id: actorId, action }).select().single();
  if (data) patch("activity", [data, ...store.activity]);
}

async function notify(supabase: Supabase, profileId: string, taskId: string | null, body: string, reason: string) {
  await supabase.from("notifications").insert({ profile_id: profileId, task_id: taskId, body, reason });
}

/* ----- permissions ----- */
export function levelSort(profiles: Profile[], levels: Level[], pid: string | null | undefined): number {
  const p = profiles.find((x) => x.id === pid);
  const l = levels.find((x) => x.id === p?.level_id);
  return l?.sort ?? 99;
}

/** Board / Group Heads / Super Admin may edit due dates directly; everyone else requests. */
export function canEditDueDirectly(me: Profile | null, levels: Level[], task: TaskT): boolean {
  if (!me) return false;
  if (me.is_super) return true;
  if (!task.list_id && task.owner_id === me.id) return true; // personal tasks are self-governed
  const l = levels.find((x) => x.id === me.level_id);
  return (l?.sort ?? 99) <= 2;
}

/** Approver must outrank the requester (lower sort = higher rank) or be their manager or a super admin. */
export function canDecideDueDate(me: Profile | null, profiles: Profile[], levels: Level[], approval: Approval): boolean {
  if (!me || me.id === approval.requester_id) return false;
  if (me.is_super) return true;
  const requester = profiles.find((p) => p.id === approval.requester_id);
  if (requester?.manager_id === me.id) return true;
  return levelSort(profiles, levels, me.id) < levelSort(profiles, levels, approval.requester_id);
}

/* ----- department-scoped people pickers ----- */
export function eligibleAssignees(
  store: Pick<StoreData, "profiles" | "deptMembers" | "lists" | "spaces">,
  listId: string | null
): Profile[] {
  if (!listId) return store.profiles; // personal tasks may involve anyone
  const list = store.lists.find((l: List) => l.id === listId);
  const space = store.spaces.find((s: Space) => s.id === list?.space_id);
  if (!space?.department_id) return store.profiles; // cross-functional space
  const memberIds = new Set(store.deptMembers.filter((m) => m.department_id === space.department_id).map((m) => m.profile_id));
  const scoped = store.profiles.filter((p) => memberIds.has(p.id) || p.is_super);
  return scoped.length ? scoped : store.profiles;
}

/* ----- due-date requests ----- */
export async function requestDueDate(
  supabase: Supabase,
  store: Pick<StoreData, "approvals" | "activity" | "profiles" | "levels">,
  patch: Patch,
  task: TaskT,
  me: Profile,
  requestedDue: string,
  reason: string
) {
  const { data, error } = await supabase
    .from("approvals")
    .insert({ task_id: task.id, requester_id: me.id, kind: "due_date", detail: reason, requested_due: requestedDue, prev_due: task.due, status: "pending" })
    .select()
    .single();
  if (error || !data) return null;
  patch("approvals", [data as Approval, ...store.approvals]);
  await logActivity(supabase, store, patch, task.id, me.id, `requested due date ${requestedDue} — "${reason}"`);
  // notify the approver: manager first, else any higher level
  const approverId = me.manager_id || store.profiles.find((p) => p.is_super && p.id !== me.id)?.id;
  if (approverId) await notify(supabase, approverId, task.id, `${me.name} requested a new due date (${requestedDue}) on "${task.name}"`, "Approval");
  return data as Approval;
}

export async function decideDueDate(
  supabase: Supabase,
  store: Pick<StoreData, "approvals" | "activity" | "tasks" | "profiles" | "levels">,
  patch: Patch,
  approval: Approval,
  me: Profile,
  verdict: "approved" | "declined",
  note?: string
) {
  const decided: Approval = { ...approval, status: verdict, decided_by: me.id, decided_at: new Date().toISOString(), decision_note: note || null };
  patch("approvals", store.approvals.map((a) => (a.id === approval.id ? decided : a)));
  await supabase.from("approvals").update({ status: verdict, decided_by: me.id, decided_at: decided.decided_at, decision_note: note || null }).eq("id", approval.id);
  const task = store.tasks.find((t) => t.id === approval.task_id);
  if (verdict === "approved" && task && approval.requested_due) {
    await updateTask(supabase, store.tasks, patch, task.id, { due: approval.requested_due });
  }
  if (task) {
    await logActivity(supabase, store, patch, task.id, me.id, verdict === "approved" ? `approved due date ${approval.requested_due}${note ? ` — "${note}"` : ""}` : `declined due-date request${note ? ` — "${note}"` : ""}`);
  }
  await notify(supabase, approval.requester_id, approval.task_id, `Your due-date request on "${task?.name || "a task"}" was ${verdict}${note ? `: ${note}` : ""}`, "Approval");
}

/* ----- subtasks ----- */
export async function addSubtask(
  supabase: Supabase, store: Pick<StoreData, "subtasks">, patch: Patch,
  taskId: string, name: string, assigneeId: string | null, due: string | null
) {
  const sort = store.subtasks.filter((s) => s.task_id === taskId).length;
  const { data } = await supabase.from("subtasks").insert({ task_id: taskId, name, assignee_id: assigneeId, due, sort }).select().single();
  if (data) patch("subtasks", [...store.subtasks, data as Subtask]);
  return data as Subtask | null;
}

export async function updateSubtask(
  supabase: Supabase, store: Pick<StoreData, "subtasks">, patch: Patch,
  id: string, fields: Partial<Subtask>
) {
  patch("subtasks", store.subtasks.map((s) => (s.id === id ? { ...s, ...fields } : s)));
  await supabase.from("subtasks").update(fields).eq("id", id);
}

export async function deleteSubtask(supabase: Supabase, store: Pick<StoreData, "subtasks">, patch: Patch, id: string) {
  patch("subtasks", store.subtasks.filter((s) => s.id !== id));
  await supabase.from("subtasks").delete().eq("id", id);
}

/* ----- dependencies ----- */
/** True if making `taskId` depend on `dependsOn` would create a cycle. */
export function wouldCycle(deps: Dependency[], taskId: string, dependsOn: string): boolean {
  if (taskId === dependsOn) return true;
  // walk upstream from dependsOn; if we reach taskId, adding the edge closes a loop
  const seen = new Set<string>();
  const stack = [dependsOn];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const d of deps) if (d.task_id === cur) stack.push(d.depends_on);
  }
  return false;
}

export async function addDependency(supabase: Supabase, store: Pick<StoreData, "deps">, patch: Patch, taskId: string, dependsOn: string): Promise<string | null> {
  if (store.deps.some((d) => d.task_id === taskId && d.depends_on === dependsOn)) return "Already linked.";
  if (wouldCycle(store.deps, taskId, dependsOn)) return "That would create a circular dependency.";
  patch("deps", [...store.deps, { task_id: taskId, depends_on: dependsOn }]);
  await supabase.from("task_dependencies").insert({ task_id: taskId, depends_on: dependsOn });
  return null;
}

export async function removeDependency(supabase: Supabase, store: Pick<StoreData, "deps">, patch: Patch, taskId: string, dependsOn: string) {
  patch("deps", store.deps.filter((d) => !(d.task_id === taskId && d.depends_on === dependsOn)));
  await supabase.from("task_dependencies").delete().eq("task_id", taskId).eq("depends_on", dependsOn);
}

export function managerOf(profiles: StoreData["profiles"], pid: string | undefined): string | null {
  if (!pid) return null;
  const p = profiles.find((x) => x.id === pid);
  if (p?.manager_id) return p.manager_id;
  // design fallback: Dewi Santoso
  const dewi = profiles.find((x) => x.name === "Dewi Santoso");
  return dewi?.id || null;
}
