"use client";
import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "./supabase/client";
import {
  Approval, AuditEntry, Automation, Assignment, BoardRequest, Comment, CustomField, Department, DeptProposal,
  Dependency, Doc, DocVersion, FormDef, FormSubmission, Invite, Level, List, Nomination, Notification, PermissionTemplate, Pin, Profile, Space,
  Reminder, Subtask, Task, TaskActivity, Template,
} from "./types";

// Every table the app reads, kept live via one Realtime channel (see below) —
// any insert/update/delete anywhere refetches the whole store (a full sync,
// not a per-row patch: simpler and safer than hand-writing ~30 reducers, at
// the cost of a refetch instead of a surgical update on every change).
const REALTIME_TABLES = [
  "profiles", "levels", "org_units", "org_unit_heads", "org_unit_members", "assignments", "permission_templates",
  "spaces", "lists", "tasks", "task_raci", "subtasks", "reminders", "task_dependencies", "task_activity",
  "docs", "doc_versions", "forms", "form_submissions", "notifications", "notification_prefs",
  "approvals", "invites", "board_requests", "nominations", "dept_proposals", "audit_log",
  "templates", "custom_fields", "automations", "features", "saved_views", "pins", "comments",
];

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

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;

    const [
      profiles, levels, departments, deptHeads, deptMembers, assignments, permissionTemplates, spaces, lists,
      tasks, raci, subtasks, reminders, deps, activity, docs, docVersions, forms, formSubmissions, notifications, prefs,
      approvals, invites, boardRequests, nominations, proposals, audit,
      templates, customFields, automations, features, savedViews, pins, comments,
    ] = await Promise.all([
      supabase.from("profiles").select("*").order("name"),
      supabase.from("levels").select("*").order("sort"),
      supabase.from("org_units").select("*").order("sort").order("name"),
      supabase.from("org_unit_heads").select("*"),
      supabase.from("org_unit_members").select("*"),
      supabase.from("assignments").select("*"),
      supabase.from("permission_templates").select("*").order("name"),
      supabase.from("spaces").select("*").order("sort"),
      supabase.from("lists").select("*").order("sort"),
      supabase.from("tasks").select("*").order("due", { ascending: true, nullsFirst: false }),
      supabase.from("task_raci").select("*"),
      supabase.from("subtasks").select("*").order("sort"),
      supabase.from("reminders").select("*").eq("profile_id", uid).neq("status", "dismissed").order("remind_at"),
      supabase.from("task_dependencies").select("*"),
      supabase.from("task_activity").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("docs").select("*").order("created_at"),
      supabase.from("doc_versions").select("*").order("version_number", { ascending: false }),
      supabase.from("forms").select("*").order("created_at"),
      supabase.from("form_submissions").select("*").order("submitted_at", { ascending: false }),
      supabase.from("notifications").select("*").eq("profile_id", uid).order("created_at", { ascending: false }).limit(100),
      supabase.from("notification_prefs").select("*").eq("profile_id", uid),
      supabase.from("approvals").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("invites").select("*").order("created_at", { ascending: false }),
      supabase.from("board_requests").select("*").eq("status", "pending"),
      supabase.from("nominations").select("*").eq("status", "pending"),
      supabase.from("dept_proposals").select("*").eq("status", "pending"),
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("templates").select("*").order("created_at"),
      supabase.from("custom_fields").select("*").order("created_at"),
      supabase.from("automations").select("*").order("created_at"),
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
    setData({
      me: allProfiles.find((p) => p.id === uid) || null,
      profiles: allProfiles,
      levels: (levels.data || []) as Level[],
      departments: (departments.data || []) as Department[],
      deptHeads: deptHeads.data || [],
      deptMembers: deptMembers.data || [],
      assignments: (assignments.data || []) as Assignment[],
      permissionTemplates: (permissionTemplates.data || []) as PermissionTemplate[],
      spaces: (spaces.data || []) as Space[],
      lists: (lists.data || []) as List[],
      tasks: allTasks,
      subtasks: (subtasks.data || []) as Subtask[],
      reminders: (reminders.data || []) as Reminder[],
      deps: (deps.data || []) as Dependency[],
      activity: (activity.data || []) as TaskActivity[],
      docs: (docs.data || []) as Doc[],
      docVersions: (docVersions.data || []) as DocVersion[],
      forms: (forms.data || []) as FormDef[],
      formSubmissions: (formSubmissions.data || []) as FormSubmission[],
      notifications: (notifications.data || []) as Notification[],
      prefs: prefMap,
      approvals: (approvals.data || []) as Approval[],
      invites: (invites.data || []) as Invite[],
      boardRequests: (boardRequests.data || []) as BoardRequest[],
      nominations: (nominations.data || []) as Nomination[],
      proposals: (proposals.data || []) as DeptProposal[],
      audit: (audit.data || []) as AuditEntry[],
      templates: (templates.data || []).map((t) => ({ ...t, checklist: t.checklist || [] })) as Template[],
      customFields: (customFields.data || []) as CustomField[],
      automations: (automations.data || []) as Automation[],
      features: featMap,
      savedViews: savedViews.data || [],
      pins: (pins.data || []) as Pin[],
      comments: (comments.data || []) as Comment[],
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live sync: one Realtime channel across every table the app reads. Any
  // change from any user (or another of your own tabs) debounces a full
  // refresh() — so the whole store stays live without per-table reducers.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const debounceMs = 400;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(), debounceMs);
    };
    let channel = supabase.channel("db-sync");
    for (const table of REALTIME_TABLES) {
      channel = channel.on("postgres_changes" as never, { event: "*", schema: "public", table }, scheduleRefresh);
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
    <Ctx.Provider value={{ ...data, me: liveMe, loading, refresh, patch, supabase }}>
      {children}
    </Ctx.Provider>
  );
}
