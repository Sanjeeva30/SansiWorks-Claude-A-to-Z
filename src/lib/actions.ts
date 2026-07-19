"use client";
// Mutation helpers: optimistic local patch + Supabase write + instant-alert hook.
import { StoreData } from "./store";
import { Attachment, Comment, Task } from "./types";
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
  delete dbFields.raci_c;
  delete dbFields.raci_i;
  if (fields.status === "Done") dbFields.completed_at = new Date().toISOString();
  if (fields.status && fields.status !== "Done") dbFields.completed_at = null;
  if (Object.keys(dbFields).length) {
    await supabase.from("tasks").update(dbFields).eq("id", id);
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
    assignee_id: string;
    accountable_id?: string | null;
    raci_c?: string[];
    raci_i?: string[];
    reminder_at?: string | null;
    recur?: string;
    difficulty?: number | null;
    difficulty_set_by?: string | null;
  }
): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      name: input.name,
      list_id: input.list_id,
      owner_id: input.owner_id,
      assignee_id: input.assignee_id,
      status: input.status || "Not Started",
      priority: input.priority || "Medium",
      due: input.due || null,
      description: input.description || null,
      accountable_id: input.accountable_id || null,
      reminder_at: input.reminder_at || null,
      recur: input.recur || "none",
      difficulty: input.difficulty || null,
      difficulty_set_by: input.difficulty ? input.difficulty_set_by || input.owner_id : null,
    })
    .select()
    .single();
  if (error || !data) return null;
  const raciRows = [
    ...(input.raci_c || []).map((p) => ({ task_id: data.id, profile_id: p, role: "C" })),
    ...(input.raci_i || []).map((p) => ({ task_id: data.id, profile_id: p, role: "I" })),
  ];
  if (raciRows.length) await supabase.from("task_raci").insert(raciRows);
  const task: Task = { ...data, raci_c: input.raci_c || [], raci_i: input.raci_i || [], difficulty: data.difficulty ?? null, difficulty_set_by: data.difficulty_set_by ?? null };
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
import { Approval, Assignment, DIFFICULTY_LEVELS, Dependency, Level, List, Profile, Space, Subtask, Task as TaskT } from "./types";

/** Who should decide an approval request from this person? Walks the real
 *  reporting lines from the org engine, in order:
 *  1. If they hold a function-assignment with a "reports to" unit set (e.g.
 *     Ambar's F&A-manager assignment reports to the Jogja cluster), the
 *     head(s) of that unit — this is how Ambar's request reaches Marlina,
 *     and a Jogja plant manager's reaches Oskar.
 *  2. Otherwise, the head(s) of their home department/unit (e.g. Wenny's
 *     request as Finance & Accounting's own head climbs straight to
 *     whoever heads Strategic Support — Jakarta has no regional layer).
 *  3. Otherwise, their assigned manager_id.
 *  4. Otherwise, any super admin, so a request is never silently stranded. */
export function resolveApprovers(
  store: Pick<StoreData, "profiles" | "assignments" | "deptHeads">,
  personId: string
): Profile[] {
  const { profiles, assignments, deptHeads } = store;
  const headsOf = (unitId: string) => deptHeads.filter((h) => h.unit_id === unitId).map((h) => profiles.find((p) => p.id === h.profile_id)).filter((p): p is Profile => !!p);

  const person = profiles.find((p) => p.id === personId);
  if (!person) return [];

  const myAssignments = assignments.filter((a) => a.profile_id === personId && a.reports_to_unit_id);
  for (const a of myAssignments) {
    const heads = headsOf((a as Assignment).reports_to_unit_id!);
    if (heads.length) return heads;
  }

  if (person.department_id) {
    const heads = headsOf(person.department_id).filter((h) => h.id !== personId);
    if (heads.length) return heads;
  }

  if (person.manager_id) {
    const manager = profiles.find((p) => p.id === person.manager_id);
    if (manager) return [manager];
  }

  const anySuper = profiles.find((p) => p.is_super && p.id !== personId);
  return anySuper ? [anySuper] : [];
}

