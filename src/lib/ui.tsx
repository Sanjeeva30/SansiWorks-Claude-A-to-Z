"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type Section = "home" | "list" | "company" | "workspace";
export type HomePage = "today" | "myweek";
export type ListPage = "list" | "mylist" | "everything";
export type CompanyPage = "executive" | "people";
export type WorkspacePage = "inbox" | "docs" | "forms" | "settings" | "admin";

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

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [section, setSection] = useState<Section>("home");
  const [homePage, setHomePage] = useState<HomePage>("today");
  const [listPage, setListPage] = useState<ListPage>("list");
  const [companyPage, setCompanyPage] = useState<CompanyPage>("executive");
  const [workspacePage, setWorkspacePage] = useState<WorkspacePage>("inbox");
  const [activeList, setActiveList] = useState<{ spaceId: string; listId: string } | null>(null);
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
        section, setSection, homePage, setHomePage, listPage, setListPage,
        companyPage, setCompanyPage, workspacePage, setWorkspacePage,
        activeList, setActiveList, theme, toggleTheme, toasts, pushToast, dismissToast,
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
