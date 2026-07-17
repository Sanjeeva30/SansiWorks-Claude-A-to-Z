"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useStore } from "./store";

export type Section = "home" | "list" | "company" | "workspace";
export type HomePage = "today" | "myweek" | "all" | "personal";
export type ListPage = "list" | "everything";
export type CompanyPage = "executive" | "people";
export type WorkspacePage = "inbox" | "docs" | "forms" | "settings" | "admin";

interface Route {
  section: Section;
  homePage: HomePage;
  listPage: ListPage;
  companyPage: CompanyPage;
  workspacePage: WorkspacePage;
  activeList: { spaceId: string; listId: string } | null;
}

const DEFAULT_ROUTE: Route = {
  section: "home", homePage: "today", listPage: "list",
  companyPage: "executive", workspacePage: "inbox", activeList: null,
};

export interface Toast {
  id: number;
  msg: string;
  undo?: () => void;
  strip: boolean;
}

interface UIState {
  section: Section;
  setSection: (s: Section) => void;
  homePage: HomePage;
  setHomePage: (p: HomePage) => void;
  listPage: ListPage;
  setListPage: (p: ListPage) => void;
  companyPage: CompanyPage;
  setCompanyPage: (p: CompanyPage) => void;
  workspacePage: WorkspacePage;
  setWorkspacePage: (p: WorkspacePage) => void;
  activeList: { spaceId: string; listId: string } | null;
  setActiveList: (v: { spaceId: string; listId: string } | null) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  toasts: Toast[];
  pushToast: (msg: string, undo?: () => void) => void;
  dismissToast: (id: number) => void;
  profileTarget: string | null; // profile id
  openProfile: (id: string | null) => void;
  viewerLevel: "staff" | "admin";
  setViewerLevel: (v: "staff" | "admin") => void;
  activeTaskId: string | null;
  setActiveTaskId: (id: string | null) => void;
  showQuickAdd: boolean;
  setShowQuickAdd: (v: boolean) => void;
  quickAddStatus: string;
  setQuickAddStatus: (s: string) => void;
  showPalette: boolean;
  setShowPalette: (v: boolean) => void;
  metricModal: { title: string; taskIds: string[] } | null;
  setMetricModal: (m: { title: string; taskIds: string[] } | null) => void;
  showPortal: boolean;
  setShowPortal: (v: boolean) => void;
  escStack: React.MutableRefObject<Map<string, () => void>>;
}

const Ctx = createContext<UIState | null>(null);
export const useUI = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUI outside provider");
  return c;
};

/* ---------- URL <-> route mapping ---------- */
const HOME_PATHS: Record<HomePage, string> = { today: "/", myweek: "/my-week", all: "/my-tasks", personal: "/personal" };
const WORKSPACE_PATHS: Record<WorkspacePage, string> = { inbox: "/inbox", docs: "/docs", forms: "/forms", settings: "/settings", admin: "/admin" };

interface StoreSlices {
  lists: { id: string; space_id: string; slug: string }[];
  spaces: { id: string; slug: string }[];
  tasks: { id: string; task_number: number }[];
}

function pathFor(r: Route, s: StoreSlices): string {
  if (r.section === "home") return HOME_PATHS[r.homePage];
  if (r.section === "company") return r.companyPage === "people" ? "/people" : "/overview";
  if (r.section === "workspace") return WORKSPACE_PATHS[r.workspacePage];
  // list section
  if (r.listPage === "everything") return "/everything";
  const list = s.lists.find((l) => l.id === r.activeList?.listId);
  const space = s.spaces.find((x) => x.id === r.activeList?.spaceId);
  if (list && space) return `/space/${space.slug || space.id}/${list.slug || list.id}`;
  return "/everything";
}

function parsePath(path: string, s: StoreSlices):
  | { ok: true; route: Partial<Route>; taskId?: string }
  | { ok: false } {
  const p = path.replace(/\/+$/, "") || "/";
  const homeEntry = (Object.entries(HOME_PATHS) as [HomePage, string][]).find(([, v]) => v === p);
  if (homeEntry) return { ok: true, route: { section: "home", homePage: homeEntry[0] } };
  if (p === "/overview") return { ok: true, route: { section: "company", companyPage: "executive" } };
  if (p === "/people") return { ok: true, route: { section: "company", companyPage: "people" } };
  const wsEntry = (Object.entries(WORKSPACE_PATHS) as [WorkspacePage, string][]).find(([, v]) => v === p);
  if (wsEntry) return { ok: true, route: { section: "workspace", workspacePage: wsEntry[0] } };
  if (p === "/everything") return { ok: true, route: { section: "list", listPage: "everything" } };

  const spaceMatch = p.match(/^\/space\/([^/]+)\/([^/]+)$/);
  if (spaceMatch) {
    if (!s.lists.length) return { ok: false }; // store not loaded yet — retry later
    const space = s.spaces.find((x) => x.slug === spaceMatch[1] || x.id === spaceMatch[1]);
    const list = s.lists.find((l) => (l.slug === spaceMatch[2] || l.id === spaceMatch[2]) && (!space || l.space_id === space.id));
    if (list) return { ok: true, route: { section: "list", listPage: "list", activeList: { spaceId: list.space_id, listId: list.id } } };
    return { ok: true, route: { section: "list", listPage: "everything" } };
  }
  const taskMatch = p.match(/^\/t\/(?:SW-)?(\d+)$/i);
  if (taskMatch) {
    if (!s.tasks.length) return { ok: false };
    const t = s.tasks.find((x) => x.task_number === Number(taskMatch[1]));
    return { ok: true, route: { section: "home", homePage: "today" }, taskId: t?.id };
  }
  return { ok: true, route: {} }; // unknown path: keep current view
}

