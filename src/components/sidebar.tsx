"use client";
import React from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { initials } from "@/lib/types";

export function Sidebar() {
  const { me, spaces, lists, notifications, departments } = useStore();
  const {
    section, setSection, homePage, setHomePage, listPage, setListPage,
    companyPage, setCompanyPage, workspacePage, setWorkspacePage,
    activeList, setActiveList, openProfile, setShowPalette,
  } = useUI();

  const unread = notifications.filter((n) => !n.read).length;

  const navBtn = (
    label: string,
    active: boolean,
    onClick: () => void,
    badge?: number
  ) => (
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

  const deptOf = (spaceDeptId: string | null) => departments.find((d) => d.id === spaceDeptId);

  return (
    <aside style={{ width: 228, flex: "none", background: "var(--sw-sidebar)", borderRight: "1px solid var(--sw-hair)", display: "flex", flexDirection: "column", height: "100%" }}>
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

        {navBtn("Home", section === "home" && homePage === "today", () => { setSection("home"); setHomePage("today"); })}
        {navBtn("My Week", section === "home" && homePage === "myweek", () => { setSection("home"); setHomePage("myweek"); })}
        {navBtn("Inbox", section === "workspace" && workspacePage === "inbox", () => { setSection("workspace"); setWorkspacePage("inbox"); }, unread)}
        {navBtn("My List", section === "list" && listPage === "mylist", () => { setSection("list"); setListPage("mylist"); })}

        {sectionLabel("Company")}
        {navBtn("Everything", section === "list" && listPage === "everything", () => { setSection("list"); setListPage("everything"); })}
        {navBtn("Overview", section === "company" && companyPage === "executive", () => { setSection("company"); setCompanyPage("executive"); })}
        {navBtn("People", section === "company" && companyPage === "people", () => { setSection("company"); setCompanyPage("people"); })}

        {sectionLabel("Workspace")}
        {navBtn("Docs", section === "workspace" && workspacePage === "docs", () => { setSection("workspace"); setWorkspacePage("docs"); })}
        {navBtn("Forms", section === "workspace" && workspacePage === "forms", () => { setSection("workspace"); setWorkspacePage("forms"); })}

        <div style={{ margin: "13px 0 4px", padding: "0 9px", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sw-muted)", flex: 1 }}>Spaces</span>
        </div>
        {spaces.map((space) => (
          <div key={space.id} style={{ marginBottom: 7 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 9px 3px" }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: space.color, flex: "none" }} />
              <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--sw-text-soft)", flex: 1 }}>{space.name}</span>
            </div>
            {lists.filter((l) => l.space_id === space.id).map((l) => {
              const active = section === "list" && listPage === "list" && activeList?.listId === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => { setSection("list"); setListPage("list"); setActiveList({ spaceId: space.id, listId: l.id }); }}
                  style={{ display: "block", width: "100%", padding: "5px 9px 5px 22px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, background: active ? "var(--sw-hover)" : "transparent", color: active ? "var(--crimson)" : "var(--sw-text-soft)", fontWeight: 400, textAlign: "left" }}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        ))}

        <div style={{ marginTop: "auto", paddingTop: 13 }}>
          {navBtn("Admin console", section === "workspace" && workspacePage === "admin", () => { setSection("workspace"); setWorkspacePage("admin"); })}
          {navBtn("Settings", section === "workspace" && workspacePage === "settings", () => { setSection("workspace"); setWorkspacePage("settings"); })}
        </div>
      </nav>

      <div style={{ padding: "11px 14px", borderTop: "1px solid var(--sw-hair)", display: "flex", alignItems: "center", gap: 9 }}>
        <button
          onClick={() => me && openProfile(me.id)}
          title="View profile"
          style={{ width: 26, height: 26, borderRadius: 99, background: me?.color || "var(--crimson)", color: "#fff", fontSize: 10.5, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {me ? initials(me.name) : ""}
        </button>
        <button onClick={() => me && openProfile(me.id)} style={{ flex: 1, minWidth: 0, border: "none", background: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me?.name || ""}</div>
          <div style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>{deptOf(me?.department_id || null)?.name || me?.role_title || ""}</div>
        </button>
      </div>
    </aside>
  );
}
