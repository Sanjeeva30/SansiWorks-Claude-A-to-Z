"use client";
import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { initials, Doc, PRIORITY_COLORS } from "@/lib/types";
import { relTime, fmtShort, todayIso } from "@/lib/dates";
import { isOpen, isOverdue, onTimeStats, tasksOfPerson, canViewSop, isSeniorRank, isInternalAudit, isInternalAuditManager, isDeptHead, internalAuditDept } from "@/lib/logic";
import { TopIcons } from "./shared";
import { IconX } from "./icons";
import { OrgAdmin } from "./org-admin";

const STATUS_TINT: Record<string, [string, string]> = {
  Active: ["var(--green)", "rgba(13,79,49,0.09)"],
  "Under review": ["#B7791F", "rgba(183,121,31,0.12)"],
  "Revisions requested": ["var(--red)", "rgba(243,38,62,0.09)"],
  Draft: ["var(--sw-muted)", "var(--sw-hover)"],
};

const PREF_CATS: [string, string, string][] = [
  ["assigned", "Task assigned to me", "Time-sensitive — instant recommended"],
  ["approval", "Approval requested from me", "Time-sensitive — instant recommended"],
  ["blocked", "My task blocked or marked Stuck", ""],
  ["mentions", "Comments & mentions", ""],
  ["status", "Status changes on my tasks", ""],
  ["deadline", "Deadline reminders", ""],
  ["announce", "Team announcements", ""],
];
const PREF_CHANNELS: [string, string][] = [
  ["instant", "Instant email"],
  ["digest", "Daily digest"],
  ["inapp", "In-app only"],
  ["off", "Off"],
];
const PERM_DEFS: [string, string][] = [
  ["exec_visibility", "Executive & Reports visibility (company-wide)"],
  ["multi_dept_admin", "Space Admin rights across every department in their group"],
  ["dept_admin", "Space Admin on their own department (create boards, approve requests)"],
  ["reassign_team", "Reassign tasks within their team"],
  ["edit_dept_boards", "Edit boards within their department"],
  ["edit_own_scope", "Edit only tasks assigned to them"],
];
const FEATURE_LABELS: Record<string, string> = {
  ai_assistant: "Sansi AI assistant",
  time_tracking: "Time tracking",
  file_uploads: "File attachments",
  member_can_create_board: "Members can create boards",
  capacity_tracking: "Capacity tracking (per-person workload limits)",
  overseas_teams: "Overseas teams (Minneapolis, Foshan units — hidden until on)",
};
const FEATURE_HELP: Record<string, string> = {
  capacity_tracking: "The workload math is built and correct — this just decides whether people see a capacity number and whether it's used to flag overload. Off by default until you're ready to switch it on.",
  overseas_teams: "Trends & BD, Design & Product Development, and other overseas-reporting units exist in the org tree but stay invisible everywhere until this is on.",
};

const card: React.CSSProperties = { background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "16px 18px" };
const pillBtn = (color: string): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 999, border: `1px solid ${color === "var(--green)" ? "var(--green)" : "var(--sw-hair)"}`, background: "none", color, fontSize: 11.5, fontWeight: 400, cursor: "pointer", whiteSpace: "nowrap", flex: "none" });

