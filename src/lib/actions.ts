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

export function managerOf(profiles: StoreData["profiles"], pid: string | undefined): string | null {
  if (!pid) return null;
  const p = profiles.find((x) => x.id === pid);
  if (p?.manager_id) return p.manager_id;
  // design fallback: Dewi Santoso
  const dewi = profiles.find((x) => x.name === "Dewi Santoso");
  return dewi?.id || null;
}
