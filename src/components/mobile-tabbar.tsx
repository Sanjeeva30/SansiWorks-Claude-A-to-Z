"use client";
import React from "react";
import { useUI } from "@/lib/ui";
import { useStore } from "@/lib/store";

/* Thumb-reachable navigation for phones.

   Everything was behind a hamburger in the top-left — the furthest point from a
   thumb on a phone, and a tap-then-scan before you could go anywhere. Plant and
   vendor staff are the people most likely to be on a phone and least likely to
   tolerate that. The four destinations here cover what someone on the floor
   actually opens; the hamburger stays for departments, boards and admin. */
export function MobileTabBar() {
  const { section, homePage, workspacePage, setHomePage, setWorkspacePage, setShowPalette, setShowQuickAdd } = useUI();
  const { notifications } = useStore();
  const unread = notifications.filter((n) => !n.read).length;

  const tabs: { key: string; label: string; icon: string; active: boolean; run: () => void; badge?: number }[] = [
    { key: "work", label: "My Work", icon: "◎", active: section === "home" && homePage === "today", run: () => setHomePage("today") },
    { key: "inbox", label: "Inbox", icon: "✉", active: section === "workspace" && workspacePage === "inbox", run: () => setWorkspacePage("inbox"), badge: unread },
    { key: "search", label: "Search", icon: "⌕", active: false, run: () => setShowPalette(true) },
    { key: "new", label: "New", icon: "＋", active: false, run: () => setShowQuickAdd(true) },
  ];

  return (
    <nav className="sw-tabbar" aria-label="Main">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={t.run}
          aria-current={t.active ? "page" : undefined}
          style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 2, border: "none", background: "none", cursor: "pointer", padding: "6px 0",
            color: t.active ? "var(--sw-on-crimson)" : "var(--sw-text-soft)",
          }}
        >
          <span style={{ fontSize: 17, lineHeight: 1, position: "relative" }}>
            {t.icon}
            {!!t.badge && t.badge > 0 && (
              <span style={{
                position: "absolute", top: -3, right: -9, minWidth: 14, height: 14, borderRadius: 99,
                background: "var(--crimson)", color: "#fff", fontSize: 8.5, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
              }}>{t.badge > 9 ? "9+" : t.badge}</span>
            )}
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 400 }}>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