export function WorkspaceSection() {
  const store = useStore();
  const {
    me, profiles, tasks, lists, spaces, departments, deptHeads, deptMembers, levels, docs, docVersions, forms, formSubmissions,
    notifications, prefs, approvals, invites, boardRequests, nominations, proposals, audit, features,
    patch, supabase, refresh,
  } = store;
  const { workspacePage, setActiveTaskId, openProfile, pushToast, setShowPortal, setDocDetailId, openDetail, setSection, setWorkspacePage } = useUI();

  const [inboxFilter, setInboxFilter] = useState<"all" | "unread">("all");
  const [inboxDensity, setInboxDensity] = useState<"comfortable" | "compact">("comfortable");
  const [adminTab, setAdminTab] = useState("users");
  const [docFilters, setDocFilters] = useState({ dept: "All", type: "All", status: "All", text: "", overdueOnly: false });
  const [formFilters, setFormFilters] = useState({ dept: "All", status: "All" });
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: "", type: "SOP", category: "", excerpt: "", departmentId: "", reviewDue: "", headReviewerId: "" });
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ title: "", listId: "", ownerId: "", fields: [{ id: 1, label: "What do you need?", type: "Short answer" }] });
  const [copiedFormId, setCopiedFormId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<{ id: string; title: string; listId: string; ownerId: string; fields: { id: number; label: string; type: string }[] } | null>(null);
  const [expandedSubmissionsFor, setExpandedSubmissionsFor] = useState<string | null>(null);
  const [convertingSubmission, setConvertingSubmission] = useState<string | null>(null);
  const [emailPreview, setEmailPreview] = useState<"digest" | "wrap" | "plan" | "instant" | null>(null);
  const [nominateFor, setNominateFor] = useState<string | null>(null);
  const [nominate, setNominate] = useState({ name: "", reason: "" });
  const [deptModal, setDeptModal] = useState<"create" | "propose" | null>(null);
  const [deptForm, setDeptForm] = useState({ name: "", reason: "" });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLevel, setInviteLevel] = useState("l6");

  const today = todayIso();
  const listPath = (listId: string | null) => {
    const l = lists.find((x) => x.id === listId);
    const s = spaces.find((x) => x.id === l?.space_id);
    return l ? `${s?.name || ""} / ${l.name}` : "—";
  };

  const pageTitle =
    workspacePage === "inbox" ? "Inbox" : workspacePage === "docs" ? "SOPs & Docs" : workspacePage === "forms" ? "Forms" :
    workspacePage === "settings" ? "Settings" : "Admin console";

  /* ------- helpers ------- */
  const setPref = async (cat: string, val: string) => {
    if (!me) return;
    patch("prefs", { ...prefs, [cat]: val });
    await supabase.from("notification_prefs").upsert({ profile_id: me.id, category: cat, channel: val });
  };

  const digestTime = me?.digest_time || "08:00";
  const waEnabled = me?.wa_enabled ?? true;
  const waNumber = me?.wa_number || "";

  const updateMe = async (fields: Record<string, unknown>) => {
    if (!me) return;
    patch("profiles", profiles.map((p) => (p.id === me.id ? { ...p, ...fields } : p)));
    patch("me", { ...me, ...fields } as typeof me);
    await supabase.from("profiles").update(fields).eq("id", me.id);
  };

  /* ------- inbox rows ------- */
  const inboxRows = notifications.filter((n) => inboxFilter === "all" || !n.read);
  const unreadCount = notifications.filter((n) => !n.read).length;

  /* ------- docs ------- */
  const docsMapped = docs
    .filter((d) => !d.is_sop || canViewSop(d.department_id, me, departments))
    .map((d) => {
      const owner = profiles.find((p) => p.id === d.owner_id);
      const reviewState = !d.review_date ? "none" : d.review_date < today ? "overdue" : new Date(d.review_date).getTime() - Date.now() < 21 * 86400000 ? "soon" : "ok";
      const review = !d.review_date ? "No review date" : reviewState === "overdue" ? "Review overdue" : `Review ${fmtShort(d.review_date)}`;
      return { ...d, owner, reviewState, review, reviewColor: reviewState === "overdue" ? "var(--red)" : reviewState === "soon" ? "#B7791F" : "var(--sw-muted)" };
    });
  const docDeptOptions = ["All", ...Array.from(new Set(docsMapped.map((d) => d.category).filter(Boolean)))] as string[];
  const docTypeOptions = ["All", ...Array.from(new Set(docsMapped.map((d) => d.type)))];
  const docStatusOptions = ["All", "Active", "Under review", "Revisions requested", "Draft"];
  const filteredDocs = docsMapped
    .filter((d) => docFilters.dept === "All" || d.category === docFilters.dept)
    .filter((d) => docFilters.type === "All" || d.type === docFilters.type)
    .filter((d) => docFilters.status === "All" || d.status === docFilters.status)
    .filter((d) => !docFilters.overdueOnly || d.reviewState === "overdue")
    .filter((d) => !docFilters.text.trim() || `${d.title} ${d.excerpt || ""} ${d.category || ""}`.toLowerCase().includes(docFilters.text.trim().toLowerCase()));
  const clearDocFilters = () => setDocFilters({ dept: "All", type: "All", status: "All", text: "", overdueOnly: false });
  const docStats = [
    { value: docsMapped.length, label: "Documents", color: "var(--sw-text)", onClick: clearDocFilters },
    { value: docsMapped.filter((d) => d.status === "Active").length, label: "Active", color: "var(--green)", onClick: () => setDocFilters({ ...docFilters, status: "Active", overdueOnly: false }) },
    { value: docsMapped.filter((d) => d.status === "Under review" || d.status === "Revisions requested").length, label: "Under review", color: "#B7791F", onClick: () => setDocFilters({ ...docFilters, status: "Under review", overdueOnly: false }) },
    { value: docsMapped.filter((d) => d.status === "Draft").length, label: "Drafts", color: "var(--sw-muted)", onClick: () => setDocFilters({ ...docFilters, status: "Draft", overdueOnly: false }) },
    { value: docsMapped.filter((d) => d.reviewState === "overdue").length, label: "Review overdue", color: "var(--red)", onClick: () => setDocFilters({ ...docFilters, status: "All", overdueOnly: true }) },
  ];

  /* ------- SOP review routing — resolved by role, never hardcoded names ------- */
  const auditDept = internalAuditDept(departments);
  const auditManager = profiles.find((p) => deptHeads.some((h) => h.unit_id === auditDept?.id && h.profile_id === p.id));
  // Head-reviewer candidates for a department: its head(s) first, plus Department-Head-rank-or-above people as fallback choices
  const headReviewerCandidates = (deptId: string) => {
    const headIds = deptHeads.filter((h) => h.unit_id === deptId).map((h) => h.profile_id);
    const heads = profiles.filter((p) => headIds.includes(p.id));
    const seniorSorts = levels.filter((l) => l.sort <= (levels.find((x) => x.id === "l3")?.sort ?? 4)).map((l) => l.id);
    const seniors = profiles.filter((p) => seniorSorts.includes(p.level_id) && !headIds.includes(p.id));
    return [...heads, ...seniors];
  };
  const defaultReviewDue = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); };

  /* ------- forms ------- */
  const formsMapped = forms.map((f) => ({ ...f, department: listPath(f.list_id).split(" / ")[0] || "Unassigned" }));
  const formDeptOptions = ["All", ...Array.from(new Set(formsMapped.map((f) => f.department)))];
  const filteredForms = formsMapped
    .filter((f) => formFilters.dept === "All" || f.department === formFilters.dept)
    .filter((f) => formFilters.status === "All" || (formFilters.status === "Live" ? f.active : !f.active));
  const submissionsFor = (formId: string) => formSubmissions.filter((s) => s.form_id === formId);

  const convertSubmission = async (formId: string, submissionId: string, answers: Record<string, string>) => {
    if (!me) return;
    const f = forms.find((x) => x.id === formId);
    if (!f) return;
    setConvertingSubmission(submissionId);
    const { createTask } = await import("@/lib/actions");
    const summary = Object.entries(answers).map(([q, a]) => `${q}: ${a}`).join("\n");
    const assigneeId = f.default_assignee_id || me.id;
    const created = await createTask(supabase, tasks, patch, {
      name: `${f.title} — submission`,
      list_id: f.list_id,
      owner_id: me.id,
      assignee_id: assigneeId,
      description: summary,
    });
    if (created) {
      patch("formSubmissions", formSubmissions.map((s) => (s.id === submissionId ? { ...s, task_id: created.id } : s)));
      await supabase.from("form_submissions").update({ task_id: created.id }).eq("id", submissionId);
      pushToast("Submission converted to a task");
    }
    setConvertingSubmission(null);
  };

  /* ------- audit package export ------- */
  const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const exportAuditPackage = () => {
    const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.name || "—";
    const lines: string[] = [];
    lines.push("SECTION,DATE,ACTOR,ACTION,TARGET,DETAIL");
    for (const a of audit) {
      lines.push([csvCell("Admin/permission/org"), csvCell(a.created_at), csvCell(nameOf(a.actor_id)), csvCell(a.action), csvCell(a.target), csvCell("")].join(","));
    }
    for (const v of docVersions) {
      const doc = docs.find((d) => d.id === v.doc_id);
      if (!doc?.is_sop) continue;
      if (v.head_status !== "pending") {
        lines.push([csvCell("SOP review — Dept head"), csvCell(v.head_at || v.submitted_at), csvCell(nameOf(v.head_by)), csvCell(v.head_status), csvCell(`${doc.title} v${v.version_number}`), csvCell(v.change_note || "")].join(","));
      }
      if (v.audit_status !== "pending") {
        lines.push([csvCell("SOP review — Internal Audit"), csvCell(v.audit_at || v.submitted_at), csvCell(nameOf(v.audit_by)), csvCell(v.audit_status), csvCell(`${doc.title} v${v.version_number}`), csvCell(v.change_note || "")].join(","));
      }
      if (v.head_status === "pending" && v.audit_status === "pending") {
        lines.push([csvCell("SOP submitted (awaiting review)"), csvCell(v.submitted_at), csvCell(nameOf(v.submitted_by)), csvCell("submitted"), csvCell(`${doc.title} v${v.version_number}`), csvCell(v.change_note || "")].join(","));
      }
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sansiworks-audit-package-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast("Audit package downloaded");
  };

  /* ------- admin data ------- */
  const sansicoUsers = profiles;
  const adminTabDefs: [string, string][] = [
    ["users", "Users"], ["hierarchy", "Hierarchy"], ["departments", "Departments"],
    ["organisation", "Organisation"], ["permissions", "Permissions"],
    ["approvals", `Approvals${approvals.filter((a) => a.status === "pending").length ? ` (${approvals.filter((a) => a.status === "pending").length})` : ""}`],
    ["invites", "Invites"], ["features", "Features"], ["audit", "Audit log"],
  ];
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);

  const isBoardish = me?.is_super || me?.level_id === "l1" || me?.level_id === "l2";

  /* ------- digest preview data (live) ------- */
  const myTasks = me ? tasksOfPerson(tasks, me.id) : [];
  const dueSoon = tasks.filter((t) => isOpen(t) && t.due && t.due <= today).slice(0, 3);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
      <header className="sw-topbar" style={{ height: 52, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 22px", borderBottom: "1px solid var(--sw-hair)", background: "var(--sw-page)" }}>
        <h1 className="sw-topbar-title" style={{ fontSize: 14, fontWeight: 400, margin: 0 }}>{pageTitle}</h1>
        <div style={{ flex: 1 }} />
        {workspacePage === "inbox" && (
          <button
            onClick={async () => {
              patch("notifications", notifications.map((n) => ({ ...n, read: true })));
              if (me) await supabase.from("notifications").update({ read: true }).eq("profile_id", me.id);
            }}
            style={{ padding: "7px 14px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 12, fontWeight: 400, cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}
          >
            Mark all read
          </button>
        )}
        {workspacePage === "docs" && (
          <button onClick={() => setShowNewDoc(true)} style={{ padding: "7px 15px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 12.5, fontWeight: 400, cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>+ New SOP</button>
        )}
        {workspacePage === "forms" && (
          <>
            <button onClick={() => setShowPortal(true)} style={{ padding: "7px 15px", borderRadius: 999, border: "1px solid var(--crimson)", background: "none", color: "var(--crimson)", fontSize: 12, fontWeight: 400, cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>View public portal</button>
            <button onClick={() => { setNewForm((f) => ({ ...f, ownerId: f.ownerId || me?.id || "" })); setShowNewForm(true); }} style={{ padding: "7px 15px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 12.5, fontWeight: 400, cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>+ New form</button>
          </>
        )}
        <TopIcons />
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "20px 26px 40px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          {/* ============ INBOX ============ */}
          {workspacePage === "inbox" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                {(["all", "unread"] as const).map((f) => (
                  <button key={f} onClick={() => setInboxFilter(f)} style={{ padding: "6px 13px", borderRadius: 999, border: `1px solid ${inboxFilter === f ? "var(--crimson)" : "var(--sw-hair)"}`, background: inboxFilter === f ? "var(--crimson)" : "var(--sw-hover)", color: inboxFilter === f ? "#fff" : "var(--sw-text-soft)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>
                    {f === "all" ? "All" : "Unread"}
                  </button>
                ))}
                <span style={{ fontSize: 12, color: "var(--sw-muted)", fontWeight: 400 }}>{unreadCount} unread</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => setInboxDensity(inboxDensity === "compact" ? "comfortable" : "compact")} style={{ padding: "5px 13px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 11, fontWeight: 400, cursor: "pointer" }}>
                  {inboxDensity === "compact" ? "Comfortable" : "Compact"}
                </button>
              </div>
              <div style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
                {inboxRows.map((n) => (
                  <button
                    key={n.id}
                    onClick={async () => {
                      if (!n.read) {
                        patch("notifications", notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                        await supabase.from("notifications").update({ read: true }).eq("id", n.id);
                      }
                      if (n.task_id) setActiveTaskId(n.task_id);
                    }}
                    className="sw-row"
                    style={{ display: "flex", alignItems: "flex-start", gap: 11, width: "100%", textAlign: "left", padding: inboxDensity === "compact" ? "9px 18px" : "13px 18px", border: "none", borderBottom: "1px solid var(--sw-hair)", background: n.read ? "none" : "rgba(122,13,32,0.025)", cursor: "pointer" }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: n.read ? "var(--sw-hair)" : "var(--crimson)", marginTop: 5, flex: "none" }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: n.read ? 400 : 700, lineHeight: 1.4 }}>{n.body}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 400, color: "var(--crimson)", border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "1px 8px", borderRadius: 999 }}>{n.reason}</span>
                        <span style={{ fontSize: 11, color: "var(--sw-muted)" }}>{relTime(n.created_at)}</span>
                      </div>
                    </span>
                    {n.task_id && <span style={{ fontSize: 11.5, color: "var(--crimson)", fontWeight: 400, flex: "none" }}>Open task →</span>}
                  </button>
                ))}
                {!inboxRows.length && (
                  <div style={{ padding: "48px 0", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 19, color: "var(--sw-text-soft)", marginBottom: 5 }}>All caught up.</div>
                    <div style={{ color: "var(--sw-muted)", fontSize: 12 }}>New assignments, mentions and approvals will land here.</div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ============ DOCS ============ */}
          {workspacePage === "docs" && (
            <>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 24, margin: "0 0 3px", fontStyle: "italic" }}>SOPs & Docs</h2>
              <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--sw-text-soft)" }}>Company SOPs go through department-head and Internal Audit review before they're official. Plain docs (handovers, briefs, notes) don&apos;t.</p>
              <div className="sw-grid-5" style={{ gap: 12, marginBottom: 16 }}>
                {docStats.map((s) => (
                  <button key={s.label} onClick={s.onClick} style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, padding: "12px 14px", boxShadow: "var(--shadow-card)", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10.5, color: "var(--sw-text-soft)", marginTop: 5, fontWeight: 400 }}>{s.label}</div>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <input value={docFilters.text} onChange={(e) => setDocFilters({ ...docFilters, text: e.target.value })} placeholder="Search docs, SOPs, categories…" style={{ flex: 1, maxWidth: 280, height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 12, color: "var(--sw-text)", outline: "none" }} />
                {[
                  { val: docFilters.dept, opts: docDeptOptions, set: (v: string) => setDocFilters({ ...docFilters, dept: v }) },
                  { val: docFilters.type, opts: docTypeOptions, set: (v: string) => setDocFilters({ ...docFilters, type: v }) },
                  { val: docFilters.status, opts: docStatusOptions, set: (v: string) => setDocFilters({ ...docFilters, status: v }) },
                ].map((f, i) => (
                  <select key={i} className="sw-select" value={f.val} onChange={(e) => f.set(e.target.value)} style={{ height: 32, borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 11.5, fontWeight: 400, padding: "0 12px" }}>
                    {f.opts.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ))}
              </div>
              <div className="sw-grid-3" style={{ gap: 14 }}>
                {filteredDocs.map((d) => {
                  const [sc, st] = STATUS_TINT[d.status] || STATUS_TINT.Draft;
                  return (
                    <div key={d.id} style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                      <button onClick={() => setDocDetailId(d.id)} style={{ padding: "14px 16px", flex: 1, textAlign: "left", border: "none", background: "none", cursor: "pointer", display: "block", width: "100%" }}>
                        <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", color: sc, background: st, padding: "2px 9px", borderRadius: 999, marginBottom: 9 }}>{d.status}</span>
                        <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 400, lineHeight: 1.35, color: "var(--sw-text)" }}>{d.title}</h3>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--sw-text-soft)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{d.excerpt}</p>
                        <div style={{ display: "flex", gap: 10, marginTop: 10, fontSize: 10.5, color: "var(--sw-muted)", fontWeight: 400 }}>
                          {d.is_sop && <span style={{ color: "var(--crimson)", fontWeight: 800 }}>SOP</span>}
                          <span>{d.type}</span><span>{d.category}</span><span>v{d.version}</span>
                        </div>
                      </button>
                      <button onClick={() => d.owner && openProfile(d.owner.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderTop: "1px solid var(--sw-hair)", borderLeft: "none", borderRight: "none", borderBottom: "none", background: "none", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ width: 20, height: 20, borderRadius: 99, background: d.owner?.color || "#9A918A", color: "#fff", fontSize: 8, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{d.owner ? initials(d.owner.name) : "?"}</span>
                        <span style={{ flex: 1, fontSize: 11, fontWeight: 400, color: "var(--sw-text-soft)" }}>{d.owner?.name || "—"}</span>
                        <span style={{ fontSize: 10.5, color: d.reviewColor, fontWeight: 400 }}>{d.review}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
              {!filteredDocs.length && (
                <div style={{ textAlign: "center", padding: "44px 0 34px" }}>
                  <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 19, color: "var(--sw-text-soft)", marginBottom: 6 }}>Nothing here yet.</div>
                  <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--sw-muted)" }}>No documents match these filters.</p>
                  <button onClick={() => setShowNewDoc(true)} style={{ padding: "8px 18px", borderRadius: 999, border: "1px solid var(--crimson)", background: "none", color: "var(--crimson)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>+ New SOP</button>
                </div>
              )}
            </>
          )}

          {/* ============ FORMS ============ */}
          {workspacePage === "forms" && (
            <>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 24, margin: "0 0 3px", fontStyle: "italic" }}>Forms</h2>
              <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--sw-text-soft)" }}>Share a link — every submission becomes a task in the list you choose.</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <select className="sw-select" value={formFilters.dept} onChange={(e) => setFormFilters({ ...formFilters, dept: e.target.value })} style={{ height: 32, borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 11.5, fontWeight: 400, padding: "0 12px" }}>
                  {formDeptOptions.map((o) => <option key={o}>{o}</option>)}
                </select>
                <select className="sw-select" value={formFilters.status} onChange={(e) => setFormFilters({ ...formFilters, status: e.target.value })} style={{ height: 32, borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 11.5, fontWeight: 400, padding: "0 12px" }}>
                  <option value="All">All</option><option value="Live">Live</option><option value="Paused">Paused</option>
                </select>
              </div>
              {filteredForms.map((f) => {
                const subs = submissionsFor(f.id);
                const pendingSubs = subs.filter((s) => !s.task_id);
                const owner = profiles.find((p) => p.id === f.default_assignee_id);
                const showSubs = expandedSubmissionsFor === f.id;
                return (
                <div key={f.id} style={{ ...card, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                    <button onClick={() => openDetail("form", f.id)} style={{ margin: 0, fontSize: 14, fontWeight: 400, flex: 1, textAlign: "left", border: "none", background: "none", color: "var(--sw-text)", cursor: "pointer", padding: 0 }}>{f.title}</button>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 400, color: f.active ? "var(--green)" : "var(--sw-muted)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: f.active ? "var(--green)" : "var(--sw-muted)" }} />{f.active ? "Live" : "Paused"}
                    </span>
                  </div>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--sw-text-soft)" }}>Submissions → {listPath(f.list_id)} · {f.fields.length} questions</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 11.5, color: owner ? "var(--sw-muted)" : "var(--red)" }}>
                      {owner ? `Notifies & assigns to ${owner.name}` : "No owner set — submissions won't notify anyone"}
                    </span>
                    <select
                      className="sw-select"
                      value={f.default_assignee_id || ""}
                      onChange={async (e) => {
                        const ownerId = e.target.value || null;
                        patch("forms", forms.map((x) => (x.id === f.id ? { ...x, default_assignee_id: ownerId } : x)));
                        await supabase.from("forms").update({ default_assignee_id: ownerId }).eq("id", f.id);
                      }}
                      style={{ height: 22, borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 10.5, padding: "0 6px" }}
                    >
                      <option value="">Set owner…</option>
                      {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: subs.length && showSubs ? 12 : 0, flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        try { navigator.clipboard.writeText(`${window.location.origin}/portal?form=${f.id}`); } catch {}
                        setCopiedFormId(f.id);
                        setTimeout(() => setCopiedFormId(null), 1600);
                      }}
                      style={pillBtn("var(--sw-text-soft)")}
                    >
                      {copiedFormId === f.id ? "✓ Copied" : "Copy link"}
                    </button>
                    <button
                      onClick={() => {
                        if (f.active) { pushToast("Pause the form to edit its questions"); return; }
                        setEditingForm({ id: f.id, title: f.title, listId: f.list_id || "", ownerId: f.default_assignee_id || "", fields: f.fields });
                      }}
                      style={pillBtn(f.active ? "var(--sw-muted)" : "var(--sw-text-soft)")}
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        patch("forms", forms.map((x) => (x.id === f.id ? { ...x, active: !f.active } : x)));
                        await supabase.from("forms").update({ active: !f.active }).eq("id", f.id);
                      }}
                      style={pillBtn("var(--sw-text-soft)")}
                    >
                      {f.active ? "Pause" : "Activate"}
                    </button>
                    <button onClick={() => setExpandedSubmissionsFor(showSubs ? null : f.id)} style={pillBtn(pendingSubs.length ? "var(--crimson)" : "var(--sw-text-soft)")}>
                      {showSubs ? "Hide" : "Show"} submissions ({subs.length}{pendingSubs.length ? ` · ${pendingSubs.length} pending` : ""})
                    </button>
                  </div>
                  {showSubs && (
                    <div style={{ borderTop: "1px solid var(--sw-hair)", paddingTop: 10 }}>
                      {!subs.length && <p style={{ margin: 0, fontSize: 11.5, color: "var(--sw-muted)" }}>No submissions yet.</p>}
                      {subs.map((s) => (
                        <div key={s.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ flex: 1, fontSize: 11, color: "var(--sw-muted)" }}>{relTime(s.submitted_at)}</span>
                            {s.task_id ? (
                              <button onClick={() => setActiveTaskId(s.task_id)} style={pillBtn("var(--green)")}>View task</button>
                            ) : (
                              <button disabled={convertingSubmission === s.id} onClick={() => convertSubmission(f.id, s.id, s.answers)} style={pillBtn("var(--crimson)")}>
                                {convertingSubmission === s.id ? "Converting…" : "Convert to task"}
                              </button>
                            )}
                          </div>
                          {Object.entries(s.answers).map(([q, a]) => {
                            const val = String(a);
                            if (val.startsWith("FILE:")) {
                              const [, path, ...nameParts] = val.split(":");
                              const fileName = nameParts.join(":");
                              return (
                                <p key={q} style={{ margin: "0 0 2px", fontSize: 12, color: "var(--sw-text-soft)" }}>
                                  <b style={{ fontWeight: 500, color: "var(--sw-text)" }}>{q}:</b>{" "}
                                  <button
                                    onClick={async () => {
                                      const { data } = await supabase.storage.from("task-attachments").createSignedUrl(path, 60);
                                      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                                    }}
                                    style={{ border: "none", background: "none", color: "var(--crimson)", cursor: "pointer", padding: 0, fontSize: 12 }}
                                  >
                                    Download {fileName}
                                  </button>
                                </p>
                              );
                            }
                            return <p key={q} style={{ margin: "0 0 2px", fontSize: 12, color: "var(--sw-text-soft)" }}><b style={{ fontWeight: 500, color: "var(--sw-text)" }}>{q}:</b> {val}</p>;
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
              {!filteredForms.length && (
                <div style={{ textAlign: "center", padding: "44px 0 34px" }}>
                  <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 19, color: "var(--sw-text-soft)", marginBottom: 6 }}>Nothing here yet.</div>
                  <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--sw-muted)" }}>No forms match these filters.</p>
                  <button onClick={() => { setNewForm((f) => ({ ...f, ownerId: f.ownerId || me?.id || "" })); setShowNewForm(true); }} style={{ padding: "8px 18px", borderRadius: 999, border: "1px solid var(--crimson)", background: "none", color: "var(--crimson)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>+ New form</button>
                </div>
              )}
            </>
          )}

          {/* ============ SETTINGS ============ */}
          {workspacePage === "settings" && (
            <>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 24, margin: "0 0 3px", fontStyle: "italic" }}>Notification settings</h2>
              <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--sw-text-soft)" }}>Choose how each kind of update reaches you. Time-sensitive alerts arrive instantly; everything else waits for your daily digest.</p>

              <section className="sw-table-scroll" style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden", marginBottom: 14 }}>
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 108px)", gap: 0, padding: "11px 18px", borderBottom: "1px solid var(--sw-hair)", background: "var(--sw-hover)" }}>
                    <span style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-muted)" }}>Notification type</span>
                    {PREF_CHANNELS.map(([, l]) => (
                      <span key={l} style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-muted)", textAlign: "center" }}>{l}</span>
                    ))}
                  </div>
                  {PREF_CATS.map(([key, label, hint]) => (
                    <div key={key} style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 108px)", alignItems: "center", padding: "11px 18px", borderBottom: "1px solid var(--sw-hair)" }}>
                      <span>
                        <div style={{ fontSize: 12.5, color: "var(--sw-text)" }}>{label}</div>
                        {hint && <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginTop: 1 }}>{hint}</div>}
                      </span>
                      {PREF_CHANNELS.map(([val]) => {
                        const selected = prefs[key] === val;
                        return (
                          <button key={val} onClick={() => setPref(key, val)} style={{ border: "none", background: "none", cursor: "pointer", display: "flex", justifyContent: "center", padding: "4px 0" }}>
                            <span style={{ width: 15, height: 15, borderRadius: 99, border: `1.5px solid ${selected ? "var(--crimson)" : "var(--sw-hair)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ width: 7, height: 7, borderRadius: 99, background: selected ? "var(--crimson)" : "transparent" }} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>

              <div className="sw-grid-2" style={{ gap: 14 }}>
                <section style={{ ...card, padding: "18px 20px" }}>
                  <h3 style={{ margin: "0 0 4px", fontSize: 13.5, fontWeight: 400 }}>Daily digest</h3>
                  <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--sw-muted)" }}>One email each morning: what&apos;s due, what&apos;s new, and how your team is trending.</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 12, color: "var(--sw-text-soft)" }}>Send at</span>
                    <select className="sw-select" value={digestTime} onChange={(e) => updateMe({ digest_time: e.target.value })} style={{ height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12, color: "var(--sw-text)" }}>
                      <option value="07:00">07:00</option><option value="08:00">08:00</option><option value="09:00">09:00</option>
                    </select>
                    <span style={{ fontSize: 11, color: "var(--sw-muted)" }}>WIB, weekdays only</span>
                  </div>
                  <button onClick={() => setEmailPreview("digest")} style={{ padding: "8px 18px", borderRadius: 999, border: "1px solid var(--crimson)", background: "none", color: "var(--crimson)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>Preview digest email</button>
                </section>

                <section style={{ ...card, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 400, flex: 1 }}>WhatsApp alerts</h3>
                    <button onClick={() => updateMe({ wa_enabled: !waEnabled })} style={{ position: "relative", width: 36, height: 20, borderRadius: 999, border: "none", background: waEnabled ? "var(--green)" : "var(--sw-hair)", cursor: "pointer", padding: 0 }}>
                      <span style={{ position: "absolute", top: 2, left: waEnabled ? 18 : 2, width: 16, height: 16, borderRadius: 99, background: "#fff", transition: "left .15s" }} />
                    </button>
                  </div>
                  <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--sw-muted)" }}>Urgent alerts only — task assigned, approval needed, task blocked. Uses free wa.me links; no WhatsApp gateway fees.</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input value={waNumber} onChange={(e) => updateMe({ wa_number: e.target.value })} style={{ flex: 1, height: 34, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 12.5, color: "var(--sw-text)", outline: "none" }} />
                    <button
                      onClick={() => {
                        const n = waNumber.replace(/[^0-9]/g, "");
                        window.open("https://wa.me/" + n + "?text=" + encodeURIComponent("SansiWorks: 3 tasks due today, 1 approval waiting. Open Home to review."), "_blank");
                      }}
                      style={{ padding: "8px 15px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 12, fontWeight: 400, cursor: "pointer", flex: "none" }}
                    >
                      Send test
                    </button>
                  </div>
                </section>
              </div>

              <section style={{ background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden", marginTop: 14 }}>
                <div style={{ padding: "14px 20px 4px" }}>
                  <h3 style={{ margin: "0 0 2px", fontSize: 13.5, fontWeight: 400 }}>All emails this app sends</h3>
                  <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "var(--sw-muted)" }}>Four, and only four. Everything else stays in the app.</p>
                </div>
                {([
                  ["Daily digest", `Daily · ${digestTime} WIB`, "Due today, newly assigned, approvals, department pulse.", "digest"],
                  ["Monday plan", "Mondays · 08:00 WIB", "Your top 3 for the day with reasons, plus the week ahead.", "plan"],
                  ["Friday wrap", "Fridays · 15:00 WIB", "What you closed, what slipped, one-click reschedule.", "wrap"],
                  ["Instant alerts", "As it happens", "Assignment, approval request, task blocked — nothing else.", "instant"],
                ] as const).map(([name, when, desc, kind]) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderTop: "1px solid var(--sw-hair)" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                        <span style={{ fontSize: 12.5, color: "var(--sw-text)" }}>{name}</span>
                        <span style={{ fontSize: 10, color: "var(--crimson)" }}>{when}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--sw-muted)", marginTop: 1 }}>{desc}</div>
                    </span>
                    <button onClick={() => setEmailPreview(kind)} style={{ flex: "none", padding: "5px 14px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 11, fontWeight: 400, cursor: "pointer" }}>Preview</button>
                  </div>
                ))}
              </section>
            </>
          )}

          {/* ============ ADMIN ============ */}
          {workspacePage === "admin" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--sw-hair)" }}>
                {adminTabDefs.map(([key, label]) => (
                  <button key={key} onClick={() => setAdminTab(key)} style={{ padding: "9px 13px", border: "none", background: "none", borderBottom: `2px solid ${adminTab === key ? "var(--crimson)" : "transparent"}`, color: adminTab === key ? "var(--crimson)" : "var(--sw-text-soft)", fontSize: 12.5, fontWeight: 400, cursor: "pointer", marginBottom: -1 }}>
                    {label}
                  </button>
                ))}
              </div>

              {adminTab === "users" && (
                <section style={card}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 400 }}>Active users</h3>
                  {sansicoUsers.map((u) => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderBottom: "1px solid var(--sw-hair)", flexWrap: "wrap" }}>
                      <button onClick={() => openProfile(u.id)} title="View profile" style={{ width: 28, height: 28, borderRadius: 99, background: u.color, color: "#fff", fontSize: 10.5, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", border: "none", cursor: "pointer", padding: 0 }}>{initials(u.name)}</button>
                      <button onClick={() => openProfile(u.id)} style={{ flex: "1 1 160px", minWidth: 0, textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 400, display: "flex", alignItems: "center", gap: 6, color: "var(--sw-text)" }}>
                          {u.name}
                          {u.is_super && <span style={{ fontSize: 9.5, fontWeight: 400, color: "var(--crimson)", background: "rgba(122,13,32,0.08)", padding: "1px 7px", borderRadius: 999 }}>Super admin</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--sw-muted)" }}>{u.email}</div>
                      </button>
                      <button
                        onClick={async () => {
                          patch("profiles", profiles.map((p) => (p.id === u.id ? { ...p, is_super: !u.is_super } : p)));
                          await supabase.from("profiles").update({ is_super: !u.is_super }).eq("id", u.id);
                          if (me) { const { logAudit } = await import("@/lib/actions"); await logAudit(supabase, me.id, u.is_super ? "revoked super admin from" : "granted super admin to", u.name); }
                        }}
                        style={pillBtn("var(--sw-text-soft)")}
                      >
                        {u.is_super ? "Make member" : "Make super admin"}
                      </button>
                      <button onClick={() => pushToast(`${u.name.split(" ")[0]} suspended (demo)`)} style={pillBtn("var(--red)")}>Suspend</button>
                    </div>
                  ))}
                </section>
              )}

              {adminTab === "hierarchy" && (
                <>
                  <section style={{ ...card, marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 400, flex: 1 }}>Organization levels</h3>
                      <button onClick={() => pushToast("Custom levels arrive with the next update")} style={{ padding: "6px 13px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}>+ Add level</button>
                    </div>
                    <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--sw-muted)" }}>Levels seed a default permission template — they don&apos;t lock anyone in. Reorder, rename, or edit rights per level; assign people to a level below.</p>
                    {levels.map((lv) => {
                      const expanded = expandedLevel === lv.id;
                      const userCount = profiles.filter((p) => p.level_id === lv.id).length;
                      return (
                        <div key={lv.id} style={{ border: "1px solid var(--sw-hair)", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--sw-hover)" }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 400, color: "var(--sw-text)" }}>{lv.name}</span>
                            <span style={{ fontSize: 11, color: "var(--sw-muted)", fontWeight: 400 }}>{userCount} people</span>
                            <button onClick={() => setExpandedLevel(expanded ? null : lv.id)} style={{ border: "none", background: "none", color: "var(--sw-text-soft)", fontSize: 11, fontWeight: 400, cursor: "pointer" }}>{expanded ? "Hide rights" : "Edit rights"}</button>
                          </div>
                          {expanded && (
                            <div style={{ padding: "12px 14px", display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
                              {PERM_DEFS.map(([key, label]) => {
                                const on = Boolean((lv as unknown as Record<string, boolean>)[key]);
                                return (
                                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 400, color: "var(--sw-text)", cursor: "pointer", minWidth: 220 }}>
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={async () => {
                                        patch("levels", levels.map((x) => (x.id === lv.id ? { ...x, [key]: !on } : x)));
                                        await supabase.from("levels").update({ [key]: !on }).eq("id", lv.id);
                                        if (me) { const { logAudit } = await import("@/lib/actions"); await logAudit(supabase, me.id, `${!on ? "granted" : "revoked"} "${label}" for level`, lv.name); }
                                      }}
                                      style={{ width: 15, height: 15 }}
                                    />
                                    {label}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </section>

                  <section style={card}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 400 }}>Assign people to levels</h3>
                    <div className="sw-topbar-label" style={{ display: "flex", alignItems: "center", gap: 11, padding: "0 0 7px" }}>
                      <span style={{ flex: 1 }} />
                      <span style={{ width: 150, fontSize: 10.5, fontWeight: 400, color: "var(--sw-muted)", letterSpacing: "0.05em", textTransform: "uppercase", paddingLeft: 11 }}>Level</span>
                      <span style={{ width: 150, fontSize: 10.5, fontWeight: 400, color: "var(--sw-muted)", letterSpacing: "0.05em", textTransform: "uppercase", paddingLeft: 11 }}>Reports to</span>
                    </div>
                    {sansicoUsers.map((u) => (
                      <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderBottom: "1px solid var(--sw-hair)", flexWrap: "wrap" }}>
                        <span style={{ width: 26, height: 26, borderRadius: 99, background: u.color, color: "#fff", fontSize: 10, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{initials(u.name)}</span>
                        <span style={{ flex: "1 1 100px", minWidth: 0, fontSize: 12.5, fontWeight: 400 }}>{u.name}</span>
                        <select
                          className="sw-select"
                          value={u.level_id}
                          onChange={async (e) => {
                            const prevLevel = levels.find((l) => l.id === u.level_id)?.name || u.level_id;
                            const newLevel = levels.find((l) => l.id === e.target.value)?.name || e.target.value;
                            patch("profiles", profiles.map((p) => (p.id === u.id ? { ...p, level_id: e.target.value } : p)));
                            await supabase.from("profiles").update({ level_id: e.target.value }).eq("id", u.id);
                            if (me) { const { logAudit } = await import("@/lib/actions"); await logAudit(supabase, me.id, `changed level from ${prevLevel} to ${newLevel} for`, u.name); }
                          }}
                          style={{ height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12, color: "var(--sw-text)", width: 150 }}
                        >
                          {levels.map((lo) => <option key={lo.id} value={lo.id}>{lo.name}</option>)}
                        </select>
                        <select
                          className="sw-select"
                          value={u.manager_id || ""}
                          onChange={async (e) => {
                            const v = e.target.value || null;
                            patch("profiles", profiles.map((p) => (p.id === u.id ? { ...p, manager_id: v } : p)));
                            await supabase.from("profiles").update({ manager_id: v }).eq("id", u.id);
                          }}
                          style={{ height: 32, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12, color: "var(--sw-text)", width: 150 }}
                        >
                          <option value="">No manager</option>
                          {sansicoUsers.filter((m) => m.id !== u.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                    ))}
                  </section>
                </>
              )}

              {adminTab === "departments" && (
                <>
                  <section style={{ ...card, marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 400, flex: 1 }}>Departments</h3>
                      <button onClick={() => { setDeptModal("propose"); setDeptForm({ name: "", reason: "" }); }} style={{ padding: "6px 13px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 11.5, fontWeight: 400, cursor: "pointer", marginRight: 8 }}>Propose a department</button>
                      {isBoardish && <button onClick={() => { setDeptModal("create"); setDeptForm({ name: "", reason: "" }); }} style={{ padding: "6px 14px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}>+ Create department</button>}
                    </div>
                    <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--sw-muted)" }}>Board / Group Heads assign department heads. A department head manages their own members and can nominate an additional space admin, subject to Board approval.</p>
                    {departments.map((d) => {
                      const heads = deptHeads.filter((h) => h.unit_id === d.id).map((h) => profiles.find((p) => p.id === h.profile_id)).filter(Boolean);
                      const members = deptMembers.filter((m) => m.department_id === d.id).map((m) => profiles.find((p) => p.id === m.profile_id)).filter(Boolean);
                      return (
                        <div key={d.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 99, background: d.color, flex: "none" }} />
                            <button onClick={() => openDetail("department", d.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 12.5, fontWeight: 400, border: "none", background: "none", color: "var(--sw-text)", cursor: "pointer", padding: 0 }}>{d.name}</button>
                            <span style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-text-soft)", background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "4px 11px", marginRight: 6 }}>{d.mode}</span>
                            <button onClick={() => pushToast("Archiving departments needs Board sign-off (demo)")} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", color: "var(--sw-muted)", fontSize: 11, fontWeight: 400, cursor: "pointer" }}>Archive</button>
                          </div>
                          <div className="sw-grid-2" style={{ gap: 16, paddingLeft: 18 }}>
                            <div>
                              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 6 }}>Department heads</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                                {heads.map((h) => (
                                  <span key={h!.id} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(122,13,32,0.06)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "3px 6px 3px 10px", fontSize: 11.5, fontWeight: 400, color: "var(--sw-text)" }}>
                                    {h!.name}
                                    {isBoardish && (
                                      <button
                                        onClick={async () => {
                                          patch("deptHeads", deptHeads.filter((x) => !(x.unit_id === d.id && x.profile_id === h!.id)));
                                          await supabase.from("org_unit_heads").delete().eq("unit_id", d.id).eq("profile_id", h!.id);
                                        }}
                                        style={{ border: "none", background: "none", color: "var(--sw-muted)", cursor: "pointer", fontSize: 12, padding: "0 2px" }}
                                      >
                                        <IconX size={10} />
                                      </button>
                                    )}
                                  </span>
                                ))}
                              </div>
                              {isBoardish && (
                                <select
                                  className="sw-select"
                                  value=""
                                  onChange={async (e) => {
                                    const pid = e.target.value;
                                    if (!pid) return;
                                    patch("deptHeads", [...deptHeads, { unit_id: d.id, profile_id: pid }]);
                                    await supabase.from("org_unit_heads").insert({ unit_id: d.id, profile_id: pid });
                                  }}
                                  style={{ height: 28, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11, color: "var(--sw-text-soft)", padding: "0 6px" }}
                                >
                                  <option value="">+ Add head…</option>
                                  {members.filter((m) => !heads.some((h) => h!.id === m!.id)).map((m) => <option key={m!.id} value={m!.id}>{m!.name}</option>)}
                                </select>
                              )}
                            </div>
                            <div>
                              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 6 }}>Members</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                                {members.map((m) => (
                                  <span key={m!.id} style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "3px 6px 3px 10px", fontSize: 11.5, fontWeight: 400, color: "var(--sw-text)" }}>
                                    {m!.name}
                                    <button
                                      onClick={async () => {
                                        patch("deptMembers", deptMembers.filter((x) => !(x.department_id === d.id && x.profile_id === m!.id)));
                                        await supabase.from("org_unit_members").delete().eq("department_id", d.id).eq("profile_id", m!.id);
                                      }}
                                      style={{ border: "none", background: "none", color: "var(--sw-muted)", cursor: "pointer", fontSize: 12, padding: "0 2px" }}
                                    >
                                      <IconX size={10} />
                                    </button>
                                  </span>
                                ))}
                              </div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <select
                                  className="sw-select"
                                  value=""
                                  onChange={async (e) => {
                                    const pid = e.target.value;
                                    if (!pid) return;
                                    patch("deptMembers", [...deptMembers, { department_id: d.id, profile_id: pid }]);
                                    await supabase.from("org_unit_members").insert({ department_id: d.id, profile_id: pid });
                                  }}
                                  style={{ height: 28, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11, color: "var(--sw-text-soft)", padding: "0 6px" }}
                                >
                                  <option value="">+ Add member…</option>
                                  {profiles.filter((p) => !members.some((m) => m!.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <button onClick={() => { setNominateFor(d.id); setNominate({ name: "", reason: "" }); }} style={{ padding: "5px 11px", borderRadius: 999, border: "1px solid var(--crimson)", background: "none", color: "var(--crimson)", fontSize: 11, fontWeight: 400, cursor: "pointer" }}>Nominate space admin…</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </section>

                  <section style={card}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 400, flex: 1 }}>Proposed departments</h3>
                      <span style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-muted)" }}>Visibility only — never auto-creates anything</span>
                    </div>
                    {proposals.map((p) => {
                      const proposer = profiles.find((x) => x.id === p.proposer_id);
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 400 }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: "var(--sw-muted)", marginTop: 1 }}>Proposed by {proposer?.name || "—"} · &quot;{p.reason}&quot;</div>
                          </span>
                          <button
                            onClick={async () => {
                              patch("proposals", proposals.filter((x) => x.id !== p.id));
                              await supabase.from("dept_proposals").update({ status: "dismissed" }).eq("id", p.id);
                            }}
                            style={pillBtn("var(--sw-text-soft)")}
                          >
                            Dismiss
                          </button>
                          <button
                            onClick={async () => {
                              await supabase.from("org_units").insert({ name: p.name, color: "#22409E", mode: "Workspace visible" });
                              await supabase.from("dept_proposals").update({ status: "accepted" }).eq("id", p.id);
                              await refresh();
                              pushToast(`Department "${p.name}" created`);
                            }}
                            style={{ padding: "6px 12px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}
                          >
                            Create from this
                          </button>
                        </div>
                      );
                    })}
                    {!proposals.length && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--sw-muted)" }}>No proposals right now.</p>}
                  </section>
                </>
              )}

              {adminTab === "organisation" && <OrgAdmin tab="organisation" />}
              {adminTab === "permissions" && <OrgAdmin tab="permissions" />}

              {adminTab === "approvals" && (
                <>
                  <section style={{ ...card, marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 400 }}>SOP reviews waiting</h3>
                    {docVersions
                      .filter((v) => {
                        const doc = docs.find((x) => x.id === v.doc_id);
                        if (!doc?.is_sop || doc.current_version_id === v.id) return false;
                        const isCurrentLatest = !docVersions.some((o) => o.doc_id === v.doc_id && o.version_number > v.version_number);
                        return isCurrentLatest && (v.head_status === "pending" || v.audit_status === "pending");
                      })
                      .map((v) => {
                        const doc = docs.find((x) => x.id === v.doc_id)!;
                        const reviewer = profiles.find((p) => p.id === v.head_reviewer_id);
                        const submitter = profiles.find((p) => p.id === v.submitted_by);
                        const overdueReview = !!v.review_due && v.review_due < today;
                        const waitingOn = [v.head_status === "pending" ? (reviewer?.name || "Dept head") : null, v.audit_status === "pending" ? "Internal Audit" : null].filter(Boolean).join(" + ");
                        return (
                          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 400 }}>&quot;{doc.title}&quot; v{v.version_number} — waiting on {waitingOn}</div>
                              <div style={{ fontSize: 11, color: overdueReview ? "var(--red)" : "var(--sw-muted)" }}>
                                Submitted by {submitter?.name || "—"} · {v.review_due ? `review due ${fmtShort(v.review_due)}${overdueReview ? " — overdue" : ""}` : "no review deadline"}
                              </div>
                            </span>
                            <button onClick={() => setDocDetailId(doc.id)} style={pillBtn("var(--crimson)")}>Open review</button>
                          </div>
                        );
                      })}
                    {!docVersions.some((v) => {
                      const doc = docs.find((x) => x.id === v.doc_id);
                      if (!doc?.is_sop) return false;
                      const isCurrentLatest = !docVersions.some((o) => o.doc_id === v.doc_id && o.version_number > v.version_number);
                      return isCurrentLatest && doc.current_version_id !== v.id && (v.head_status === "pending" || v.audit_status === "pending");
                    }) && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--sw-muted)" }}>No SOP reviews waiting.</p>}
                  </section>

                  <section style={{ ...card, marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 400 }}>Form submissions waiting to be converted</h3>
                    {formSubmissions.filter((s) => !s.task_id).map((s) => {
                      const f = forms.find((x) => x.id === s.form_id);
                      if (!f) return null;
                      const owner = profiles.find((p) => p.id === f.default_assignee_id);
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 400 }}>&quot;{f.title}&quot; — new submission {relTime(s.submitted_at)}</div>
                            <div style={{ fontSize: 11, color: "var(--sw-muted)" }}>{owner ? `Assigned to ${owner.name} on conversion` : "No owner set on this form"}</div>
                          </span>
                          <button onClick={() => { setSection("workspace"); setWorkspacePage("forms"); setExpandedSubmissionsFor(f.id); }} style={pillBtn("var(--crimson)")}>Open in Forms</button>
                        </div>
                      );
                    })}
                    {!formSubmissions.some((s) => !s.task_id) && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--sw-muted)" }}>No form submissions waiting.</p>}
                  </section>

                  <section style={{ ...card, marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 400, flex: 1 }}>Space admin nominations</h3>
                      <span style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-muted)" }}>Department heads nominate — Board / Group Heads approve</span>
                    </div>
                    {nominations.map((nm) => {
                      const nominee = profiles.find((p) => p.id === nm.nominee_id);
                      const by = profiles.find((p) => p.id === nm.nominated_by);
                      const dept = departments.find((d) => d.id === nm.department_id);
                      return (
                        <div key={nm.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 400 }}>{nominee?.name} → {dept?.name}</div>
                            <div style={{ fontSize: 11, color: "var(--sw-muted)" }}>Nominated by {by?.name} · &quot;{nm.reason}&quot;</div>
                          </span>
                          {(["approved", "rejected"] as const).map((verdict) => (
                            <button
                              key={verdict}
                              onClick={async () => {
                                patch("nominations", nominations.filter((x) => x.id !== nm.id));
                                await supabase.from("nominations").update({ status: verdict }).eq("id", nm.id);
                                if (verdict === "approved" && nominee && dept) {
                                  await supabase.from("org_unit_heads").insert({ unit_id: dept.id, profile_id: nominee.id });
                                  await refresh();
                                }
                              }}
                              style={pillBtn(verdict === "approved" ? "var(--green)" : "var(--red)")}
                            >
                              {verdict === "approved" ? "Approve" : "Reject"}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                    {!nominations.length && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--sw-muted)" }}>No pending nominations.</p>}
                  </section>

                  <section style={{ ...card, marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 400 }}>Due-date approval queue</h3>
                    {approvals.filter((a) => a.status === "pending" && a.kind === "due_date").map((a) => {
                      const t = tasks.find((x) => x.id === a.task_id);
                      const requester = profiles.find((p) => p.id === a.requester_id);
                      return (
                        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 400 }}>
                              &quot;{t?.name}&quot; — {a.prev_due ? `${a.prev_due} → ` : ""}{a.requested_due}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--sw-muted)" }}>{requester?.name} · {t ? listPath(t.list_id).split(" / ")[1] : ""} · &quot;{a.detail}&quot;</div>
                          </span>
                          <button
                            onClick={async () => {
                              if (!me) return;
                              const { decideDueDate } = await import("@/lib/actions");
                              await decideDueDate(supabase, store, patch, a, me, "approved");
                              pushToast("Request approved — due date updated");
                            }}
                            style={pillBtn("var(--green)")}
                          >
                            Approve
                          </button>
                          <button
                            onClick={async () => {
                              if (!me) return;
                              const { decideDueDate } = await import("@/lib/actions");
                              await decideDueDate(supabase, store, patch, a, me, "declined");
                              pushToast("Request declined");
                            }}
                            style={pillBtn("var(--red)")}
                          >
                            Reject
                          </button>
                        </div>
                      );
                    })}
                    {!approvals.some((a) => a.status === "pending" && a.kind === "due_date") && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--sw-muted)" }}>Queue is clear.</p>}
                  </section>

                  <section style={card}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 400, flex: 1 }}>Board requests</h3>
                      <span style={{ fontSize: 11, fontWeight: 400, color: "var(--sw-muted)" }}>Only space admins can create boards directly — everyone else requests one here</span>
                    </div>
                    {boardRequests.map((b) => {
                      const requester = profiles.find((p) => p.id === b.requester_id);
                      const dept = departments.find((d) => d.id === b.department_id);
                      return (
                        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                          <span style={{ width: 7, height: 7, borderRadius: 99, background: dept?.color || "var(--crimson)", flex: "none", marginTop: 2 }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 400 }}>{b.board_name}</div>
                            <div style={{ fontSize: 11, color: "var(--sw-muted)", marginTop: 1 }}>Requested by {requester?.name} for {dept?.name} · &quot;{b.reason}&quot;</div>
                          </span>
                          <button
                            onClick={async () => {
                              patch("boardRequests", boardRequests.filter((x) => x.id !== b.id));
                              await supabase.from("board_requests").update({ status: "approved" }).eq("id", b.id);
                              const sp = spaces.find((s) => s.department_id === b.department_id);
                              if (sp) {
                                await supabase.from("lists").insert({ space_id: sp.id, name: b.board_name, sort: 99 });
                                await refresh();
                              }
                              pushToast(`Board "${b.board_name}" created`);
                            }}
                            style={pillBtn("var(--green)")}
                          >
                            Approve
                          </button>
                          <button
                            onClick={async () => {
                              patch("boardRequests", boardRequests.filter((x) => x.id !== b.id));
                              await supabase.from("board_requests").update({ status: "rejected" }).eq("id", b.id);
                            }}
                            style={pillBtn("var(--red)")}
                          >
                            Reject
                          </button>
                        </div>
                      );
                    })}
                    {!boardRequests.length && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--sw-muted)" }}>No pending board requests.</p>}
                  </section>
                </>
              )}

              {adminTab === "invites" && (
                <>
                  <section style={{ ...card, marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 400 }}>Invite a new user</h3>
                    <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--sw-muted)" }}>
                      {isBoardish
                        ? "You can invite and approve any level, into any department — including other Department Heads and Group Heads."
                        : "You can invite and approve Managers, Supervisors and Staff into your department only. To broaden someone's access beyond that, a Group Head, Board member or Super Admin has to do it."}
                    </p>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@sansico.com" style={{ flex: 1, maxWidth: 240, height: 36, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 12.5, color: "var(--sw-text)", outline: "none" }} />
                      <select className="sw-select" value={inviteLevel} onChange={(e) => setInviteLevel(e.target.value)} style={{ height: 36, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12, color: "var(--sw-text)", width: 150 }}>
                        {(isBoardish ? levels : levels.filter((l) => ["l4", "l5", "l6"].includes(l.id))).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                      <button
                        onClick={async () => {
                          const email = inviteEmail.trim();
                          if (!email || !me) return;
                          const { data } = await supabase.from("invites").insert({ email, level_id: inviteLevel, department_id: me.department_id, invited_by: me.id, status: "sent" }).select().single();
                          if (data) patch("invites", [data, ...invites]);
                          setInviteEmail("");
                          fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "invite", inviteId: data?.id }) }).catch(() => {});
                          pushToast(`Invite sent to ${email}`);
                        }}
                        style={{ padding: "8px 16px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 12.5, fontWeight: 400, cursor: "pointer" }}
                      >
                        Send invite
                      </button>
                    </div>
                  </section>

                  <section style={card}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 400 }}>Invites</h3>
                    {invites.map((i) => (
                      <button key={i.id} onClick={() => openDetail("invite", i.id)} className="sw-row" style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", width: "100%", border: "none", borderBottom: "1px solid var(--sw-hair)", background: "none", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 400 }}>{i.email}</span>
                        <span style={{ fontSize: 11, fontWeight: 400, color: i.status === "registered" ? "var(--green)" : "#B7791F" }}>
                          {i.status === "registered" ? "Registered · active" : "Email sent · not registered"}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--sw-muted)" }}>{fmtShort(i.created_at.slice(0, 10))}</span>
                      </button>
                    ))}
                  </section>
                </>
              )}

              {adminTab === "features" && (
                <section style={card}>
                  <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 400 }}>Feature switches</h3>
                  <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--sw-muted)" }}>Changes apply to everyone the next time their app refreshes.</p>
                  {Object.keys(FEATURE_LABELS).map((key) => {
                    const on = features[key];
                    return (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--sw-hair)", cursor: "pointer" }}>
                        <span
                          onClick={async () => {
                            patch("features", { ...features, [key]: !on });
                            await supabase.from("features").update({ enabled: !on }).eq("key", key);
                          }}
                          style={{ width: 36, height: 20, borderRadius: 999, background: on ? "var(--crimson)" : "var(--sw-hair)", position: "relative", flex: "none", transition: "background .15s" }}
                        >
                          <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: 99, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
                        </span>
                        <span>
                          <div style={{ fontSize: 12.5, fontWeight: 400 }}>{FEATURE_LABELS[key]}</div>
                          {FEATURE_HELP[key] && <div style={{ fontSize: 11, color: "var(--sw-muted)", marginTop: 2 }}>{FEATURE_HELP[key]}</div>}
                        </span>
                      </label>
                    );
                  })}
                </section>
              )}

              {adminTab === "audit" && (
                <section style={card}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 400, flex: 1 }}>Audit log</h3>
                    <button onClick={exportAuditPackage} style={{ padding: "7px 15px", borderRadius: 999, border: "1px solid var(--crimson)", background: "none", color: "var(--crimson)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>Export audit package (CSV)</button>
                  </div>
                  <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--sw-muted)" }}>Admin/permission/org changes and every SOP review decision, in one file — for handing to Internal Audit.</p>
                  {audit.map((a) => {
                    const who = profiles.find((p) => p.id === a.actor_id);
                    return (
                      <button key={a.id} onClick={() => openDetail("audit", a.id)} className="sw-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 12, width: "100%", border: "none", borderBottom: "1px solid var(--sw-hair)", background: "none", cursor: "pointer", textAlign: "left" }}>
                        <b style={{ fontWeight: 400 }}>{who?.name || "System"}</b>
                        <span style={{ color: "var(--sw-text-soft)" }}>{a.action}</span>
                        <span style={{ color: "var(--sw-muted)", flex: 1 }}>{a.target}</span>
                        <span style={{ color: "var(--sw-muted)", fontSize: 11 }}>{relTime(a.created_at)}</span>
                      </button>
                    );
                  })}
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {/* ===== NEW SOP MODAL ===== */}
      {showNewDoc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowNewDoc(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "24px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 400, flex: 1 }}>New SOP / document</h3>
              <button onClick={() => setShowNewDoc(false)} style={{ border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
            </div>
            {(() => {
              const isSop = newDoc.type === "SOP";
              return (
                <>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Title</label>
                  <input value={newDoc.title} onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })} placeholder="e.g. Customs clearance SOP" style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13.5, marginBottom: 14, outline: "none", color: "var(--sw-text)" }} />
                  <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Type</label>
                  <select className="sw-select" value={newDoc.type} onChange={(e) => setNewDoc({ ...newDoc, type: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 14, color: "var(--sw-text)" }}>
                    <option>SOP</option><option>Handover</option><option>Brief</option><option>Meeting notes</option>
                  </select>
                  {isSop ? (
                    <>
                      <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--sw-muted)" }}>SOPs go through department-head and Internal Audit review before they become official. It stays visible only to your department, Board, Group/Regional Group Heads, and Audit until approved.</p>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Department</label>
                      <select
                        className="sw-select"
                        value={newDoc.departmentId}
                        onChange={(e) => {
                          const deptId = e.target.value;
                          const firstHead = deptHeads.find((h) => h.unit_id === deptId)?.profile_id || "";
                          setNewDoc({ ...newDoc, departmentId: deptId, headReviewerId: firstHead, reviewDue: newDoc.reviewDue || defaultReviewDue() });
                        }}
                        style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 14, color: "var(--sw-text)" }}
                      >
                        <option value="">Choose…</option>
                        {departments.filter((d) => !d.archived).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      {newDoc.departmentId && (
                        <>
                          <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Department reviewer</label>
                          <select className="sw-select" value={newDoc.headReviewerId} onChange={(e) => setNewDoc({ ...newDoc, headReviewerId: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 4, color: "var(--sw-text)" }}>
                            <option value="">Choose reviewer…</option>
                            {headReviewerCandidates(newDoc.departmentId).map((p) => <option key={p.id} value={p.id}>{p.name}{deptHeads.some((h) => h.unit_id === newDoc.departmentId && h.profile_id === p.id) ? " — department head" : ""}</option>)}
                          </select>
                          <p style={{ margin: "0 0 14px", fontSize: 10.5, color: "var(--sw-muted)" }}>Internal Audit approval: {auditManager ? auditManager.name : "no Audit manager set"} (Manager, Internal Audit) — always required, not selectable.</p>
                        </>
                      )}
                      <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Review due date</label>
                      <input type="date" value={newDoc.reviewDue || defaultReviewDue()} onChange={(e) => setNewDoc({ ...newDoc, reviewDue: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 14, color: "var(--sw-text)", boxSizing: "border-box" }} />
                      <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>File (Word, PPT, or PDF)</label>
                      <input type="file" accept=".doc,.docx,.ppt,.pptx,.pdf" onChange={(e) => setNewDocFile(e.target.files?.[0] || null)} style={{ width: "100%", marginBottom: 14, fontSize: 12.5, color: "var(--sw-text)" }} />
                      <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>What does this SOP cover?</label>
                      <textarea value={newDoc.excerpt} onChange={(e) => setNewDoc({ ...newDoc, excerpt: e.target.value })} placeholder="A couple of sentences — Sansi turns this into a version-history summary." style={{ width: "100%", height: 70, resize: "vertical", borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "10px 12px", fontSize: 13, fontFamily: "var(--font-sans)", color: "var(--sw-text)", outline: "none", marginBottom: 18 }} />
                    </>
                  ) : (
                    <>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Category</label>
                      <select className="sw-select" value={newDoc.category} onChange={(e) => setNewDoc({ ...newDoc, category: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 14, color: "var(--sw-text)" }}>
                        <option value="">Choose…</option>{departments.map((d) => <option key={d.id}>{d.name}</option>)}<option>Operations</option><option>Finance</option>
                      </select>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>File (Word, PPT, or PDF — this is the document itself)</label>
                      <input type="file" accept=".doc,.docx,.ppt,.pptx,.pdf" onChange={(e) => setNewDocFile(e.target.files?.[0] || null)} style={{ width: "100%", marginBottom: 14, fontSize: 12.5, color: "var(--sw-text)" }} />
                      <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Summary</label>
                      <textarea value={newDoc.excerpt} onChange={(e) => setNewDoc({ ...newDoc, excerpt: e.target.value })} placeholder="One or two lines about what this document covers." style={{ width: "100%", height: 70, resize: "vertical", borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "10px 12px", fontSize: 13, fontFamily: "var(--font-sans)", color: "var(--sw-text)", outline: "none", marginBottom: 18 }} />
                    </>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button onClick={() => setShowNewDoc(false)} style={{ padding: "9px 16px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", fontSize: 13, fontWeight: 400, cursor: "pointer", color: "var(--sw-text-soft)" }}>Cancel</button>
                    <button
                      disabled={creatingDoc}
                      onClick={async () => {
                        if (!newDoc.title.trim() || !me) return;
                        if (isSop && (!newDoc.departmentId || !newDocFile || !newDoc.headReviewerId)) { pushToast("Choose a department, a reviewer, and attach the file to submit an SOP"); return; }
                        setCreatingDoc(true);
                        const { notify } = await import("@/lib/actions");
                        if (isSop) {
                          const deptName = departments.find((d) => d.id === newDoc.departmentId)?.name || null;
                          const reviewDue = newDoc.reviewDue || defaultReviewDue();
                          const { data: doc } = await supabase.from("docs").insert({
                            title: newDoc.title.trim(), type: "SOP", category: deptName, excerpt: newDoc.excerpt || null,
                            status: "Under review", owner_id: me.id, department_id: newDoc.departmentId, is_sop: true,
                          }).select().single();
                          if (doc && newDocFile) {
                            const path = `${doc.id}/${Date.now()}-${newDocFile.name}`;
                            await supabase.storage.from("sop-files").upload(path, newDocFile);
                            let summary = newDoc.excerpt || "";
                            try {
                              const res = await fetch("/api/sansi/summarize-sop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newDoc.title.trim(), changeNote: newDoc.excerpt, isRevision: false }) });
                              const j = await res.json();
                              if (j.summary) summary = j.summary;
                            } catch {}
                            const { data: version } = await supabase.from("doc_versions").insert({
                              doc_id: doc.id, version_number: 1, file_path: path, file_name: newDocFile.name,
                              submitted_by: me.id, change_note: newDoc.excerpt || null, ai_summary: summary,
                              review_due: reviewDue, head_reviewer_id: newDoc.headReviewerId,
                            }).select().single();
                            patch("docs", [...docs, doc as Doc]);
                            if (version) patch("docVersions", [...docVersions, version]);
                            // Both reviewers get told there's work waiting — a review no one knows about never happens.
                            await notify(supabase, newDoc.headReviewerId, null, `${me.name} submitted "${newDoc.title.trim()}" for your SOP review — due ${fmtShort(reviewDue)}`, "SOP review");
                            if (auditManager && auditManager.id !== newDoc.headReviewerId) {
                              await notify(supabase, auditManager.id, null, `${me.name} submitted "${newDoc.title.trim()}" for Internal Audit review — due ${fmtShort(reviewDue)}`, "SOP review");
                            }
                          }
                          pushToast("SOP submitted — reviewers have been notified");
                        } else {
                          const { data } = await supabase.from("docs").insert({ title: newDoc.title.trim(), type: newDoc.type, category: newDoc.category || null, excerpt: newDoc.excerpt || null, status: "Draft", owner_id: me.id }).select().single();
                          if (data) {
                            let createdDoc = data as Doc;
                            if (newDocFile) {
                              const path = `${createdDoc.id}/${Date.now()}-${newDocFile.name}`;
                              await supabase.storage.from("sop-files").upload(path, newDocFile);
                              const { data: version } = await supabase.from("doc_versions").insert({
                                doc_id: createdDoc.id, version_number: 1, file_path: path, file_name: newDocFile.name,
                                submitted_by: me.id, head_status: "approved", audit_status: "approved",
                              }).select().single();
                              if (version) {
                                await supabase.from("docs").update({ current_version_id: version.id }).eq("id", createdDoc.id);
                                createdDoc = { ...createdDoc, current_version_id: version.id };
                                patch("docVersions", [...docVersions, version]);
                              }
                            }
                            patch("docs", [...docs, createdDoc]);
                          }
                          pushToast("Document created as Draft");
                        }
                        setCreatingDoc(false);
                        setShowNewDoc(false);
                        setNewDoc({ title: "", type: "SOP", category: "", excerpt: "", departmentId: "", reviewDue: "", headReviewerId: "" });
                        setNewDocFile(null);
                      }}
                      style={{ padding: "9px 18px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 13, fontWeight: 400, cursor: creatingDoc ? "default" : "pointer", opacity: creatingDoc ? 0.6 : 1, boxShadow: "0 8px 20px rgba(122,13,32,.3)" }}
                    >
                      {creatingDoc ? "Submitting…" : isSop ? "Submit for review" : "Create document"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ===== NEW FORM MODAL ===== */}
      {showNewForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowNewForm(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "24px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 400, flex: 1 }}>New form</h3>
              <button onClick={() => setShowNewForm(false)} style={{ border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Form title</label>
            <input value={newForm.title} onChange={(e) => setNewForm({ ...newForm, title: e.target.value })} placeholder="e.g. IT Support Request" style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13.5, marginBottom: 14, outline: "none", color: "var(--sw-text)" }} />
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Submissions become tasks in</label>
            <select className="sw-select" value={newForm.listId} onChange={(e) => setNewForm({ ...newForm, listId: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 14, color: "var(--sw-text)" }}>
              <option value="">Choose a list…</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{listPath(l.id)}</option>)}
            </select>
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Notify &amp; assign submissions to</label>
            <select className="sw-select" value={newForm.ownerId} onChange={(e) => setNewForm({ ...newForm, ownerId: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 4, color: "var(--sw-text)" }}>
              <option value="">Choose…</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p style={{ margin: "0 0 14px", fontSize: 10.5, color: "var(--sw-muted)" }}>This person is notified on every new submission and is the default assignee when it's converted to a task.</p>
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Questions</label>
            {newForm.fields.map((f, i) => (
              <div key={f.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={f.label} onChange={(e) => setNewForm({ ...newForm, fields: newForm.fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} style={{ flex: 1, height: 36, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 12.5, color: "var(--sw-text)", outline: "none" }} />
                <select className="sw-select" value={f.type} onChange={(e) => setNewForm({ ...newForm, fields: newForm.fields.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })} style={{ height: 36, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12, color: "var(--sw-text)", width: 130 }}>
                  <option>Short answer</option><option>Paragraph</option><option>Dropdown</option><option>File upload</option>
                </select>
                <button onClick={() => setNewForm({ ...newForm, fields: newForm.fields.filter((_, j) => j !== i) })} style={{ border: "none", background: "none", color: "var(--red)", cursor: "pointer" }}><IconX /></button>
              </div>
            ))}
            <button onClick={() => setNewForm({ ...newForm, fields: [...newForm.fields, { id: Date.now(), label: "", type: "Short answer" }] })} style={{ marginBottom: 18, padding: "7px 14px", borderRadius: 999, border: "1px dashed var(--sw-hair)", background: "none", color: "var(--sw-text-soft)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>+ Add question</button>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowNewForm(false)} style={{ padding: "9px 16px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", fontSize: 13, fontWeight: 400, cursor: "pointer", color: "var(--sw-text-soft)" }}>Cancel</button>
              <button
                onClick={async () => {
                  if (!newForm.title.trim()) return;
                  if (!newForm.ownerId) { pushToast("Choose who submissions should notify and assign to"); return; }
                  const { data } = await supabase.from("forms").insert({ title: newForm.title.trim(), list_id: newForm.listId || null, default_assignee_id: newForm.ownerId, fields: newForm.fields.filter((f) => f.label.trim()), active: true }).select().single();
                  if (data) patch("forms", [...forms, data]);
                  setShowNewForm(false);
                  setNewForm({ title: "", listId: "", ownerId: "", fields: [{ id: 1, label: "What do you need?", type: "Short answer" }] });
                  pushToast("Form is live");
                }}
                style={{ padding: "9px 18px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 13, fontWeight: 400, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.3)" }}
              >
                Create form
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== EDIT FORM MODAL (paused/unpublished forms only) ===== */}
      {editingForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setEditingForm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "24px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 400, flex: 1 }}>Edit form</h3>
              <button onClick={() => setEditingForm(null)} style={{ border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Form title</label>
            <input value={editingForm.title} onChange={(e) => setEditingForm({ ...editingForm, title: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13.5, marginBottom: 14, outline: "none", color: "var(--sw-text)" }} />
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Submissions become tasks in</label>
            <select className="sw-select" value={editingForm.listId} onChange={(e) => setEditingForm({ ...editingForm, listId: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 14, color: "var(--sw-text)" }}>
              <option value="">Choose a list…</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{listPath(l.id)}</option>)}
            </select>
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Notify &amp; assign submissions to</label>
            <select className="sw-select" value={editingForm.ownerId} onChange={(e) => setEditingForm({ ...editingForm, ownerId: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 14, color: "var(--sw-text)" }}>
              <option value="">Choose…</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Questions</label>
            {editingForm.fields.map((f, i) => (
              <div key={f.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={f.label} onChange={(e) => setEditingForm({ ...editingForm, fields: editingForm.fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} style={{ flex: 1, height: 36, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 12.5, color: "var(--sw-text)", outline: "none" }} />
                <select className="sw-select" value={f.type} onChange={(e) => setEditingForm({ ...editingForm, fields: editingForm.fields.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })} style={{ height: 36, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12, color: "var(--sw-text)", width: 130 }}>
                  <option>Short answer</option><option>Paragraph</option><option>Dropdown</option><option>File upload</option>
                </select>
                <button onClick={() => setEditingForm({ ...editingForm, fields: editingForm.fields.filter((_, j) => j !== i) })} style={{ border: "none", background: "none", color: "var(--red)", cursor: "pointer" }}><IconX /></button>
              </div>
            ))}
            <button onClick={() => setEditingForm({ ...editingForm, fields: [...editingForm.fields, { id: Date.now(), label: "", type: "Short answer" }] })} style={{ marginBottom: 18, padding: "7px 14px", borderRadius: 999, border: "1px dashed var(--sw-hair)", background: "none", color: "var(--sw-text-soft)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>+ Add question</button>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setEditingForm(null)} style={{ padding: "9px 16px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", fontSize: 13, fontWeight: 400, cursor: "pointer", color: "var(--sw-text-soft)" }}>Cancel</button>
              <button
                onClick={async () => {
                  if (!editingForm.title.trim()) return;
                  if (!editingForm.ownerId) { pushToast("Choose who submissions should notify and assign to"); return; }
                  const fields = editingForm.fields.filter((f) => f.label.trim());
                  await supabase.from("forms").update({ title: editingForm.title.trim(), list_id: editingForm.listId || null, default_assignee_id: editingForm.ownerId, fields }).eq("id", editingForm.id);
                  patch("forms", forms.map((x) => (x.id === editingForm.id ? { ...x, title: editingForm.title.trim(), list_id: editingForm.listId || null, default_assignee_id: editingForm.ownerId, fields } : x)));
                  setEditingForm(null);
                  pushToast("Form updated");
                }}
                style={{ padding: "9px 18px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 13, fontWeight: 400, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.3)" }}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NOMINATE SPACE ADMIN MODAL ===== */}
      {nominateFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setNominateFor(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "92vw", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "24px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 400, flex: 1 }}>Nominate a space admin</h3>
              <button onClick={() => setNominateFor(null)} style={{ border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--sw-muted)" }}>Nominations go to Board / Group Heads for approval.</p>
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Nominee</label>
            <select className="sw-select" value={nominate.name} onChange={(e) => setNominate({ ...nominate, name: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13, marginBottom: 14, color: "var(--sw-text)" }}>
              <option value="">Choose…</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Why?</label>
            <textarea value={nominate.reason} onChange={(e) => setNominate({ ...nominate, reason: e.target.value })} style={{ width: "100%", height: 70, resize: "vertical", borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "10px 12px", fontSize: 13, fontFamily: "var(--font-sans)", color: "var(--sw-text)", outline: "none", marginBottom: 18 }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setNominateFor(null)} style={{ padding: "9px 16px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", fontSize: 13, fontWeight: 400, cursor: "pointer", color: "var(--sw-text-soft)" }}>Cancel</button>
              <button
                onClick={async () => {
                  if (!nominate.name || !me) return;
                  const { data } = await supabase.from("nominations").insert({ department_id: nominateFor, nominee_id: nominate.name, nominated_by: me.id, reason: nominate.reason }).select().single();
                  if (data) patch("nominations", [...nominations, data]);
                  setNominateFor(null);
                  pushToast("Nomination sent for Board approval");
                }}
                style={{ padding: "9px 18px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 13, fontWeight: 400, cursor: "pointer" }}
              >
                Send nomination
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CREATE / PROPOSE DEPARTMENT MODAL ===== */}
      {deptModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setDeptModal(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "92vw", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "24px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 400, flex: 1 }}>{deptModal === "create" ? "Create department" : "Propose a department"}</h3>
              <button onClick={() => setDeptModal(null)} style={{ border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--sw-muted)" }}>
              {deptModal === "create" ? "Creates the department immediately and lets you assign heads and members." : "Proposals are visibility-only; a Board member or Group Head decides whether to create it."}
            </p>
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Department name</label>
            <input value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} placeholder="e.g. Innovation Lab" style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 13.5, marginBottom: 14, outline: "none", color: "var(--sw-text)" }} />
            <label style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--sw-text-soft)", marginBottom: 6 }}>Why?</label>
            <textarea value={deptForm.reason} onChange={(e) => setDeptForm({ ...deptForm, reason: e.target.value })} style={{ width: "100%", height: 70, resize: "vertical", borderRadius: 10, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "10px 12px", fontSize: 13, fontFamily: "var(--font-sans)", color: "var(--sw-text)", outline: "none", marginBottom: 18 }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setDeptModal(null)} style={{ padding: "9px 16px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", fontSize: 13, fontWeight: 400, cursor: "pointer", color: "var(--sw-text-soft)" }}>Cancel</button>
              <button
                onClick={async () => {
                  if (!deptForm.name.trim() || !me) return;
                  if (deptModal === "create") {
                    await supabase.from("org_units").insert({ name: deptForm.name.trim(), color: "#22409E", mode: "Workspace visible" });
                    await refresh();
                    pushToast(`Department "${deptForm.name.trim()}" created`);
                  } else {
                    const { data } = await supabase.from("dept_proposals").insert({ name: deptForm.name.trim(), proposer_id: me.id, reason: deptForm.reason }).select().single();
                    if (data) patch("proposals", [...proposals, data]);
                    pushToast("Proposal submitted");
                  }
                  setDeptModal(null);
                }}
                style={{ padding: "9px 18px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 13, fontWeight: 400, cursor: "pointer" }}
              >
                {deptModal === "create" ? "Create" : "Submit proposal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== EMAIL PREVIEW MODAL ===== */}
      {emailPreview && (
        <EmailPreview kind={emailPreview} digestTime={digestTime} onClose={() => setEmailPreview(null)} dueSoon={dueSoon.map((t) => t.name)} myOpen={myTasks.filter(isOpen).length} firstName={me?.name.split(" ")[0] || ""} email={me?.email || ""} />
      )}
    </div>
  );
}

function EmailPreview({ kind, digestTime, onClose, dueSoon, myOpen, firstName, email }: { kind: "digest" | "wrap" | "plan" | "instant"; digestTime: string; onClose: () => void; dueSoon: string[]; myOpen: number; firstName: string; email: string }) {
  const heads = {
    digest: { subject: `Your day at Sansico — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`, when: `Daily · ${digestTime} WIB` },
    wrap: { subject: "Friday wrap — you closed 6 this week", when: "Fridays · 15:00 WIB" },
    plan: { subject: "Your Monday plan — 3 things that matter today", when: "Mondays · 08:00 WIB" },
    instant: { subject: "Budi assigned you: Reconcile July vendor invoices", when: "Instant · as it happens" },
  }[kind];
  const h4: React.CSSProperties = { margin: "0 0 8px", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sw-muted)" };
  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--sw-hair)", fontSize: 12.5 };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 600, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", background: "var(--sw-card)", borderRadius: 16, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", animation: "swModalIn .18s ease" }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--sw-hair)", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--sw-muted)", flex: 1 }}>Email preview</span>
          <button onClick={onClose} style={{ border: "none", background: "var(--sw-hover)", width: 24, height: 24, borderRadius: 99, cursor: "pointer", fontSize: 12, color: "var(--sw-text-soft)" }}><IconX /></button>
        </div>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--sw-hair)", fontSize: 12, color: "var(--sw-text-soft)", display: "flex", flexDirection: "column", gap: 3 }}>
          <span><b style={{ fontWeight: 800, color: "var(--sw-text)" }}>From:</b> SansiWorks &lt;digest@sansico.com&gt;</span>
          <span><b style={{ fontWeight: 800, color: "var(--sw-text)" }}>To:</b> {email}</span>
          <span><b style={{ fontWeight: 800, color: "var(--sw-text)" }}>Subject:</b> {heads.subject}</span>
          <span style={{ fontSize: 10.5, color: "var(--crimson)" }}>{heads.when}</span>
        </div>
        <div style={{ padding: "24px 26px" }}>
          <div style={{ display: "flex", height: 4, borderRadius: 99, overflow: "hidden", marginBottom: 18 }}>
            <span style={{ flex: 1, background: "#7A0D20" }} /><span style={{ flex: 1, background: "#22409E" }} /><span style={{ flex: 1, background: "#0D4F31" }} /><span style={{ flex: 1, background: "#F3263E" }} /><span style={{ flex: 1, background: "#BDDA5F" }} />
          </div>

          {kind === "digest" && (
            <>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 22, margin: "0 0 14px" }}>Good morning, <em style={{ fontStyle: "italic" }}>{firstName}</em>.</h2>
              <div style={{ background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, color: "var(--sw-text)", lineHeight: 1.5, marginBottom: 20 }}>
                {dueSoon.length} task{dueSoon.length === 1 ? "" : "s"} need attention, {myOpen} open in total. Your on-time rate is trending up this week.
              </div>
              <h4 style={h4}>Needs your attention</h4>
              {dueSoon.map((n) => (
                <div key={n} style={rowStyle}><span style={{ color: "var(--sw-text)" }}>{n}</span><span style={{ color: "var(--red)", fontSize: 11.5, flex: "none" }}>due</span></div>
              ))}
              <div style={{ marginTop: 18, background: "rgba(13,79,49,0.07)", border: "1px solid var(--sw-hair)", borderRadius: 11, padding: "11px 16px", fontSize: 12.5, color: "var(--green)" }}>On-time this week — trending up</div>
            </>
          )}
          {kind === "wrap" && (
            <>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 22, margin: "0 0 14px" }}>That&apos;s a <em style={{ fontStyle: "italic" }}>wrap</em>, {firstName}.</h2>
              <div style={{ background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, color: "var(--sw-text)", lineHeight: 1.5, marginBottom: 8 }}>You closed 6 tasks this week — 4 on time, 2 late.</div>
              <div style={{ fontSize: 11, color: "var(--sw-muted)", marginBottom: 18 }}>On-time rate 67% this week · 82% last week</div>
              <h4 style={h4}>Slipped this week</h4>
              {dueSoon.slice(0, 2).map((n) => (
                <div key={n} style={rowStyle}><span style={{ color: "var(--sw-text)" }}>{n}</span><span style={{ color: "var(--red)", fontSize: 11.5, flex: "none" }}>slipped</span></div>
              ))}
              <div style={{ margin: "14px 0 18px" }}><span style={{ display: "inline-block", background: "var(--crimson)", color: "#fff", borderRadius: 999, padding: "8px 20px", fontSize: 12 }}>Reschedule both into next week →</span></div>
              <div style={{ background: "rgba(13,79,49,0.07)", border: "1px solid var(--sw-hair)", borderRadius: 11, padding: "11px 16px", fontSize: 12.5, color: "var(--green)" }}>5 tasks due next week — heaviest day is Wednesday (3).</div>
            </>
          )}
          {kind === "plan" && (
            <>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 22, margin: "0 0 14px" }}>Your <em style={{ fontStyle: "italic" }}>Monday plan</em>.</h2>
              <h4 style={h4}>If you do only three things today</h4>
              {dueSoon.slice(0, 3).map((n, i) => (
                <div key={n} style={{ display: "flex", gap: 11, padding: "9px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 99, background: "var(--crimson)", color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{i + 1}</span>
                  <span><div style={{ fontSize: 12.5, color: "var(--sw-text)" }}>{n}</div><div style={{ fontSize: 11, color: "var(--sw-muted)", marginTop: 1 }}>due soonest — start here</div></span>
                </div>
              ))}
              <h4 style={{ ...h4, margin: "18px 0 10px" }}>Your week at a glance</h4>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 14, padding: "0 4px 4px" }}>
                {([["Mon", 3], ["Tue", 1], ["Wed", 2], ["Thu", 0], ["Fri", 1]] as const).map(([d, c]) => (
                  <span key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--sw-text-soft)" }}>{c}</span>
                    <span style={{ width: 26, height: 8 + c * 14, borderRadius: "5px 5px 0 0", background: c ? "var(--crimson)" : "var(--sw-hair)" }} />
                    <span style={{ fontSize: 10, color: "var(--sw-muted)" }}>{d}</span>
                  </span>
                ))}
              </div>
            </>
          )}
          {kind === "instant" && (
            <>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 22, margin: "0 0 14px" }}>New task <em style={{ fontStyle: "italic" }}>for you</em>.</h2>
              <div style={{ border: "1.5px solid var(--sw-hair)", borderRadius: 12, padding: "15px 17px", marginBottom: 14 }}>
                <div style={{ fontSize: 14, color: "var(--sw-text)", marginBottom: 4 }}>Reconcile July vendor invoices</div>
                <div style={{ fontSize: 11.5, color: "var(--sw-muted)", marginBottom: 2 }}>Finance / Month-end · Critical · due Friday</div>
                <div style={{ fontSize: 11.5, color: "var(--sw-text-soft)" }}>Assigned by Budi Hartono, just now</div>
              </div>
              <span style={{ display: "inline-block", background: "var(--crimson)", color: "#fff", borderRadius: 999, padding: "8px 20px", fontSize: 12, marginBottom: 16 }}>Open in SansiWorks →</span>
              <p style={{ margin: 0, fontSize: 10.5, color: "var(--sw-muted)" }}>You&apos;re receiving this instantly because &apos;Task assigned to me&apos; is set to Instant email in your settings.</p>
            </>
          )}
          <p style={{ margin: "22px 0 0", fontSize: 10.5, color: "var(--sw-muted)", textAlign: "center" }}>You&apos;re receiving this because your digest is on · Manage preferences · Sansico Group, Jakarta</p>
        </div>
      </div>
    </div>
  );
}
