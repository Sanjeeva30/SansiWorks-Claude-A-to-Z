"use client";
import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "./supabase/client";
import {
  Approval, AuditEntry, Automation, Assignment, BoardRequest, Comment, CustomField, Department, DeptProposal,
  Dependency, Doc, DocVersion, FormDef, FormSubmission, Invite, Level, List, Nomination, Notification, PermissionTemplate, Pin, Profile, Space,
  Reminder, Subtask, Task, TaskActivity, Template,
} from "./types";

/* ============================================================================
   Sync strategy

   This used to load all ~34 tables on sign-in and, on ANY realtime event from
   ANY table, refetch all 34 again. Measured: a single row change fanned out to
   34 queries pulling the whole database. That is fine at 18 users and becomes
   the scale ceiling well before 100 — every user's edit costs every connected
   client a full re-read of everything.

   Two changes:

   1. ROW-LEVEL SYNC. A realtime event now patches just the row it describes
      (ROW_SYNC below). Only a handful of tables that feed derived shapes —
      raci arrays folded into tasks, key/value maps, composite-key join tables —
      still fall back to a debounced full refresh, and those change rarely.

   2. DEFERRED BUNDLE. Admin and drill-down tables (audit_log alone was 2000
      rows on every load) no longer load at sign-in. A screen that needs them
      calls ensureDeferred() in an effect and gets them on first use.
   ========================================================================== */

/** Tables whose realtime events can be applied surgically to one store array. */
type RowSpec = {
  key: keyof StoreData;
  /** Row belongs to a single user — ignore other people's rows even if RLS lets one through. */
  own?: boolean;
  /** Keeps the array in the same order the initial query used. */
  sort?: (a: Record<string, unknown>, b: Record<string, unknown>) => number;
  /** Upper bound so a long-lived tab can't grow an append-only feed forever. */
  cap?: number;
};

const byDueAsc = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const x = a.due as string | null, y = b.due as string | null;
  if (!x && !y) return 0;
  if (!x) return 1;            // nulls last, matching the initial query
  if (!y) return -1;
  return x < y ? -1 : x > y ? 1 : 0;
};
const byCreatedDesc = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  String(b.created_at || "").localeCompare(String(a.created_at || ""));
const bySortAsc = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Number(a.sort ?? 0) - Number(b.sort ?? 0);

const ROW_SYNC: Record<string, RowSpec> = {
  tasks:              { key: "tasks", sort: byDueAsc },
  subtasks:           { key: "subtasks", sort: bySortAsc },
  task_dependencies:  { key: "deps" },
  task_activity:      { key: "activity", sort: byCreatedDesc, cap: 200 },
  docs:               { key: "docs" },
  doc_versions:       { key: "docVersions" },
  forms:              { key: "forms" },
  form_submissions:   { key: "formSubmissions" },
  approvals:          { key: "approvals", sort: byCreatedDesc, cap: 300 },
  comments:           { key: "comments" },
  profiles:           { key: "profiles" },
  levels:             { key: "levels" },
  org_units:          { key: "departments" },
  assignments:        { key: "assignments" },
  permission_templates: { key: "permissionTemplates" },
  spaces:             { key: "spaces", sort: bySortAsc },
  lists:              { key: "lists", sort: bySortAsc },
  invites:            { key: "invites", sort: byCreatedDesc },
  board_requests:     { key: "boardRequests" },
  nominations:        { key: "nominations" },
  dept_proposals:     { key: "proposals" },
  audit_log:          { key: "audit", sort: byCreatedDesc, cap: 2000 },
  templates:          { key: "templates" },
  custom_fields:      { key: "customFields" },
  automations:        { key: "automations" },
  notifications:      { key: "notifications", own: true, sort: byCreatedDesc, cap: 100 },
  reminders:          { key: "reminders", own: true },
  pins:               { key: "pins", own: true, sort: bySortAsc },
  saved_views:        { key: "savedViews", own: true },
};

