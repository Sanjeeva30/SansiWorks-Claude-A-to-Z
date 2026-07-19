"use client";
import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { initials, DocVersion } from "@/lib/types";
import { relTime, fmtShort } from "@/lib/dates";
import { isDeptHead, isInternalAuditManager, isInternalAudit, internalAuditDept } from "@/lib/logic";
import { notify, logAudit } from "@/lib/actions";
import { IconX } from "./icons";
import { Avatar } from "./shared";
import { useFocusTrap } from "@/lib/a11y";

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" };
const panel: React.CSSProperties = { width: 460, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "24px 26px" };
const closeBtn: React.CSSProperties = { border: "none", background: "var(--sw-hover)", width: 28, height: 28, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" };
const row = (label: string, value: React.ReactNode) => (
  <React.Fragment key={label}>
    <span style={{ fontSize: 12, color: "var(--sw-muted)" }}>{label}</span>
    <span style={{ fontSize: 12.5, color: "var(--sw-text)" }}>{value}</span>
  </React.Fragment>
);

/* Generic drill-down popup for entities without their own bespoke modal —
   audit entries, invites, org units, forms. Escape/X dismissible, never navigates. */
export function EntityDetailModal() {
  const { detailPopup, closeDetail, openProfile, setActiveTaskId } = useUI();
  const { profiles, departments, deptHeads, assignments, levels, audit, invites, forms, lists, spaces, tasks } = useStore();
  const trapRef = useFocusTrap(!!detailPopup);
  if (!detailPopup) return null;
  const { type, id } = detailPopup;

  let title = "";
  let body: React.ReactNode = null;

  if (type === "audit") {
    const a = audit.find((x) => x.id === id);
    if (!a) return null;
    const who = profiles.find((p) => p.id === a.actor_id);
    const relatedTask = tasks.find((t) => a.target && (t.name === a.target || `SW-${t.task_number}` === a.target));
    title = "Audit entry";
    body = (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "10px 10px", marginBottom: 14 }}>
          {row("Actor", who ? <button onClick={() => { closeDetail(); openProfile(who.id); }} style={{ border: "none", background: "none", color: "var(--crimson)", cursor: "pointer", padding: 0, fontSize: 12.5 }}>{who.name}</button> : "System")}
          {row("Action", a.action)}
          {row("Target", a.target || "—")}
          {row("When", `${relTime(a.created_at)} · ${new Date(a.created_at).toLocaleString()}`)}
        </div>
        {relatedTask && (
          <button onClick={() => { closeDetail(); setActiveTaskId(relatedTask.id); }} style={{ width: "100%", height: 34, borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text)", fontSize: 12, cursor: "pointer" }}>
            Open &quot;{relatedTask.name}&quot; →
          </button>
        )}
      </>
    );
  }

  if (type === "invite") {
    const i = invites.find((x) => x.id === id);
    if (!i) return null;
    const dept = departments.find((d) => d.id === i.department_id);
    const level = levels.find((l) => l.id === i.level_id);
    title = "Invite";
    body = (
      <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "10px 10px" }}>
        {row("Email", i.email)}
        {row("Department", dept?.name || "—")}
        {row("Level", level?.name || "—")}
        {row("Status", i.status === "registered" ? "Registered · active" : "Email sent · not registered")}
        {row("Sent", fmtShort(i.created_at.slice(0, 10)))}
      </div>
    );
  }

  if (type === "department") {
    const d = departments.find((x) => x.id === id);
    if (!d) return null;
    const unitById = new Map(departments.map((x) => [x.id, x]));
    const chain: typeof departments = [];
    let cur: typeof d | undefined = d;
    while (cur) { chain.push(cur); cur = cur.parent_id ? unitById.get(cur.parent_id) : undefined; }
    const heads = deptHeads.filter((h) => h.unit_id === d.id).map((h) => profiles.find((p) => p.id === h.profile_id)).filter(Boolean);
    const theirAssignments = assignments.filter((a) => a.scope_unit_id === d.id);
    const memberCount = profiles.filter((p) => p.department_id === d.id).length;
    title = d.name;
    body = (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: d.color, flex: "none" }} />
          <span style={{ fontSize: 11, color: "var(--sw-muted)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "2px 9px" }}>{d.type}</span>
          {chain.length > 1 && <span style={{ fontSize: 11, color: "var(--sw-muted)" }}>part of {chain.slice(1).map((c) => c.name).join(" → ")}</span>}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 8 }}>Head(s)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {heads.length ? heads.map((h) => (
            <button key={h!.id} onClick={() => { closeDetail(); openProfile(h!.id); }} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", borderRadius: 999, padding: "4px 10px 4px 4px", cursor: "pointer" }}>
              <Avatar person={h!} size={20} />
              <span style={{ fontSize: 12 }}>{h!.name}</span>
            </button>
          )) : <span style={{ fontSize: 12, color: "var(--sw-muted)" }}>No head assigned yet</span>}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 8 }}>Functional assignments</div>
        {theirAssignments.length ? (
          <div style={{ marginBottom: 12 }}>
            {theirAssignments.map((a) => {
              const p = profiles.find((x) => x.id === a.profile_id);
              return <div key={a.id} style={{ fontSize: 12, padding: "4px 0" }}>{p?.name || "—"} — {a.function_name}</div>;
            })}
          </div>
        ) : <p style={{ fontSize: 12, color: "var(--sw-muted)", margin: "0 0 12px" }}>None</p>}
        {row("Home members", `${memberCount} people`)}
      </>
    );
  }

  if (type === "form") {
    const f = forms.find((x) => x.id === id);
    if (!f) return null;
    const list = lists.find((l) => l.id === f.list_id);
    const space = spaces.find((s) => s.id === list?.space_id);
    const owner = profiles.find((p) => p.id === f.default_assignee_id);
    title = f.title;
    body = (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "10px 10px", marginBottom: 16 }}>
          {row("Status", f.active ? "Live" : "Paused")}
          {row("Destination", list ? `${space?.name || ""} / ${list.name}` : "Unassigned")}
          {row("Questions", String(f.fields.length))}
          {row("Notifies", owner ? owner.name : "No owner set")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 8 }}>Fields</div>
        {f.fields.map((fld) => (
          <div key={fld.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--sw-hair)", fontSize: 12.5 }}>
            <span style={{ flex: 1 }}>{fld.label}</span>
            <span style={{ color: "var(--sw-muted)" }}>{fld.type}</span>
          </div>
        ))}
      </>
    );
  }

  if (!title) return null;

  return (
    <div style={overlay} onClick={closeDetail}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={panel}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 400, flex: 1 }}>{title}</h3>
          <button onClick={closeDetail} aria-label="Close" style={closeBtn}><IconX /></button>
        </div>
        {body}
      </div>
    </div>
  );
}