export function taskLink(taskNumber: number): string {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/t/${taskNumber}`;
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const [route, setRoute] = useState<Route>(DEFAULT_ROUTE);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [profileTarget, openProfile] = useState<string | null>(null);
  const [viewerLevel, setViewerLevel] = useState<"staff" | "admin">("staff");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState("Not Started");
  const [showPalette, setShowPalette] = useState(false);
  const [metricModal, setMetricModal] = useState<{ title: string; taskIds: string[] } | null>(null);
  const [showPortal, setShowPortal] = useState(false);
  const toastSeq = useRef(0);
  const escStack = useRef(new Map<string, () => void>());

  // refs kept in sync each render so navigation callbacks never read stale data
  const routeRef = useRef(route);
  routeRef.current = route;
  const storeRef = useRef<StoreSlices>({ lists: [], spaces: [], tasks: [] });
  storeRef.current = { lists: store.lists, spaces: store.spaces, tasks: store.tasks };
  const pendingPatch = useRef<Partial<Route> | null>(null);
  const unresolvedPath = useRef<string | null>(null);

  /* navigation: multiple setter calls in one tick merge into a single history entry */
  const nav = useCallback((patch: Partial<Route>) => {
    if (pendingPatch.current) {
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      return;
    }
    pendingPatch.current = patch;
    queueMicrotask(() => {
      const merged = { ...routeRef.current, ...pendingPatch.current };
      pendingPatch.current = null;
      const path = pathFor(merged, storeRef.current);
      if (typeof window !== "undefined" && window.location.pathname !== path) {
        window.history.pushState({}, "", path);
      }
      setRoute(merged);
    });
  }, []);

  /* initial load + back/forward */
  useEffect(() => {
    const apply = (path: string) => {
      const parsed = parsePath(path, storeRef.current);
      if (!parsed.ok) { unresolvedPath.current = path; return; }
      unresolvedPath.current = null;
      setRoute((prev) => ({ ...prev, ...parsed.route }));
      if (parsed.taskId) setActiveTaskId(parsed.taskId);
    };
    apply(window.location.pathname);
    const onPop = () => apply(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* deep links to /space/... or /t/... arrive before the store loads — resolve once it has */
  useEffect(() => {
    if (!unresolvedPath.current || !store.lists.length || !store.tasks.length) return;
    const path = unresolvedPath.current;
    unresolvedPath.current = null;
    const parsed = parsePath(path, storeRef.current);
    if (parsed.ok) {
      setRoute((prev) => ({ ...prev, ...parsed.route }));
      if (parsed.taskId) setActiveTaskId(parsed.taskId);
    }
  }, [store.lists, store.tasks]);

  const setSection = useCallback((s: Section) => nav({ section: s }), [nav]);
  const setHomePage = useCallback((p: HomePage) => nav({ section: "home", homePage: p }), [nav]);
  const setListPage = useCallback((p: ListPage) => nav({ section: "list", listPage: p }), [nav]);
  const setCompanyPage = useCallback((p: CompanyPage) => nav({ section: "company", companyPage: p }), [nav]);
  const setWorkspacePage = useCallback((p: WorkspacePage) => nav({ section: "workspace", workspacePage: p }), [nav]);
  const setActiveList = useCallback(
    (v: { spaceId: string; listId: string } | null) => nav(v ? { section: "list", listPage: "list", activeList: v } : { activeList: null }),
    [nav]
  );

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("sw-theme") : null;
    if (saved === "dark") setTheme("dark");
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-sw-theme", theme);
    localStorage.setItem("sw-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);
  const pushToast = useCallback((msg: string, undo?: () => void) => {
    const id = ++toastSeq.current;
    const strip = /to Done\b/.test(msg);
    setToasts((ts) => [...ts.slice(-2), { id, msg, undo, strip }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 5200);
  }, []);

  // keyboard shortcuts: Cmd/Ctrl+K palette, Cmd/Ctrl+T & 'n' new task, Escape cascade
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "t") {
        e.preventDefault();
        setShowQuickAdd(true);
        return;
      }
      const target = e.target as HTMLElement;
      if (
        e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "") &&
        !target?.isContentEditable
      ) {
        e.preventDefault();
        setShowQuickAdd(true);
        return;
      }
      if (e.key === "Escape") {
        // close in priority order
        setShowPalette((v) => {
          if (v) return false;
          const entries = Array.from(escStack.current.values());
          if (entries.length) {
            entries[entries.length - 1]();
          } else {
            setShowPortal(false);
            setShowQuickAdd(false);
            setActiveTaskId(null);
            setMetricModal(null);
            openProfile(null);
          }
          return v;
        });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider
      value={{
        section: route.section, setSection,
        homePage: route.homePage, setHomePage,
        listPage: route.listPage, setListPage,
        companyPage: route.companyPage, setCompanyPage,
        workspacePage: route.workspacePage, setWorkspacePage,
        activeList: route.activeList, setActiveList,
        theme, toggleTheme, toasts, pushToast, dismissToast,
        profileTarget, openProfile, viewerLevel, setViewerLevel,
        activeTaskId, setActiveTaskId, showQuickAdd, setShowQuickAdd,
        quickAddStatus, setQuickAddStatus, showPalette, setShowPalette,
        metricModal, setMetricModal, showPortal, setShowPortal, escStack,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