/* Not row-syncable, so they still trigger a debounced full refresh:
   - task_raci        → folded into tasks[].raci_c / raci_i, not its own array
   - notification_prefs, features → key/value maps, not id-keyed arrays
   - org_unit_heads, org_unit_members → composite keys, no id column
   All are low-frequency (org structure and settings), so a refresh is fine. */
const FULL_REFRESH_TABLES = [
  "task_raci", "notification_prefs", "features", "org_unit_heads", "org_unit_members",
];

/** Loaded only when a screen actually needs them. */
const DEFERRED_KEYS = [
  "audit", "invites", "boardRequests", "nominations", "proposals", "permissionTemplates",
  "templates", "customFields", "automations", "docVersions", "formSubmissions",
] as const;

export interface StoreData {
  me: Profile | null;
  profiles: Profile[];
  levels: Level[];
  departments: Department[];
  deptHeads: { unit_id: string; profile_id: string }[];
  deptMembers: { department_id: string; profile_id: string }[];
  assignments: Assignment[];
  permissionTemplates: PermissionTemplate[];
  spaces: Space[];
  lists: List[];
  tasks: Task[];
  subtasks: Subtask[];
  reminders: Reminder[];
  deps: Dependency[];
  activity: TaskActivity[];
  docs: Doc[];
  docVersions: DocVersion[];
  forms: FormDef[];
  formSubmissions: FormSubmission[];
  notifications: Notification[];
  prefs: Record<string, string>;
  approvals: Approval[];
  invites: Invite[];
  boardRequests: BoardRequest[];
  nominations: Nomination[];
  proposals: DeptProposal[];
  audit: AuditEntry[];
  templates: Template[];
  customFields: CustomField[];
  automations: Automation[];
  features: Record<string, boolean>;
  savedViews: { id: string; name: string; config: Record<string, unknown> }[];
  pins: Pin[];
  comments: Comment[];
}

interface StoreCtx extends StoreData {
  loading: boolean;
  /** True once the deferred bundle has arrived, so screens can show a loading state. */
  deferredReady: boolean;
  /** Call from an effect on any screen that reads admin/drill-down tables. */
  ensureDeferred: () => void;
  refresh: () => Promise<void>;
  patch: <K extends keyof StoreData>(key: K, value: StoreData[K]) => void;
  supabase: ReturnType<typeof createClient>;
}

const Ctx = createContext<StoreCtx | null>(null);

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore outside provider");
  return ctx;
}