const STATUS_TINT: Record<string, [string, string]> = {
  Active: ["var(--green)", "rgba(13,79,49,0.09)"],
  "Under review": ["#B7791F", "rgba(183,121,31,0.12)"],
  "Revisions requested": ["var(--red)", "rgba(243,38,62,0.09)"],
  Draft: ["var(--sw-muted)", "var(--sw-hover)"],
};
const REVIEW_LABEL: Record<string, string> = { pending: "Pending", approved: "Approved", revisions_requested: "Revisions requested" };
const REVIEW_COLOR: Record<string, string> = { pending: "var(--sw-muted)", approved: "var(--green)", revisions_requested: "var(--red)" };

/* Doc detail — mounted globally so any screen (Docs page, Overview's recent-
   docs widget, global search) can open it without navigating there first.
   For SOPs, also carries the version history + dual-review (dept head +
   Internal Audit) actions and the "submit a revision" flow. */
export function DocDetailModal() {
  const { docDetailId, setDocDetailId, openProfile } = useUI();
  const { docs, docVersions, profiles, departments, deptHeads, me, supabase, patch } = useStore();
  const [note, setNote] = useState("");
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [plainFile, setPlainFile] = useState<File | null>(null);
  const [reviewNoteFile, setReviewNoteFile] = useState<File | null>(null);
  const [requestingRevisions, setRequestingRevisions] = useState<"head" | "audit" | null>(null);
  const [busy, setBusy] = useState(false);
  const trapRef = useFocusTrap(!!docDetailId);

  const d = docs.find((x) => x.id === docDetailId);
  if (!d) return null;
  const owner = profiles.find((p) => p.id === d.owner_id);
  const today = new Date().toISOString().slice(0, 10);
  const reviewState = !d.review_date ? "none" : d.review_date < today ? "overdue" : new Date(d.review_date).getTime() - Date.now() < 21 * 86400000 ? "soon" : "ok";
  const review = !d.review_date ? "No review date" : reviewState === "overdue" ? "Review overdue" : `Review ${fmtShort(d.review_date)}`;
  const reviewColor = reviewState === "overdue" ? "var(--red)" : reviewState === "soon" ? "#B7791F" : "var(--sw-muted)";

  const versions = docVersions.filter((v) => v.doc_id === d.id).sort((a, b) => b.version_number - a.version_number);
  const latest = versions[0] as DocVersion | undefined;
  // Head review is gated to the reviewer chosen at submission; legacy versions
  // without one fall back to any head of the owning department.
  const iAmHead = !!me && (latest?.head_reviewer_id ? me.id === latest.head_reviewer_id : isDeptHead(me.id, d.department_id, deptHeads));
  const iAmAuditManager = isInternalAuditManager(me, departments, deptHeads);
  const iAmAudit = isInternalAudit(me, departments);
  const auditDept = internalAuditDept(departments);
  const auditManagerId = deptHeads.find((h) => h.unit_id === auditDept?.id)?.profile_id || null;
  const openVersion = versions.find((v) => v.id === d.current_version_id) || latest;

  const downloadFile = async (path: string) => {
    const { data } = await supabase.storage.from("sop-files").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const setReview = async (kind: "head" | "audit", status: "approved" | "revisions_requested", notePath: string | null) => {
    if (!latest || !me) return;
    setBusy(true);
    const patchFields = kind === "head"
      ? { head_status: status, head_by: me.id, head_at: new Date().toISOString(), head_note_path: notePath }
      : { audit_status: status, audit_by: me.id, audit_at: new Date().toISOString(), audit_note_path: notePath };
    await supabase.from("doc_versions").update(patchFields).eq("id", latest.id);
    const updatedVersion = { ...latest, ...patchFields };
    const newHeadStatus = kind === "head" ? status : latest.head_status;
    const newAuditStatus = kind === "audit" ? status : latest.audit_status;
    const fullyApproved = newHeadStatus === "approved" && newAuditStatus === "approved";
    let docPatch: Record<string, unknown> = {};
    if (status === "revisions_requested") {
      docPatch = { status: "Revisions requested" };
    } else if (fullyApproved) {
      docPatch = { status: "Active", current_version_id: latest.id };
    }
    if (Object.keys(docPatch).length) await supabase.from("docs").update(docPatch).eq("id", d.id);
    patch("docVersions", docVersions.map((v) => (v.id === latest.id ? updatedVersion : v)));
    if (Object.keys(docPatch).length) patch("docs", docs.map((x) => (x.id === d.id ? { ...x, ...docPatch } : x)));
    const kindLabelForAudit = kind === "head" ? "Department review" : "Internal Audit";
    const verdictForAudit = status === "approved" ? (fullyApproved ? "fully approved (now a Company SOP)" : "approved") : "requested revisions on";
    await logAudit(supabase, me.id, `${kindLabelForAudit}: ${verdictForAudit} v${latest.version_number} of`, d.title);
    // The submitter hears about every verdict; full approval announces the new Company SOP.
    if (latest.submitted_by && latest.submitted_by !== me.id) {
      const kindLabel = kind === "head" ? "Department review" : "Internal Audit";
      const verdict = status === "approved"
        ? (fullyApproved ? `"${d.title}" is fully approved — it's now a Company SOP` : `${kindLabel}: ${me.name} approved "${d.title}" v${latest.version_number}`)
        : `${kindLabel}: ${me.name} requested revisions on "${d.title}" v${latest.version_number}`;
      await notify(supabase, latest.submitted_by, null, verdict, "SOP review");
    }
    setRequestingRevisions(null);
    setNote("");
    setReviewNoteFile(null);
    setBusy(false);
  };

  const submitRevisionsRequest = async (kind: "head" | "audit") => {
    let notePath: string | null = null;
    if (reviewNoteFile && latest) {
      notePath = `${d.id}/review-${Date.now()}-${reviewNoteFile.name}`;
      await supabase.storage.from("sop-files").upload(notePath, reviewNoteFile);
    }
    await setReview(kind, "revisions_requested", notePath);
  };

  const submitRevision = async () => {
    if (!me || !revisionFile || !latest) return;
    setBusy(true);
    const path = `${d.id}/${Date.now()}-${revisionFile.name}`;
    await supabase.storage.from("sop-files").upload(path, revisionFile);
    let summary = note;
    try {
      const res = await fetch("/api/sansi/summarize-sop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: d.title, changeNote: note, isRevision: true }) });
      const j = await res.json();
      if (j.summary) summary = j.summary;
    } catch {}
    const due = new Date(); due.setDate(due.getDate() + 7);
    const reviewDue = due.toISOString().slice(0, 10);
    const headReviewerId = latest.head_reviewer_id; // same reviewer follows the revision
    const { data: version } = await supabase.from("doc_versions").insert({
      doc_id: d.id, version_number: latest.version_number + 1, file_path: path, file_name: revisionFile.name,
      submitted_by: me.id, change_note: note || null, ai_summary: summary,
      review_due: reviewDue, head_reviewer_id: headReviewerId,
    }).select().single();
    await supabase.from("docs").update({ status: "Under review" }).eq("id", d.id);
    if (version) patch("docVersions", [...docVersions, version]);
    patch("docs", docs.map((x) => (x.id === d.id ? { ...x, status: "Under review" } : x)));
    if (headReviewerId && headReviewerId !== me.id) {
      await notify(supabase, headReviewerId, null, `${me.name} submitted revision v${latest.version_number + 1} of "${d.title}" for your review — due ${fmtShort(reviewDue)}`, "SOP review");
    }
    if (auditManagerId && auditManagerId !== me.id && auditManagerId !== headReviewerId) {
      await notify(supabase, auditManagerId, null, `${me.name} submitted revision v${latest.version_number + 1} of "${d.title}" for Internal Audit review — due ${fmtShort(reviewDue)}`, "SOP review");
    }
    setNote("");
    setRevisionFile(null);
    setBusy(false);
  };

  const attachPlainFile = async () => {
    if (!me || !plainFile) return;
    setBusy(true);
    const path = `${d.id}/${Date.now()}-${plainFile.name}`;
    await supabase.storage.from("sop-files").upload(path, plainFile);
    const nextVersion = (latest?.version_number || 0) + 1;
    const { data: version } = await supabase.from("doc_versions").insert({
      doc_id: d.id, version_number: nextVersion, file_path: path, file_name: plainFile.name,
      submitted_by: me.id, head_status: "approved", audit_status: "approved",
    }).select().single();
    if (version) {
      await supabase.from("docs").update({ current_version_id: version.id }).eq("id", d.id);
      patch("docVersions", [...docVersions, version]);
      patch("docs", docs.map((x) => (x.id === d.id ? { ...x, current_version_id: version.id } : x)));
    }
    setPlainFile(null);
    setBusy(false);
  };

  return (
    <div style={overlay} onClick={() => setDocDetailId(null)}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label={d.title} onClick={(e) => e.stopPropagation()} style={{ ...panel, width: 560 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", color: (STATUS_TINT[d.status] || STATUS_TINT.Draft)[0], background: (STATUS_TINT[d.status] || STATUS_TINT.Draft)[1], padding: "3px 10px", borderRadius: 999 }}>{d.status}</span>
          {d.is_sop && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: "var(--crimson)" }}>SOP</span>}
          <div style={{ flex: 1 }} />
          <button onClick={() => setDocDetailId(null)} aria-label="Close" style={closeBtn}><IconX /></button>
        </div>
        <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{d.title}</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--sw-text-soft)", lineHeight: 1.6 }}>{d.excerpt}</p>
        <div style={{ display: "flex", gap: 18, marginBottom: 16, fontSize: 11.5, color: "var(--sw-muted)", fontWeight: 400, flexWrap: "wrap" }}>
          <span>{d.type}</span><span>{d.category}</span><span>Version {versions.length || d.version}</span>
          {!d.is_sop && <span style={{ color: reviewColor }}>{review}</span>}
        </div>
        {openVersion && (
          <button onClick={() => downloadFile(openVersion.file_path)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "11px 14px", borderRadius: 12, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", marginBottom: 12, boxShadow: "0 8px 20px rgba(122,13,32,.25)" }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.18)", fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              {(openVersion.file_name.split(".").pop() || "").toUpperCase().slice(0, 4)}
            </span>
            <span style={{ flex: 1, textAlign: "left", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Open file — {openVersion.file_name}</span>
            <span style={{ fontSize: 11, opacity: 0.85, flex: "none" }}>v{openVersion.version_number}{d.is_sop && d.current_version_id === openVersion.id ? " · approved" : ""}</span>
          </button>
        )}
        {!openVersion && <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--sw-muted)" }}>No file attached to this document.</p>}
        <button onClick={() => { if (owner) { setDocDetailId(null); openProfile(owner.id); } }} style={{ display: "flex", alignItems: "center", gap: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", borderRadius: 999, padding: "6px 14px 6px 6px", cursor: "pointer", marginBottom: 12 }}>
          <span style={{ width: 24, height: 24, borderRadius: 99, background: owner?.color || "#9A918A", color: "#fff", fontSize: 9.5, fontWeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>{owner ? initials(owner.name) : "?"}</span>
          <span style={{ fontSize: 12.5, fontWeight: 400 }}>{owner?.name || "—"}</span>
        </button>

        {!d.is_sop && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 8 }}>
              {openVersion ? "Replace file" : "Attach a file"}
            </div>
            <input type="file" onChange={(e) => setPlainFile(e.target.files?.[0] || null)} style={{ width: "100%", marginBottom: 10, fontSize: 12 }} />
            <button disabled={busy || !plainFile} onClick={attachPlainFile} style={{ padding: "7px 16px", borderRadius: 999, border: "none", background: plainFile ? "var(--crimson)" : "var(--sw-hair)", color: "#fff", fontSize: 12, cursor: plainFile ? "pointer" : "default" }}>
              {openVersion ? "Upload new version" : "Attach file"}
            </button>
          </div>
        )}

        {d.is_sop && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 8 }}>Version history</div>
            {versions.map((v) => {
              const submitter = profiles.find((p) => p.id === v.submitted_by);
              const headBy = profiles.find((p) => p.id === v.head_by);
              const auditBy = profiles.find((p) => p.id === v.audit_by);
              const isLatest = v.id === latest?.id;
              return (
                <div key={v.id} style={{ border: "1px solid var(--sw-hair)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>v{v.version_number}</span>
                    <span style={{ fontSize: 11, color: "var(--sw-muted)", flex: 1 }}>{submitter?.name || "—"} · {relTime(v.submitted_at)}</span>
                    <button onClick={() => downloadFile(v.file_path)} style={{ border: "1px solid var(--sw-hair)", background: "none", borderRadius: 999, padding: "3px 10px", fontSize: 10.5, cursor: "pointer", color: "var(--sw-text-soft)" }}>Download</button>
                  </div>
                  {v.ai_summary && <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--sw-text-soft)", lineHeight: 1.5 }}>{v.ai_summary}</p>}
                  <div style={{ display: "flex", gap: 16, fontSize: 11, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ color: REVIEW_COLOR[v.head_status] }}>Reviewer: {REVIEW_LABEL[v.head_status]}{headBy ? ` (${headBy.name})` : v.head_reviewer_id ? ` — ${profiles.find((p) => p.id === v.head_reviewer_id)?.name || "?"}` : ""}</span>
                    <span style={{ color: REVIEW_COLOR[v.audit_status] }}>Internal Audit: {REVIEW_LABEL[v.audit_status]}{auditBy ? ` (${auditBy.name})` : ""}</span>
                  </div>
                  {v.review_due && (v.head_status === "pending" || v.audit_status === "pending") && isLatest && (
                    <div style={{ fontSize: 11, marginBottom: 8, color: v.review_due < today ? "var(--red)" : "var(--sw-muted)" }}>
                      Review due {fmtShort(v.review_due)}{v.review_due < today ? " — overdue" : ""}
                    </div>
                  )}
                  {isLatest && v.head_note_path && <button onClick={() => downloadFile(v.head_note_path!)} style={{ border: "none", background: "none", color: "var(--crimson)", cursor: "pointer", fontSize: 11, padding: 0, marginRight: 12 }}>Head's annotated file →</button>}
                  {isLatest && v.audit_note_path && <button onClick={() => downloadFile(v.audit_note_path!)} style={{ border: "none", background: "none", color: "var(--crimson)", cursor: "pointer", fontSize: 11, padding: 0 }}>Audit's annotated file →</button>}

                  {isLatest && iAmHead && v.head_status === "pending" && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button disabled={busy} onClick={() => setReview("head", "approved", null)} style={{ padding: "5px 12px", borderRadius: 999, border: "none", background: "var(--green)", color: "#fff", fontSize: 11, cursor: "pointer" }}>Approve (Head)</button>
                      <button disabled={busy} onClick={() => setRequestingRevisions(requestingRevisions === "head" ? null : "head")} style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid var(--red)", background: "none", color: "var(--red)", fontSize: 11, cursor: "pointer" }}>Request revisions</button>
                    </div>
                  )}
                  {isLatest && iAmAuditManager && v.audit_status === "pending" && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button disabled={busy} onClick={() => setReview("audit", "approved", null)} style={{ padding: "5px 12px", borderRadius: 999, border: "none", background: "var(--green)", color: "#fff", fontSize: 11, cursor: "pointer" }}>Approve (Audit)</button>
                      <button disabled={busy} onClick={() => setRequestingRevisions(requestingRevisions === "audit" ? null : "audit")} style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid var(--red)", background: "none", color: "var(--red)", fontSize: 11, cursor: "pointer" }}>Request revisions</button>
                    </div>
                  )}
                  {isLatest && requestingRevisions === "head" && iAmHead && (
                    <div style={{ marginTop: 8 }}>
                      <input type="file" onChange={(e) => setReviewNoteFile(e.target.files?.[0] || null)} style={{ fontSize: 11.5, marginBottom: 6, width: "100%" }} />
                      <p style={{ margin: "0 0 6px", fontSize: 10.5, color: "var(--sw-muted)" }}>Optional — upload the file back with your comments/track-changes in it.</p>
                      <button disabled={busy} onClick={() => submitRevisionsRequest("head")} style={{ padding: "5px 12px", borderRadius: 999, border: "none", background: "var(--red)", color: "#fff", fontSize: 11, cursor: "pointer" }}>Send revision request</button>
                    </div>
                  )}
                  {isLatest && requestingRevisions === "audit" && iAmAuditManager && (
                    <div style={{ marginTop: 8 }}>
                      <input type="file" onChange={(e) => setReviewNoteFile(e.target.files?.[0] || null)} style={{ fontSize: 11.5, marginBottom: 6, width: "100%" }} />
                      <p style={{ margin: "0 0 6px", fontSize: 10.5, color: "var(--sw-muted)" }}>Optional — upload the file back with your comments/track-changes in it.</p>
                      <button disabled={busy} onClick={() => submitRevisionsRequest("audit")} style={{ padding: "5px 12px", borderRadius: 999, border: "none", background: "var(--red)", color: "#fff", fontSize: 11, cursor: "pointer" }}>Send revision request</button>
                    </div>
                  )}
                  {!isLatest && iAmAudit && <p style={{ margin: "8px 0 0", fontSize: 10.5, color: "var(--sw-muted)" }}>Superseded.</p>}
                </div>
              );
            })}

            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--sw-muted)", margin: "16px 0 8px" }}>Submit a revision</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why?" style={{ width: "100%", height: 56, resize: "vertical", borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "8px 10px", fontSize: 12.5, color: "var(--sw-text)", outline: "none", marginBottom: 8 }} />
            <input type="file" accept=".doc,.docx,.ppt,.pptx,.pdf" onChange={(e) => setRevisionFile(e.target.files?.[0] || null)} style={{ width: "100%", marginBottom: 10, fontSize: 12 }} />
            <button disabled={busy || !revisionFile || !note.trim()} onClick={submitRevision} style={{ padding: "7px 16px", borderRadius: 999, border: "none", background: revisionFile && note.trim() ? "var(--crimson)" : "var(--sw-hair)", color: "#fff", fontSize: 12, cursor: revisionFile && note.trim() ? "pointer" : "default" }}>Submit revised file for review</button>
          </>
        )}
      </div>
    </div>
  );
}