export async function logActivity(supabase: Supabase, store: Pick<StoreData, "activity">, patch: Patch, taskId: string, actorId: string, action: string) {
  const { data } = await supabase.from("task_activity").insert({ task_id: taskId, actor_id: actorId, action }).select().single();
  if (data) patch("activity", [data, ...store.activity]);
}

export async function notify(supabase: Supabase, profileId: string, taskId: string | null, body: string, reason: string) {
  await supabase.from("notifications").insert({ profile_id: profileId, task_id: taskId, body, reason });
}

/* Compliance/admin audit trail — org, permissions, and SOP-approval changes.
   Distinct from task_activity (per-task history): this is what Internal Audit
   actually needs, so every admin-level mutation should call this. */
export async function logAudit(supabase: Supabase, actorId: string, action: string, target: string) {
  await supabase.from("audit_log").insert({ actor_id: actorId, action, target });
}

/* ----- comments & @mentions ----- */
export async function createComment(
  supabase: Supabase,
  store: Pick<StoreData, "comments">,
  patch: Patch,
  task: Task,
  author: Profile,
  body: string,
  mentionedIds: string[]
): Promise<Comment | null> {
  const { data, error } = await supabase
    .from("comments")
    .insert({ task_id: task.id, author_id: author.id, body, mentioned_ids: mentionedIds })
    .select()
    .single();
  if (error || !data) return null;
  patch("comments", [...store.comments, data as Comment]);

  const notified = new Set<string>([author.id]);
  for (const pid of mentionedIds) {
    if (notified.has(pid)) continue;
    notified.add(pid);
    await notify(supabase, pid, task.id, `${author.name} mentioned you on "${task.name}"`, "mention");
  }
  const involved = [task.assignee_id, task.accountable_id, ...task.raci_c, ...task.raci_i].filter((x): x is string => !!x);
  for (const pid of involved) {
    if (notified.has(pid)) continue;
    notified.add(pid);
    await notify(supabase, pid, task.id, `${author.name} commented on "${task.name}"`, "comment");
  }
  return data as Comment;
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

/** Who may add subtasks to an existing task: the assignor (owner), the Accountable,
 *  anyone who outranks the assignor, or a super admin. Assignees themselves may not
 *  restructure the work they were given unless they also fit one of those roles. */
export function canAddSubtask(me: Profile | null, profiles: Profile[], levels: Level[], task: TaskT): boolean {
  if (!me) return false;
  if (me.is_super) return true;
  if (!task.list_id) return task.owner_id === me.id || task.assignee_id === me.id; // personal
  if (task.owner_id === me.id || task.accountable_id === me.id) return true;
  return levelSort(profiles, levels, me.id) < levelSort(profiles, levels, task.owner_id);
}

/** Accountable candidates for a given R (Responsible): same department as R, or anyone
 *  who outranks R (lower sort = higher rank). A is always picked by the assignor —
 *  never auto-selected — and is exactly one person. */
export function accountableCandidates(
  store: Pick<StoreData, "profiles" | "levels" | "deptMembers">,
  assigneeId: string | null
): Profile[] {
  const { profiles, levels, deptMembers } = store;
  if (!assigneeId) return profiles;
  const rRank = levelSort(profiles, levels, assigneeId);
  const r = profiles.find((p) => p.id === assigneeId);
  // "Same department as R" = R's home unit (profiles.department_id) — this always
  // works, even for someone just added to the org — unioned with any extra org-unit
  // memberships an admin has curated on top (department_members).
  const rDeptIds = new Set(
    profiles.filter((p) => p.department_id === r?.department_id).map((p) => p.id)
  );
  for (const m of deptMembers) if (m.department_id === r?.department_id) rDeptIds.add(m.profile_id);
  return profiles.filter(
    (p) => p.id !== assigneeId && (rDeptIds.has(p.id) || levelSort(profiles, levels, p.id) < rRank || p.is_super)
  );
}

/* ----- difficulty (1 Trivial .. 5 Complex) ----- */
const difficultyLabel = (d: number | null) => DIFFICULTY_LEVELS.find((x) => x.value === d)?.label || "—";

/** Whoever set the difficulty last "owns" it. Anyone can set it the first time
 *  (whoever assigns the task); after that, only someone who outranks that person
 *  — or a super admin — may change it. */
export function canEditDifficulty(profiles: Profile[], levels: Level[], me: Profile | null, currentSetterId: string | null): boolean {
  if (!me) return false;
  if (me.is_super) return true;
  if (!currentSetterId) return true;
  if (currentSetterId === me.id) return true;
  return levelSort(profiles, levels, me.id) < levelSort(profiles, levels, currentSetterId);
}

export async function updateTaskDifficulty(
  supabase: Supabase, store: Pick<StoreData, "tasks" | "activity">, patch: Patch,
  task: TaskT, me: Profile, difficulty: number
) {
  const prev = task.difficulty;
  patch("tasks", store.tasks.map((t) => (t.id === task.id ? { ...t, difficulty, difficulty_set_by: me.id } : t)));
  await supabase.from("tasks").update({ difficulty, difficulty_set_by: me.id }).eq("id", task.id);
  await logActivity(supabase, store, patch, task.id, me.id, prev == null
    ? `set difficulty to ${difficultyLabel(difficulty)}`
    : `changed difficulty from ${difficultyLabel(prev)} to ${difficultyLabel(difficulty)}`);
}

export async function updateSubtaskDifficulty(
  supabase: Supabase, store: Pick<StoreData, "subtasks" | "activity">, patch: Patch,
  subtask: Subtask, me: Profile, difficulty: number
) {
  const prev = subtask.difficulty;
  patch("subtasks", store.subtasks.map((s) => (s.id === subtask.id ? { ...s, difficulty, difficulty_set_by: me.id } : s)));
  await supabase.from("subtasks").update({ difficulty, difficulty_set_by: me.id }).eq("id", subtask.id);
  await logActivity(supabase, store, patch, subtask.task_id, me.id, prev == null
    ? `set subtask "${subtask.name}" difficulty to ${difficultyLabel(difficulty)}`
    : `changed subtask "${subtask.name}" difficulty from ${difficultyLabel(prev)} to ${difficultyLabel(difficulty)}`);
}

/* ----- reminders ----- */
export async function createReminder(
  supabase: Supabase, store: Pick<StoreData, "reminders">, patch: Patch,
  input: { profile_id: string; task_id?: string | null; subtask_id?: string | null; title: string; remind_at: string }
) {
  const { data } = await supabase.from("reminders").insert({
    profile_id: input.profile_id, task_id: input.task_id || null, subtask_id: input.subtask_id || null,
    title: input.title, remind_at: input.remind_at,
  }).select().single();
  // only reminders for the current viewer live in the store (RLS scopes reads anyway)
  if (data && store.reminders) patch("reminders", [...store.reminders, data].sort((a, b) => a.remind_at.localeCompare(b.remind_at)));
  return data;
}

export async function updateReminder(
  supabase: Supabase, store: Pick<StoreData, "reminders">, patch: Patch,
  id: string, fields: Partial<Pick<StoreData["reminders"][number], "remind_at" | "status" | "title">>
) {
  patch("reminders", store.reminders.map((r) => (r.id === id ? { ...r, ...fields } : r)));
  await supabase.from("reminders").update(fields).eq("id", id);
}

export async function deleteReminder(supabase: Supabase, store: Pick<StoreData, "reminders">, patch: Patch, id: string) {
  patch("reminders", store.reminders.filter((r) => r.id !== id));
  await supabase.from("reminders").delete().eq("id", id);
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
  store: Pick<StoreData, "approvals" | "activity" | "profiles" | "levels" | "assignments" | "deptHeads">,
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
  // Notify whoever actually decides this — real reporting line, not just "the manager field".
  const approvers = resolveApprovers(store, me.id);
  for (const approver of approvers) {
    await notify(supabase, approver.id, task.id, `${me.name} requested a new due date (${requestedDue}) on "${task.name}"`, "Approval");
  }
  fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "approval_requested", approvalId: data.id, approverIds: approvers.map((a) => a.id) }),
  }).catch(() => {});
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
  fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "approval_decided", approvalId: approval.id, verdict, note: note || null }),
  }).catch(() => {});
}

