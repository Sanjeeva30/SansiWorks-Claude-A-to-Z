"use client";
import React, { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { initials } from "@/lib/types";
import { IconChevDown, IconStar } from "./icons";

const COLLAPSE_KEY = "sw-collapsed-spaces";

export function Sidebar() {
  const { me, spaces, lists, tasks, notifications, departments, pins, features, patch, supabase } = useStore();
  // Spaces under a dormant (overseas) unit stay hidden until the admin turns that toggle on.
  const dormantUnitIds = new Set(departments.filter((d) => d.dormant).map((d) => d.id));
  const visibleSpaces = features.overseas_teams ? spaces : spaces.filter((s) => !s.department_id || !dormantUnitIds.has(s.department_id));
  const {
    section, homePage, setHomePage, listPage, setListPage,
    companyPage, setCompanyPage, workspacePage, setWorkspacePage,
    activeList, setActiveList, openProfile, setShowPalette, pushToast,
    mobileNavOpen, setMobileNavOpen,
  } = useUI();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hoverList, setHoverList] = useState<string | null>(null);

  useEffect(() => {
    try { setCollapsed(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}")); } catch {}
  }, []);
  const toggleSpace = (id: string) => {
    const next = { ...collapsed, [id]: !collapsed[id] };
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch {}
  };

  const unread = notifications.filter((n) => !n.read).length;
  const openCount = (listId: string) => tasks.filter((t) => t.list_id === listId && t.status !== "Done").length;
  const pinnedListIds = pins.filter((p) => p.kind === "list").map((p) => p.target_id);

  const togglePin = async (listId: string) => {
    const existing = pins.find((p) => p.kind === "list" && p.target_id === listId);
    if (existing) {
      patch("pins", pins.filter((p) => p.id !== existing.id));
      await supabase.from("pins").delete().eq("id", existing.id);
    } else {
      if (!me) return;
      const { data } = await supabase.from("pins").insert({ profile_id: me.id, kind: "list", target_id: listId }).select().single();
      if (data) patch("pins", [...pins, data]);
      pushToast("Pinned to sidebar");
    }
  };

  const navBtn = (label: string, active: boolean, onClick: () => void, badge?: number) => (
    <button
      key={label}
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", width: "100%", textAlign: "left", padding: "6px 9px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 400, background: active ? "var(--sw-hover)" : "transparent", color: active ? "var(--crimson)" : "var(--sw-text-soft)" }}
    >
      <span style={{ flex: 1, fontWeight: 400 }}>{label}</span>
      {badge ? (
        <span style={{ background: "var(--crimson)", color: "#fff", fontSize: 9.5, fontWeight: 400, padding: "1px 5px", borderRadius: 99 }}>{badge}</span>
      ) : null}
    </button>
  );

  const sectionLabel = (label: string) => (
    <div style={{ margin: "13px 0 4px", padding: "0 9px", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sw-muted)" }}>{label}</div>
  );

  const listRow = (l: (typeof lists)[number], indent: boolean) => {
    const active = section === "list" && listPage === "list" && activeList?.listId === l.id;
    const pinned = pinnedListIds.includes(l.id);
    const n = openCount(l.id);
    return (
      <div
        key={l.id}
        onMouseEnter={() => setHoverList(l.id)}
        onMouseLeave={() => setHoverList(null)}
        style={{ position: "relative", display: "flex", alignItems: "center" }}
      >
        <button
          onClick={() => setActiveList({ spaceId: l.space_id, listId: l.id })}
          style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, padding: `5px 9px 5px ${indent ? 22 : 9}px`, borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, background: active ? "var(--sw-hover)" : "transparent", color: active ? "var(--crimson)" : "var(--sw-text-soft)", fontWeight: 400, textAlign: "left" }}
        >
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</span>
          {hoverList !== l.id && n > 0 && (
            <span style={{ fontSize: 9.5, color: "var(--sw-muted)", flex: "none" }}>{n}</span>
          )}
        </button>
        {(hoverList === l.id || pinned) && (
          <button
            onClick={(e) => { e.stopPropagation(); togglePin(l.id); }}
            title={pinned ? "Unpin" : "Pin to sidebar"}
            style={{ position: "absolute", right: 6, border: "none", background: "none", cursor: "pointer", color: pinned ? "var(--crimson)" : "var(--sw-muted)", padding: 2, display: "flex" }}
          >
            <IconStar size={11} filled={pinned} />
          </button>
        )}
      </div>
    );
  };

  const deptOf = (spaceDeptId: string | null) => departments.find((d) => d.id === spaceDeptId);
  const pinnedLists = pinnedListIds.map((id) => lists.find((l) => l.id === id)).filter(Boolean) as typeof lists;

  return (
    <>
      {mobileNavOpen && <div className="sw-sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sw-sidebar${mobileNavOpen ? " open" : ""}`} style={{ width: 228, flex: "none", background: "var(--sw-sidebar)", borderRight: "1px solid var(--sw-hair)", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "17px 16px 13px", display: "flex", alignItems: "center", gap: 7, borderBottom: "1px solid var(--sw-hair)" }}>
        <span style={{ fontWeight: 800, letterSpacing: "0.07em", fontSize: 11.5, color: "var(--crimson)" }}>SANSICO</span>
        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12.5, color: "var(--sw-text-soft)" }}>Group</span>
        <span style={{ marginLeft: "auto", fontWeight: 400, fontSize: 11.5, color: "var(--sw-text-soft)" }}>SansiWorks</span>
      </div>

      <nav style={{ flex: 1, overflowY: "auto", padding: "10px 10px 10px", display: "flex", flexDirection: "column", gap: 1 }}>
        <button
          onClick={() => setShowPalette(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", padding: "7px 9px", marginBottom: 8, borderRadius: 8, border: "1px solid var(--sw-hair)", cursor: "pointer", fontSize: 12, background: "var(--sw-hover)", color: "var(--sw-muted)" }}
        >
          <span style={{ flex: 1 }}>Search…</span>
          <span style={{ fontSize: 9.5, border: "1px solid var(--sw-hair)", borderRadius: 5, padding: "1px 5px", color: "var(--sw-muted)" }}>Ctrl K</span>
        </button>

        {navBtn("My Work", section === "home", () => setHomePage(homePage === "myweek" || homePage === "all" || homePage === "personal" ? homePage : "today"))}
        {navBtn("Inbox", section === "workspace" && workspacePage === "inbox", () => setWorkspacePage("inbox"), unread)}

        {sectionLabel("Company")}
        {navBtn("Everything", section === "list" && listPage === "everything", () => setListPage("everything"))}
        {navBtn("Overview", section === "company" && companyPage === "executive", () => setCompanyPage("executive"))}
        {navBtn("People", section === "company" && companyPage === "people", () => setCompanyPage("people"))}

        {sectionLabel("Workspace")}
        {navBtn("SOPs & Docs", section === "workspace" && workspacePage === "docs", () => setWorkspacePage("docs"))}
        {navBtn("Forms", section === "workspace" && workspacePage === "forms", () => setWorkspacePage("forms"))}

        {pinnedLists.length > 0 && (
          <>
            {sectionLabel("Pinned")}
            {pinnedLists.map((l) => listRow(l, false))}
          </>
        )}

        <div style={{ margin: "13px 0 4px", padding: "0 9px", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sw-muted)", flex: 1 }}>Spaces</span>
        </div>
        {visibleSpaces.map((space) => {
          const isCollapsed = !!collapsed[space.id];
          const spaceLists = lists.filter((l) => l.space_id === space.id);
          return (
            <div key={space.id} style={{ marginBottom: 7 }}>
              <button
                onClick={() => toggleSpace(space.id)}
                title={deptOf(space.department_id)?.name || ""}
                style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "4px 9px 3px", border: "none", background: "none", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 99, background: space.color, flex: "none" }} />
                <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--sw-text-soft)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{space.name}</span>
                <span style={{ color: "var(--sw-muted)", display: "flex", transform: isCollapsed ? "rotate(-90deg)" : "none", transition: "transform .12s" }}>
                  <IconChevDown size={10} />
                </span>
              </button>
              {!isCollapsed && spaceLists.map((l) => listRow(l, true))}
            </div>
          );
        })}

        <div style={{ marginTop: "auto", paddingTop: 13 }}>
          {navBtn("Admin console", section === "workspace" && workspacePage === "admin", () => setWorkspacePage("admin"))}
          {navBtn("Settings", section === "workspace" && workspacePage === "settings", () => setWorkspacePage("settings"))}
        </div>
      </nav>

      <div style={{ padding: "11px 14px", borderTop: "1px solid var(--sw-hair)", display: "flex", alignItems: "center", gap: 9 }}>
        <button
          onClick={() => { if (me) { openProfile(me.id); setMobileNavOpen(false); } }}
          title="View profile"
          style={{ width: 26, height: 26, borderRadius: 99, background: me?.color || "var(--crimson)", color: "#fff", fontSize: 10.5, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {me ? initials(me.name) : ""}
        </button>
        <button onClick={() => { if (me) { openProfile(me.id); setMobileNavOpen(false); } }} style={{ flex: 1, minWidth: 0, border: "none", background: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me?.name || ""}</div>
          <div style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>{deptOf(me?.department_id || null)?.name || me?.role_title || ""}</div>
        </button>
      </div>
    </aside>
    </>
  );
}
