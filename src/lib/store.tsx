"use client";
import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import {
  Approval, AuditEntry, Automation, BoardRequest, CustomField, Department, DeptProposal,
  Dependency, Doc, FormDef, Invite, Level, List, Nomination, Notification, Pin, Profile, Space,
  Task, TaskActivity, Template,
} from "./types";

export interface StoreData {
  me: Profile | null;
  profiles: Profile[];
  levels: Level[];
  departments: Department[];
  deptHeads: { department_id: string; profile_id: string }[];
  deptMembers: { department_id: string; profile_id: string }[];
  spaces: Space[];
  lists: List[];
  tasks: Task[];
  deps: Dependency[];
  activity: TaskActivity[];
  docs: Doc[];
  forms: FormDef[];
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
  spaces: [], lists: [], tasks: [], deps: [], activity: [], docs: [], forms: [],
  notifications: [], prefs: {}, approvals: [], invites: [], boardRequests: [],
  nominations: [], proposals: [], audit: [], templates: [], customFields: [],
  automations: [], features: {}, savedViews: [], pins: [],
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
      profiles, levels, departments, deptHeads, deptMembers, spaces, lists,
      tasks, assignees, raci, deps, activity, docs, forms, notifications, prefs,
      approvals, invites, boardRequests, nominations, proposals, audit,
      templates, customFields, automations, features, savedViews, pins,
    ] = await Promise.all([
      supabase.from("profiles").select("*").order("name"),
      supabase.from("levels").select("*").order("sort"),
      supabase.from("departments").select("*").order("name"),
      supabase.from("department_heads").select("*"),
      supabase.from("department_members").select("*"),
      supabase.from("spaces").select("*").order("sort"),
      supabase.from("lists").select("*").order("sort"),
      supabase.from("tasks").select("*").order("due", { ascending: true, nullsFirst: false }),
      supabase.from("task_assignees").select("*"),
      supabase.from("task_raci").select("*"),
      supabase.from("task_dependencies").select("*"),
      supabase.from("task_activity").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("docs").select("*").order("created_at"),
      supabase.from("forms").select("*").order("created_at"),
      supabase.from("notifications").select("*").eq("profile_id", uid).order("created_at", { ascending: false }).limit(100),
      supabase.from("notification_prefs").select("*").eq("profile_id", uid),
      supabase.from("approvals").select("*").eq("status", "pending"),
      supabase.from("invites").select("*").order("created_at", { ascending: false }),
      supabase.from("board_requests").select("*").eq("status", "pending"),
      supabase.from("nominations").select("*").eq("status", "pending"),
      supabase.from("dept_proposals").select("*").eq("status", "pending"),
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("templates").select("*").order("created_at"),
      supabase.from("custom_fields").select("*").order("created_at"),
      supabase.from("automations").select("*").order("created_at"),
      supabase.from("features").select("*"),
      supabase.from("saved_views").select("*").eq("profile_id", uid).order("created_at"),
      supabase.from("pins").select("*").eq("profile_id", uid).order("sort"),
    ]);

    const byTask = new Map<string, string[]>();
    for (const a of assignees.data || []) {
      if (!byTask.has(a.task_id)) byTask.set(a.task_id, []);
      byTask.get(a.task_id)!.push(a.profile_id);
    }
    const raciC = new Map<string, string[]>();
    const raciI = new Map<string, string[]>();
    for (const r of raci.data || []) {
      const m = r.role === "C" ? raciC : raciI;
      if (!m.has(r.task_id)) m.set(r.task_id, []);
      m.get(r.task_id)!.push(r.profile_id);
    }

    const allTasks: Task[] = (tasks.data || []).map((t) => ({
      ...t,
      assignees: byTask.get(t.id) || [],
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
      spaces: (spaces.data || []) as Space[],
      lists: (lists.data || []) as List[],
      tasks: allTasks,
      deps: (deps.data || []) as Dependency[],
      activity: (activity.data || []) as TaskActivity[],
      docs: (docs.data || []) as Doc[],
      forms: (forms.data || []) as FormDef[],
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
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const patch = useCallback(<K extends keyof StoreData>(key: K, value: StoreData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
  }, []);

  return (
    <Ctx.Provider value={{ ...data, loading, refresh, patch, supabase }}>
      {children}
    </Ctx.Provider>
  );
}
