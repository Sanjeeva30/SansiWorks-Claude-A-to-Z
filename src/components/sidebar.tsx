"use client";
import React, { useEffect, useState } from "react";
import { unitCode } from "@/lib/colors";
import { moveInOrder } from "@/lib/logic";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { initials } from "@/lib/types";
import { isDeptAdmin, hasExecVisibility } from "@/lib/logic";
import { writeOrRevert } from "@/lib/actions";
import { IconChevDown, IconStar, IconTrash, IconX } from "./icons";
import { Avatar } from "./shared";

const COLLAPSE_KEY = "sw-collapsed-spaces";
const RECENT_KEY = "sw-recent-boards";

export function Sidebar() {
  const { me, spaces, lists, tasks, notifications, departments, pins, features, levels, patch, supabase } = useStore();
  // Spaces under a dormant (overseas) unit stay hidden until the admin turns that toggle on.
  const dormantUnitIds = new Set(departments.filter((d) => d.dormant).map((d) => d.id));
  const visibleSpaces = features.overseas_teams ? spaces : spaces.filter((s) => !s.department_id || !dormantUnitIds.has(s.department_id));
  const {
    section, homePage, setHomePage, listPage, setListPage,
    companyPage, setCompanyPage, workspacePage, setWorkspacePage,
    activeList, setActiveList, openProfile, setShowPalette, pushToast,
    mobileNavOpen, setMobileNavOpen, confirm,
  } = useUI();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hoverList, setHoverList] = useState<string | null>(null);
  const [dragListId, setDragListId] = useState<string | null>(null);
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);
  const [hoverSpace, setHoverSpace] = useState<string | null>(null);
  const [addingBoardFor, setAddingBoardFor] = useState<string | null>(null);
  const [boardName, setBoardName] = useState("");
  /* At 26 departments the sidebar is a scroll, not a menu. Type-to-filter and a
     Recent list turn "hunt for the board" into "type three letters" — recents
     are per-person and local, since they are a navigation convenience and not
     something worth a round trip. */
  const [navFilter, setNavFilter] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [addingSpace, setAddingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");

  useEffect(() => {
    try { setCollapsed(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}")); } catch {}
  }, []);
  const persistCollapsed = (next: Record<string, boolean>) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch {}
  };
  useEffect(() => {
    try { setRecentIds(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")); } catch { /* first run */ }
  }, []);

  // Record the board being viewed, most recent first, capped at 5.
  useEffect(() => {
    if (section !== "list" || !listPage || listPage === "everything") return;
    setRecentIds((prev) => {
      const next = [listPage, ...prev.filter((x) => x !== listPage)].slice(0, 5);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [section, listPage]);

  const toggleSpace = (id: string) => persistCollapsed({ ...collapsed, [id]: !collapsed[id] });

  /* Collapse/expand *all* — the departments themselves always stay listed;
     what folds away is every board under them. "Any open" decides the
     direction so one control does both jobs, the way a file tree behaves. */
  const anyExpanded = visibleSpaces.some((s) => !collapsed[s.id]);
  const toggleAllSpaces = () =>
    persistCollapsed(Object.fromEntries(visibleSpaces.map((s) => [s.id, anyExpanded])));

  const closeAddSpace = () => { setAddingSpace(false); setNewSpaceName(""); };

  const isAdmin = isDeptAdmin(me, levels);
  // "Everything" (every task company-wide) and "Overview" (the executive
  // dashboard) are RLS-safe either way, but showing them to someone whose own
  // visibility is scoped to their department is just clutter — an empty or
  // near-empty company-wide view that means nothing to them. Same pattern as
  // canViewSop: exec_visibility is the real gate, not rank alone.
  const canSeeCompanyWide = hasExecVisibility(me, levels);

  /* "member_can_create_board" used to be a toggle with nothing behind it —
     there was no board-creation UI at all, self-serve or request-based, so
     the admin-side "Approve/Reject board requests" panel could never have
     anything land in it either. Admins always create directly; a plain
     member gets a direct create when the feature is on, or a request that
     shows up in that same admin queue when it's off (the default). */
  const submitBoard = async (space: { id: string; department_id: string | null }) => {
    const name = boardName.trim();
    if (!name || !me) return;
    if (isAdmin || features.member_can_create_board) {
      const { data } = await supabase.from("lists").insert({ space_id: space.id, name, sort: 99 }).select().single();
      if (data) {
        patch("lists", [...lists, data]);
        setActiveList({ spaceId: space.id, listId: data.id });
      }
      pushToast(`"${name}" created`);
    } else {
      // Telling someone their request was sent when the insert failed means
      // they wait on an approval that will never appear in anyone's queue.
      const { error } = await supabase.from("board_requests").insert({ board_name: name, requester_id: me.id, department_id: space.department_id });
      pushToast(error
        ? `Couldn't send the request — ${error.message}`
        : `Request sent — your Department Head will review "${name}"`);
    }
    setAddingBoardFor(null);
    setBoardName("");
  };

  /* Soft-delete, matching the pattern already used for tasks/docs — the row
     stays in the DB (its tasks and history with it), just drops out of the
     live store and the initial fetch filter. Unlike task archiving, a board
     or an entire space is high-stakes enough (and low-volume enough) that
     losing the in-app way back to it isn't acceptable, so both get a real
     Restore path (Admin console -> Departments -> Archived spaces/boards). */
  const archiveList = async (l: { id: string; name: string }) => {
    if (!(await confirm({ title: `Archive "${l.name}"?`, message: "This board and its tasks stay intact — you can restore it from Admin console → Departments → Archived boards.", confirmLabel: "Archive", danger: true }))) return;
    const prev = lists;
    patch("lists", lists.filter((x) => x.id !== l.id));
    await writeOrRevert(supabase.from("lists").update({ archived: true }).eq("id", l.id), {
      toast: pushToast, what: `archive "${l.name}"`, revert: () => patch("lists", prev),
    });
  };
  const archiveSpace = async (space: { id: string; name: string }) => {
    const spaceLists = lists.filter((x) => x.space_id === space.id);
    if (!(await confirm({
      title: `Archive "${space.name}"?`,
      message: spaceLists.length
        ? `This hides all ${spaceLists.length} board${spaceLists.length === 1 ? "" : "s"} inside it too. Nothing is deleted — restore it from Admin console → Departments → Archived spaces.`
        : "You can restore it from Admin console → Departments → Archived spaces.",
      confirmLabel: "Archive", danger: true,
    }))) return;
    const prevSpaces = spaces, prevLists = lists;
    patch("spaces", spaces.filter((x) => x.id !== space.id));
    patch("lists", lists.filter((x) => x.space_id !== space.id));
    await writeOrRevert(supabase.from("spaces").update({ archived: true }).eq("id", space.id), {
      toast: pushToast, what: `archive "${space.name}"`,
      revert: () => { patch("spaces", prevSpaces); patch("lists", prevLists); },
    });
  };
  const createSpace = async () => {
    const name = newSpaceName.trim();
    if (!name || !me) return;
    // Every department already gets one space automatically when created —
    // this is for a second space within your own department (e.g. splitting
    // "Sourcing & Trade" into separate spaces per sub-team).
    const { data, error } = await supabase.from("spaces").insert({ name, color: me.color, department_id: me.department_id, sort: 99 }).select().single();
    if (error || !data) { pushToast(`Couldn't create the space — ${error?.message || "unknown error"}.`); return; }
    patch("spaces", [...spaces, data]);
    setNewSpaceName("");
    setAddingSpace(false);
    pushToast(`"${name}" created`);
  };
  /* Drag-to-reorder boards within a space. `orderedIds` is the space's full new
     order; re-spaced by 10 so a later single-item move never needs to
     renumber its neighbours. Reverts the optimistic patch on any write failure. */
  const reorderPins = async (orderedTargetIds: string[]) => {
    const prev = pins;
    const next = pins.map((p) => {
      const idx = orderedTargetIds.indexOf(p.target_id);
      return p.kind === "list" && idx !== -1 ? { ...p, sort: (idx + 1) * 10 } : p;
    });
    patch("pins", next);
    const results = await Promise.all(
      orderedTargetIds.map((tid, i) =>
        supabase.from("pins").update({ sort: (i + 1) * 10 })
          .eq("target_id", tid).eq("kind", "list").eq("profile_id", me?.id || "")
      )
    );
    if (results.some((r) => r.error)) {
      patch("pins", prev);
      pushToast("Couldn't save that pin order.");
    }
  };

  const reorderLists = async (orderedIds: string[]) => {
    const prev = lists;
    const sortOf = new Map(orderedIds.map((id, i) => [id, (i + 1) * 10]));
    patch("lists", lists.map((l) => (sortOf.has(l.id) ? { ...l, sort: sortOf.get(l.id)! } : l)));
    const results = await Promise.all(orderedIds.map((id) => supabase.from("lists").update({ sort: sortOf.get(id) }).eq("id", id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) { patch("lists", prev); pushToast(`Couldn't save that order — ${failed.error.message}`); }
  };

  const unread = notifications.filter((n) => !n.read).length;
  const openCount = (listId: string) => tasks.filter((t) => t.list_id === listId && t.status !== "Done").length;
  /* Pins carry their own `sort`, which was never read — pinned boards came back
     in whatever order Postgres returned, and the order could not be changed. */
  const pinnedListIds = pins
    .filter((p) => p.kind === "list")
    .sort((a, b) => a.sort - b.sort)
    .map((p) => p.target_id);

  const togglePin = async (listId: string) => {
    const existing = pins.find((p) => p.kind === "list" && p.target_id === listId);
    if (existing) {
      const prev = pins;
      patch("pins", pins.filter((p) => p.id !== existing.id));
      await writeOrRevert(supabase.from("pins").delete().eq("id", existing.id), {
        toast: pushToast, what: "unpin that board", revert: () => patch("pins", prev),
      });
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
      style={{ display: "flex", alignItems: "center", width: "100%", textAlign: "left", padding: "6px 9px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 400, background: active ? "var(--sw-hover)" : "transparent", color: active ? "var(--sw-on-crimson)" : "var(--sw-text-soft)" }}
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

  const listRow = (l: (typeof lists)[number], indent: boolean, reorder?: { draggable: boolean; isOver: boolean; onReorder?: (fromId: string, toId: string) => void }) => {
    const active = section === "list" && listPage === "list" && activeList?.listId === l.id;
    const pinned = pinnedListIds.includes(l.id);
    const n = openCount(l.id);
    return (
      <div
        key={l.id}
        onMouseEnter={() => setHoverList(l.id)}
        onMouseLeave={() => setHoverList(null)}
        draggable={reorder?.draggable}
        onDragStart={reorder?.draggable ? (e) => { e.stopPropagation(); setDragListId(l.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
        onDragOver={reorder?.draggable ? (e) => { e.preventDefault(); e.stopPropagation(); if (dragOverListId !== l.id) setDragOverListId(l.id); } : undefined}
        onDrop={reorder?.draggable ? (e) => {
          e.preventDefault(); e.stopPropagation();
          if (dragListId && dragListId !== l.id && reorder?.onReorder) {
            // Pinned rows reorder the pin list, not the board's place in its space.
            reorder.onReorder(dragListId, l.id);
          } else if (dragListId && dragListId !== l.id) {
            const group = lists.filter((x) => x.space_id === l.space_id).sort((a, b) => a.sort - b.sort);
            reorderLists(moveInOrder(group.map((x) => x.id), dragListId, l.id));
          }
          setDragListId(null); setDragOverListId(null);
        } : undefined}
        onDragEnd={reorder?.draggable ? () => { setDragListId(null); setDragOverListId(null); } : undefined}
        style={{ position: "relative", display: "flex", alignItems: "center", borderTop: reorder?.isOver ? "2px solid var(--crimson)" : "2px solid transparent" }}
      >
        <button
          onClick={() => setActiveList({ spaceId: l.space_id, listId: l.id })}
          style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, padding: `5px 9px 5px ${indent ? 22 : 9}px`, borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, background: active ? "var(--sw-hover)" : "transparent", color: active ? "var(--sw-on-crimson)" : "var(--sw-text-soft)", fontWeight: 400, textAlign: "left" }}
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
            style={{ position: "absolute", right: 6, border: "none", background: "none", cursor: "pointer", color: pinned ? "var(--sw-on-crimson)" : "var(--sw-muted)", padding: 2, display: "flex" }}
          >
            <IconStar size={11} filled={pinned} />
          </button>
        )}
        {isAdmin && hoverList === l.id && (
          <button
            onClick={(e) => { e.stopPropagation(); archiveList(l); }}
            title="Archive board"
            style={{ position: "absolute", right: 24, border: "none", background: "none", cursor: "pointer", color: "var(--sw-muted)", padding: 2, display: "flex" }}
          >
            <IconTrash size={11} />
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
        <span style={{ fontWeight: 800, letterSpacing: "0.07em", fontSize: 11.5, color: "var(--sw-on-crimson)" }}>SANSICO</span>
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
        {canSeeCompanyWide && navBtn("Everything", section === "list" && listPage === "everything", () => setListPage("everything"))}
        {canSeeCompanyWide && navBtn("Overview", section === "company" && companyPage === "executive", () => setCompanyPage("executive"))}
        {navBtn("People", section === "company" && companyPage === "people", () => setCompanyPage("people"))}

        {sectionLabel("Workspace")}
        {navBtn("SOPs & Docs", section === "workspace" && workspacePage === "docs", () => setWorkspacePage("docs"))}
        {navBtn("Forms", section === "workspace" && workspacePage === "forms", () => setWorkspacePage("forms"))}
        {navBtn("Memos", section === "workspace" && workspacePage === "memos", () => setWorkspacePage("memos"))}

        {pinnedLists.length > 0 && (
          <>
            {sectionLabel("Pinned")}
            {pinnedLists.map((l) => listRow(l, false, {
              draggable: true,
              isOver: dragOverListId === l.id && dragListId !== l.id,
              onReorder: (fromId, toId) => reorderPins(moveInOrder(pinnedLists.map((x) => x.id), fromId, toId)),
            }))}
          </>
        )}

        {(() => {
          const recent = recentIds.map((id) => lists.find((l) => l.id === id)).filter(Boolean) as typeof lists;
          const fresh = recent.filter((l) => !pinnedListIds.includes(l.id)).slice(0, 4);
          return fresh.length > 1 && !navFilter ? (
            <>
              {sectionLabel("Recent")}
              {fresh.map((l) => listRow(l, false))}
            </>
          ) : null;
        })()}

        {/* Labelled "Departments" because in practice every one of these IS a
            department — calling the same thing two different names was the
            actual source of confusion. Spaces stay a separate concept
            underneath so cross-department project spaces remain possible. */}
        <div style={{ margin: "13px 0 4px", padding: "0 9px", display: "flex", alignItems: "center", gap: 2 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sw-muted)", flex: 1 }}>Departments</span>
          {visibleSpaces.length > 0 && (
            <button
              onClick={toggleAllSpaces}
              title={anyExpanded ? "Collapse all boards" : "Expand all boards"}
              style={{ border: "none", background: "none", cursor: "pointer", color: "var(--sw-muted)", padding: "0 2px", display: "flex", alignItems: "center", transform: anyExpanded ? "none" : "rotate(-90deg)", transition: "transform .12s" }}
            >
              <IconChevDown size={11} />
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => { setAddingSpace(true); setNewSpaceName(""); }}
              title="New space"
              style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "var(--sw-muted)", padding: "0 2px" }}
            >
              +
            </button>
          )}
        </div>
        {visibleSpaces.length > 3 && (
          <div style={{ padding: "0 9px 6px" }}>
            <input
              value={navFilter}
              onChange={(e) => setNavFilter(e.target.value)}
              placeholder="Filter departments & boards…"
              style={{ width: "100%", height: 26, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11, padding: "0 8px", color: "var(--sw-text)", outline: "none" }}
            />
          </div>
        )}
        {addingSpace && (
          <div style={{ display: "flex", gap: 4, padding: "3px 9px 7px" }}>
            <input
              autoFocus
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createSpace(); if (e.key === "Escape") closeAddSpace(); }}
              onBlur={() => { if (!newSpaceName.trim()) closeAddSpace(); }}
              placeholder="Space name…"
              style={{ flex: 1, minWidth: 0, height: 24, borderRadius: 6, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11, padding: "0 7px", color: "var(--sw-text)", outline: "none" }}
            />
            <button onClick={createSpace} title="Save" style={{ border: "none", background: "var(--crimson)", color: "#fff", borderRadius: 6, width: 22, height: 24, fontSize: 12, cursor: "pointer" }}>✓</button>
            {/* Escape and click-away both cancel too, but neither is discoverable
                — there was previously no visible way out of this field at all. */}
            <button onMouseDown={(e) => { e.preventDefault(); closeAddSpace(); }} title="Cancel" style={{ border: "1px solid var(--sw-hair)", background: "none", color: "var(--sw-muted)", borderRadius: 6, width: 22, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <IconX size={9} />
            </button>
          </div>
        )}
        {visibleSpaces.map((space) => {
          /* While filtering, a department stays only if it or one of its boards
             matches, and it force-expands so the match is actually visible —
             a filter that hides the thing you searched for is worse than none. */
          const q = navFilter.trim().toLowerCase();
          const allLists = lists.filter((l) => l.space_id === space.id).sort((a, b) => a.sort - b.sort);
          const spaceHit = !q || space.name.toLowerCase().includes(q);
          const spaceLists = q && !spaceHit ? allLists.filter((l) => l.name.toLowerCase().includes(q)) : allLists;
          if (q && !spaceHit && !spaceLists.length) return null;
          const isCollapsed = q ? false : !!collapsed[space.id];
          return (
            <div
              key={space.id}
              style={{ marginBottom: 7 }}
              onMouseEnter={() => setHoverSpace(space.id)}
              onMouseLeave={() => setHoverSpace(null)}
            >
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <button
                  onClick={() => toggleSpace(space.id)}
                  title={deptOf(space.department_id)?.name || ""}
                  style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "4px 9px 3px", border: "none", background: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: space.color, flex: "none" }} />
                  <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--sw-text-soft)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{space.name}</span>
                  {/* Hue alone cannot identify 26 departments — the palette runs
                      out and none of it survives colourblindness or greyscale.
                      The code does, and it is what people say out loud anyway. */}
                  <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", color: "var(--sw-muted)", background: "var(--sw-hover)", borderRadius: 4, padding: "1px 4px", flex: "none" }}>{unitCode(space.name)}</span>
                  <span style={{ color: "var(--sw-muted)", display: "flex", transform: isCollapsed ? "rotate(-90deg)" : "none", transition: "transform .12s" }}>
                    <IconChevDown size={10} />
                  </span>
                </button>
                {isAdmin && hoverSpace === space.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); archiveSpace(space); }}
                    title="Archive space"
                    style={{ position: "absolute", right: 20, border: "none", background: "none", cursor: "pointer", color: "var(--sw-muted)", padding: 2, display: "flex" }}
                  >
                    <IconTrash size={11} />
                  </button>
                )}
              </div>
              {!isCollapsed && spaceLists.map((l) => listRow(l, true, { draggable: isAdmin, isOver: dragOverListId === l.id && dragListId !== l.id }))}
              {!isCollapsed && (
                addingBoardFor === space.id ? (
                  <div style={{ display: "flex", gap: 4, padding: "3px 9px 3px 24px" }}>
                    <input
                      autoFocus
                      value={boardName}
                      onChange={(e) => setBoardName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitBoard(space); if (e.key === "Escape") setAddingBoardFor(null); }}
                      placeholder="Board name…"
                      style={{ flex: 1, minWidth: 0, height: 24, borderRadius: 6, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11, padding: "0 7px", color: "var(--sw-text)", outline: "none" }}
                    />
                    <button onClick={() => submitBoard(space)} title="Save" style={{ border: "none", background: "var(--crimson)", color: "#fff", borderRadius: 6, width: 22, height: 24, fontSize: 12, cursor: "pointer" }}>✓</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingBoardFor(space.id); setBoardName(""); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "3px 9px 3px 24px", border: "none", background: "none", cursor: "pointer", fontSize: 11, color: "var(--sw-muted)" }}
                  >
                    + {isAdmin || features.member_can_create_board ? "Board" : "Propose a board"}
                  </button>
                )
              )}
            </div>
          );
        })}

        <div style={{ marginTop: "auto", paddingTop: 13 }}>
          {isAdmin && navBtn("Admin console", section === "workspace" && workspacePage === "admin", () => setWorkspacePage("admin"))}
          {navBtn("Settings", section === "workspace" && workspacePage === "settings", () => setWorkspacePage("settings"))}
        </div>
      </nav>

      <div style={{ padding: "11px 14px", borderTop: "1px solid var(--sw-hair)", display: "flex", alignItems: "center", gap: 9 }}>
        {me && (
          <Avatar
            person={me}
            size={26}
            fontSize={10.5}
            onClick={() => { openProfile(me.id); setMobileNavOpen(false); }}
          />
        )}
        <button onClick={() => { if (me) { openProfile(me.id); setMobileNavOpen(false); } }} style={{ flex: 1, minWidth: 0, border: "none", background: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me?.name || ""}</div>
          <div style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>{deptOf(me?.department_id || null)?.name || me?.role_title || ""}</div>
        </button>
      </div>
    </aside>
    </>
  );
}