/* ----- subtasks ----- */
export async function addSubtask(
  supabase: Supabase, store: Pick<StoreData, "subtasks">, patch: Patch,
  taskId: string, name: string, assigneeId: string | null, due: string | null,
  raci?: { accountable_id?: string | null; raci_c?: string[]; raci_i?: string[] },
  difficulty?: { value: number | null; setById: string }
) {
  const sort = store.subtasks.filter((s) => s.task_id === taskId).length;
  const { data } = await supabase.from("subtasks").insert({
    task_id: taskId, name, assignee_id: assigneeId, due, sort,
    accountable_id: raci?.accountable_id || null, raci_c: raci?.raci_c || [], raci_i: raci?.raci_i || [],
    difficulty: difficulty?.value || null, difficulty_set_by: difficulty?.value ? difficulty.setById : null,
  }).select().single();
  if (data) patch("subtasks", [...store.subtasks, data as Subtask]);
  return data as Subtask | null;
}

/* ----- suggested assignees (create-task side panel) ----- */
export function suggestAssignees(
  store: Pick<StoreData, "profiles" | "tasks" | "deptMembers" | "lists" | "spaces">,
  title: string,
  listId: string | null,
  excludeIds: string[] = []
): { p: Profile; reason: string }[] {
  const words = title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const list = store.lists.find((l) => l.id === listId);
  const space = store.spaces.find((s) => s.id === list?.space_id);
  const deptIds = space?.department_id
    ? new Set(store.deptMembers.filter((m) => m.department_id === space.department_id).map((m) => m.profile_id))
    : null;

  const scored = store.profiles
    .filter((p) => !excludeIds.includes(p.id))
    .map((p) => {
      const theirTasks = store.tasks.filter((t) => t.assignee_id === p.id);
      const similar = words.length
        ? theirTasks.filter((t) => words.some((w) => t.name.toLowerCase().includes(w))).length
        : 0;
      const open = theirTasks.filter((t) => t.status !== "Done").length;
      const inDept = deptIds ? deptIds.has(p.id) : false;
      const score = similar * 3 + (inDept ? 2 : 0) + Math.max(0, 3 - open * 0.4);
      const reason = similar > 0
        ? `worked on ${similar} similar task${similar > 1 ? "s" : ""}`
        : inDept
          ? open <= 2 ? "in this department · light workload" : "in this department"
          : open <= 2 ? "light workload" : "";
      return { p, score, reason };
    })
    .filter((r) => r.score > 0.5 && r.reason)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored.map(({ p, reason }) => ({ p, reason }));
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

/* ---------------- Phase 3C: file attachments (real upload, storage-backed) ---------------- */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB

export async function listAttachments(supabase: Supabase, taskId: string): Promise<Attachment[]> {
  const { data } = await supabase.from("task_attachments").select("*").eq("task_id", taskId).order("created_at", { ascending: false });
  return (data || []) as Attachment[];
}

export async function uploadAttachment(
  supabase: Supabase, taskId: string, file: File
): Promise<{ attachment: Attachment | null; error?: string }> {
  if (file.size > MAX_ATTACHMENT_BYTES) return { attachment: null, error: `"${file.name}" is over the 25MB limit.` };
  const path = `${taskId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("task-attachments").upload(path, file);
  if (uploadError) return { attachment: null, error: uploadError.message };
  const { data, error } = await supabase
    .from("task_attachments")
    .insert({ task_id: taskId, name: file.name, size_bytes: file.size, storage_path: path })
    .select()
    .single();
  if (error || !data) return { attachment: null, error: error?.message || "Could not save the attachment record." };
  return { attachment: data as Attachment };
}

export async function deleteAttachment(supabase: Supabase, attachment: Attachment) {
  await supabase.storage.from("task-attachments").remove([attachment.storage_path]);
  await supabase.from("task_attachments").delete().eq("id", attachment.id);
}

export async function downloadAttachmentUrl(supabase: Supabase, storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage.from("task-attachments").createSignedUrl(storagePath, 60);
  return data?.signedUrl || null;
}