const EMPTY: StoreData = {
  me: null, profiles: [], levels: [], departments: [], deptHeads: [], deptMembers: [],
  assignments: [], permissionTemplates: [],
  spaces: [], lists: [], tasks: [], subtasks: [], reminders: [], deps: [], activity: [], docs: [], docVersions: [], forms: [], formSubmissions: [],
  notifications: [], prefs: {}, approvals: [], invites: [], boardRequests: [],
  nominations: [], proposals: [], audit: [], templates: [], customFields: [],
  automations: [], features: {}, savedViews: [], pins: [], comments: [],
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [data, setData] = useState<StoreData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [deferredReady, setDeferredReady] = useState(false);
  const uidRef = useRef<string | null>(null);
  const deferredWanted = useRef(false);

  /* ---- core load: everything the main screens render from ---- */
  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    uidRef.current = uid;

    const [
      profiles, levels, departments, deptHeads, deptMembers, assignments, spaces, lists,
      tasks, raci, subtasks, reminders, deps, activity, docs, forms, notifications, prefs,
      approvals, features, savedViews, pins, comments,
    ] = await Promise.all([
      supabase.from("profiles").select("*").order("name"),
      supabase.from("levels").select("*").order("sort"),
      supabase.from("org_units").select("*").order("sort").order("name"),
      supabase.from("org_unit_heads").select("*"),
      supabase.from("org_unit_members").select("*"),
      supabase.from("assignments").select("*"),
      supabase.from("spaces").select("*").order("sort"),
      supabase.from("lists").select("*").order("sort"),
      supabase.from("tasks").select("*").eq("archived", false).order("due", { ascending: true, nullsFirst: false }),
      supabase.from("task_raci").select("*"),
      supabase.from("subtasks").select("*").order("sort"),
      supabase.from("reminders").select("*").eq("profile_id", uid).neq("status", "dismissed").order("remind_at"),
      supabase.from("task_dependencies").select("*"),
      supabase.from("task_activity").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("docs").select("*").eq("archived", false).order("created_at"),
      supabase.from("forms").select("*").order("created_at"),
      supabase.from("notifications").select("*").eq("profile_id", uid).order("created_at", { ascending: false }).limit(100),
      supabase.from("notification_prefs").select("*").eq("profile_id", uid),
      supabase.from("approvals").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("features").select("*"),
      supabase.from("saved_views").select("*").eq("profile_id", uid).order("created_at"),
      supabase.from("pins").select("*").eq("profile_id", uid).order("sort"),
      supabase.from("comments").select("*").order("created_at"),
    ]);

    const raciC = new Map<string, string[]>();
    const raciI = new Map<string, string[]>();
    for (const r of raci.data || []) {
      const m = r.role === "C" ? raciC : raciI;
      if (!m.has(r.task_id)) m.set(r.task_id, []);
      m.get(r.task_id)!.push(r.profile_id);
    }

    const allTasks: Task[] = (tasks.data || []).map((t) => ({
      ...t,
      raci_c: raciC.get(t.id) || [],
      raci_i: raciI.get(t.id) || [],
    }));

    const prefMap: Record<string, string> = {};
    for (const p of prefs.data || []) prefMap[p.category] = p.channel;
    const featMap: Record<string, boolean> = {};
    for (const f of features.data || []) featMap[f.key] = f.enabled;

    const allProfiles = (profiles.data || []) as Profile[];
    setData((prev) => ({
      ...prev, // keep any deferred tables already loaded
      me: allProfiles.find((p) => p.id === uid) || null,
      profiles: allProfiles,
      levels: (levels.data || []) as Level[],
      departments: (departments.data || []) as Department[],
      deptHeads: deptHeads.data || [],
      deptMembers: deptMembers.data || [],
      assignments: (assignments.data || []) as Assignment[],
      spaces: (spaces.data || []) as Space[],
      lists: (lists.data || []) as List[],
      tasks: allTasks,
      subtasks: (subtasks.data || []) as Subtask[],
      reminders: (reminders.data || []) as Reminder[],
      deps: (deps.data || []) as Dependency[],
      activity: (activity.data || []) as TaskActivity[],
      docs: (docs.data || []) as Doc[],
      forms: (forms.data || []) as FormDef[],
      notifications: (notifications.data || []) as Notification[],
      prefs: prefMap,
      approvals: (approvals.data || []) as Approval[],
      features: featMap,
      savedViews: savedViews.data || [],
      pins: (pins.data || []) as Pin[],
      comments: (comments.data || []) as Comment[],
    }));
    setLoading(false);
  }, [supabase]);

  /* ---- deferred load: admin console, doc history, form submissions ---- */
  const loadDeferred = useCallback(async () => {
    const [
      permissionTemplates, docVersions, formSubmissions, invites,
      boardRequests, nominations, proposals, audit, templates, customFields, automations,
    ] = await Promise.all([
      supabase.from("permission_templates").select("*").order("name"),
      supabase.from("doc_versions").select("*").order("version_number", { ascending: false }),
      supabase.from("form_submissions").select("*").order("submitted_at", { ascending: false }),
      supabase.from("invites").select("*").order("created_at", { ascending: false }),
      supabase.from("board_requests").select("*").eq("status", "pending"),
      supabase.from("nominations").select("*").eq("status", "pending"),
      supabase.from("dept_proposals").select("*").eq("status", "pending"),
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("templates").select("*").order("created_at"),
      supabase.from("custom_fields").select("*").order("created_at"),
      supabase.from("automations").select("*").order("created_at"),
    ]);
    setData((d) => ({
      ...d,
      permissionTemplates: (permissionTemplates.data || []) as PermissionTemplate[],
      docVersions: (docVersions.data || []) as DocVersion[],
      formSubmissions: (formSubmissions.data || []) as FormSubmission[],
      invites: (invites.data || []) as Invite[],
      boardRequests: (boardRequests.data || []) as BoardRequest[],
      nominations: (nominations.data || []) as Nomination[],
      proposals: (proposals.data || []) as DeptProposal[],
      audit: (audit.data || []) as AuditEntry[],
      templates: (templates.data || []).map((t) => ({ ...t, checklist: t.checklist || [] })) as Template[],
      customFields: (customFields.data || []) as CustomField[],
      automations: (automations.data || []) as Automation[],
    }));
    setDeferredReady(true);
  }, [supabase]);

  const ensureDeferred = useCallback(() => {
    if (deferredWanted.current) return;
    deferredWanted.current = true;
    loadDeferred();
  }, [loadDeferred]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* ---- live sync ---- */
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFullRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(), 400);
    };

    /** Apply one realtime event to one array in the store. */
    const applyRow = (table: string, evt: string, next: Record<string, unknown> | null, prevRow: Record<string, unknown> | null) => {
      const spec = ROW_SYNC[table];
      if (!spec) return;
      const id = (next?.id ?? prevRow?.id) as string | undefined;
      if (!id) return; // DELETE without a primary key — nothing safe to do

      setData((d) => {
        const current = d[spec.key] as unknown as Record<string, unknown>[];
        if (!Array.isArray(current)) return d;

        // A deferred table nobody has loaded yet: don't half-populate it, the
        // eventual fetch will include this row anyway.
        if ((DEFERRED_KEYS as readonly string[]).includes(spec.key as string) && !deferredWanted.current) return d;

        if (evt === "DELETE" || (next as { archived?: boolean } | null)?.archived === true) {
          // The initial fetch excludes archived rows (tasks/docs) entirely — an
          // UPDATE that flips archived to true has to be treated the same as a
          // delete here, or the row would reappear in the live store the next
          // time anything else about it changes.
          const after = current.filter((r) => r.id !== id);
          return after.length === current.length ? d : { ...d, [spec.key]: after };
        }
        if (!next) return d;
        if (spec.own && next.profile_id && next.profile_id !== uidRef.current) return d;

        let row = next;
        if (table === "tasks") {
          // tasks[] carries raci arrays folded in from task_raci; realtime only
          // gives the tasks row, so preserve what we already resolved.
          const existing = current.find((r) => r.id === id) as Task | undefined;
          row = { ...next, raci_c: existing?.raci_c ?? [], raci_i: existing?.raci_i ?? [] };
        }

        const idx = current.findIndex((r) => r.id === id);
        let after = idx >= 0
          ? current.map((r, i) => (i === idx ? row : r))
          : [...current, row];
        if (spec.sort) after = [...after].sort(spec.sort);
        if (spec.cap && after.length > spec.cap) after = after.slice(0, spec.cap);
        return { ...d, [spec.key]: after };
      });
    };

    let channel = supabase.channel("db-sync");
    for (const table of Object.keys(ROW_SYNC)) {
      channel = channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table },
        (payload: { eventType: string; new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => {
          applyRow(table, payload.eventType, payload.new, payload.old);
        }
      );
    }
    for (const table of FULL_REFRESH_TABLES) {
      channel = channel.on("postgres_changes" as never, { event: "*", schema: "public", table }, scheduleFullRefresh);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const patch = useCallback(<K extends keyof StoreData>(key: K, value: StoreData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
  }, []);

  // `me` always tracks the live entry in `profiles` — so a patch to your own
  // profile (avatar, color, capacity, overrides) shows up immediately instead
  // of waiting for the next full refresh().
  const liveMe = data.me ? data.profiles.find((p) => p.id === data.me!.id) || data.me : null;

  return (
    <Ctx.Provider value={{ ...data, me: liveMe, loading, deferredReady, ensureDeferred, refresh, patch, supabase }}>
      {children}
    </Ctx.Provider>
  );
}
