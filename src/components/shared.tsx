"use client";
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { initials, Profile, STATUS_COLORS } from "@/lib/types";
import { relTime, fmtShort } from "@/lib/dates";
import { efficiencyScore, tasksOfPerson, isOpen, isOverdue, onTimeStats } from "@/lib/logic";
import { IconBell, IconMoon, IconSparkle, IconSun, IconWhatsApp, IconX } from "./icons";
import { AvatarUploadButton } from "./avatar-upload";
import { createTask } from "@/lib/actions";
import { useFocusTrap } from "@/lib/a11y";

export function Avatar({
  person, size = 26, fontSize, onClick, border, ring,
}: {
  person: { name: string; color: string; avatar_url?: string | null };
  size?: number;
  fontSize?: number;
  onClick?: (e: React.MouseEvent) => void;
  border?: string;
  ring?: boolean; // department heads and above get a bold ring — rank at a glance
}) {
  const style: React.CSSProperties = {
    width: size, height: size, borderRadius: 99, background: person.avatar_url ? undefined : person.color, color: "#fff",
    fontSize: fontSize || Math.round(size * 0.38), fontWeight: 400,
    display: "flex", alignItems: "center", justifyContent: "center", flex: "none",
    border: border || (ring ? "2px solid var(--crimson)" : "none"),
    boxShadow: ring && !border ? "0 0 0 1.5px var(--sw-card)" : undefined,
    cursor: onClick ? "pointer" : undefined, padding: 0, overflow: "hidden",
  };
  const content = person.avatar_url
    ? <img src={person.avatar_url} alt={person.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    : initials(person.name);
  if (onClick)
    return (
      <button onClick={onClick} title="View profile" style={style}>
        {content}
      </button>
    );
  return <span style={style}>{content}</span>;
}

/* ---------- Sansi popover (real Gemini via /api/sansi) ---------- */
interface SansiAction {
  type: "create_task";
  args: {
    name: string; assignee_id: string; assignee_name: string; due: string | null; priority: string;
    personal: boolean;
    accountable_id: string | null; accountable_name: string | null;
    accountable_candidates: { id: string; name: string }[] | null;
  };
}
interface SansiMessage {
  role: "user" | "assistant";
  text: string;
  action?: SansiAction;
  actionState?: "pending" | "confirmed" | "dismissed";
}

export function SansiPopover({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { me, tasks, patch, supabase } = store;
  const { pushToast } = useUI();
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<SansiMessage[]>([]);
  const [thinking, setThinking] = useState(false);

  const submit = async () => {
    const q = query.trim();
    if (!q || !me) return;
    setQuery("");
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((cur) => [...cur, { role: "user", text: q }]);
    setThinking(true);
    try {
      const res = await fetch("/api/sansi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, history }),
      });
      const data = await res.json();
      setMessages((cur) => [...cur, {
        role: "assistant",
        text: data.reply || "Sorry — I couldn't answer that right now.",
        action: data.action,
        actionState: data.action ? "pending" : undefined,
      }]);
    } catch {
      setMessages((cur) => [...cur, { role: "assistant", text: "Sansi hit a network snag — try again in a moment." }]);
    }
    setThinking(false);
  };

  const setDraftAccountable = (idx: number, accountable_id: string) => {
    setMessages((cur) => cur.map((m, i) => {
      if (i !== idx || !m.action) return m;
      const name = m.action.args.accountable_candidates?.find((c) => c.id === accountable_id)?.name || null;
      return { ...m, action: { ...m.action, args: { ...m.action.args, accountable_id, accountable_name: name } } };
    }));
  };

  const confirmAction = async (idx: number, action: SansiAction) => {
    if (!me) return;
    if (!action.args.personal && !action.args.accountable_id) return; // Accountable is required once R isn't the asker themself
    const created = await createTask(supabase, tasks, patch, {
      name: action.args.name,
      list_id: null,
      owner_id: me.id,
      assignee_id: action.args.assignee_id,
      accountable_id: action.args.personal ? null : action.args.accountable_id,
      due: action.args.due,
      priority: action.args.priority,
    });
    setMessages((cur) => cur.map((m, i) => (i === idx ? { ...m, actionState: created ? "confirmed" : "dismissed" } : m)));
    if (created) pushToast(`Task "${created.name}" created`);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", top: 38, right: 0, width: 340, maxHeight: 480, display: "flex", flexDirection: "column", background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "0 20px 60px rgba(23,18,15,.2)", zIndex: 60, padding: 14 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flex: "none" }}>
        <span style={{ display: "inline-flex", color: "var(--crimson)" }}><IconSparkle size={13} /></span>
        <b style={{ fontSize: 12.5 }}>Sansi AI</b>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ border: "none", background: "none", color: "var(--sw-text-soft)", cursor: "pointer", fontSize: 12 }}><IconX /></button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", marginBottom: 10 }}>
        {!messages.length && (
          <div style={{ background: "var(--sw-hover)", borderRadius: 9, padding: "10px 12px", fontSize: 12, color: "var(--sw-text-soft)", lineHeight: 1.5 }}>
            Ask me to summarize your workload, look up who's responsible for something, or create a task — just describe it.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div
              style={{
                background: m.role === "user" ? "var(--sw-hover)" : "rgba(122,13,32,0.06)",
                borderRadius: 9, padding: "9px 12px", fontSize: 12, color: "var(--sw-text)", lineHeight: 1.5, whiteSpace: "pre-wrap",
              }}
            >
              {m.text}
            </div>
            {m.action && (
              <div style={{ border: "1px solid var(--sw-hair)", borderRadius: 9, padding: "9px 12px", marginTop: 6, background: "var(--sw-card)" }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3 }}>{m.action.args.name}</div>
                <div style={{ fontSize: 11, color: "var(--sw-muted)", marginBottom: 8 }}>
                  R: {m.action.args.assignee_name} · {m.action.args.priority}{m.action.args.due ? ` · due ${m.action.args.due}` : ""}
                </div>
                {!m.action.args.personal && m.actionState === "pending" && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginBottom: 3 }}>A — Accountable (pick one, never auto-filled)</div>
                    <select
                      className="sw-select"
                      value={m.action.args.accountable_id || ""}
                      onChange={(e) => setDraftAccountable(i, e.target.value)}
                      style={{ width: "100%", height: 28, borderRadius: 7, border: `1px solid ${m.action.args.accountable_id ? "var(--sw-hair)" : "var(--crimson)"}`, background: "var(--sw-hover)", fontSize: 11.5, color: "var(--sw-text)", padding: "0 6px" }}
                    >
                      <option value="">Select who's accountable…</option>
                      {m.action.args.accountable_candidates?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {m.actionState === "pending" ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => confirmAction(i, m.action!)}
                      disabled={!m.action.args.personal && !m.action.args.accountable_id}
                      style={{ flex: 1, height: 28, borderRadius: 999, border: "none", background: (!m.action.args.personal && !m.action.args.accountable_id) ? "var(--sw-hair)" : "var(--crimson)", color: "#fff", fontSize: 11.5, cursor: (!m.action.args.personal && !m.action.args.accountable_id) ? "not-allowed" : "pointer" }}
                    >
                      Create task
                    </button>
                    <button onClick={() => setMessages((cur) => cur.map((x, j) => (j === i ? { ...x, actionState: "dismissed" } : x)))} style={{ flex: 1, height: 28, borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", color: "var(--sw-text-soft)", fontSize: 11.5, cursor: "pointer" }}>Not now</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: m.actionState === "confirmed" ? "var(--green)" : "var(--sw-muted)" }}>
                    {m.actionState === "confirmed" ? "✓ Created" : "Dismissed"}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {thinking && <div style={{ fontSize: 11.5, color: "var(--sw-muted)" }}>Thinking…</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flex: "none" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="Ask Sansi…"
          style={{ flex: 1, height: 34, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 10px", fontSize: 12, color: "var(--sw-text)", outline: "none" }}
        />
        <button onClick={submit} disabled={thinking} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>
          Send
        </button>
      </div>
    </div>
  );
}

/* ---------- Notifications popover ---------- */
export function NotifPopover({ onClose }: { onClose: () => void }) {
  const { notifications, tasks } = useStore();
  const { setSection, setWorkspacePage, setActiveTaskId } = useUI();
  const preview = notifications.slice(0, 3);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", top: 38, right: 0, width: 320, background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "0 20px 60px rgba(23,18,15,.2)", zIndex: 60, overflow: "hidden" }}
    >
      <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--sw-hair)", fontSize: 12.5, fontWeight: 400 }}>Notifications</div>
      {preview.map((n) => (
        <button
          key={n.id}
          className="sw-row"
          onClick={() => {
            onClose();
            if (n.task_id && tasks.some((t) => t.id === n.task_id)) setActiveTaskId(n.task_id);
          }}
          style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", padding: "10px 14px", borderBottom: "1px solid var(--sw-hair)", cursor: "pointer", fontSize: 12, color: "var(--sw-text)" }}
        >
          {n.body}
          <div style={{ fontSize: 10.5, color: "var(--sw-muted)", marginTop: 2 }}>{relTime(n.created_at)}</div>
        </button>
      ))}
      <a
        href="#"
        onClick={(e) => { e.preventDefault(); onClose(); setSection("workspace"); setWorkspacePage("inbox"); }}
        style={{ display: "block", textAlign: "center", padding: 9, fontSize: 11.5, fontWeight: 400, color: "var(--crimson)", textDecoration: "none" }}
      >
        View all in Inbox →
      </a>
    </div>
  );
}

/* ---------- Topbar icon cluster: Sansi + theme + notifications ---------- */
export function TopIcons() {
  const { theme, toggleTheme } = useUI();
  const { notifications } = useStore();
  const [showSansi, setShowSansi] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <>
      <div style={{ position: "relative" }}>
        <button
          onClick={() => { setShowSansi((v) => !v); setShowNotif(false); }}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--sw-hover)", color: "var(--sw-text-soft)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 400, cursor: "pointer" }}
        >
          <IconSparkle /> Sansi
        </button>
        {showSansi && <SansiPopover onClose={() => setShowSansi(false)} />}
      </div>
      <button
        onClick={toggleTheme}
        title="Toggle theme"
        style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}
      >
        {theme === "dark" ? <IconSun /> : <IconMoon />}
      </button>
      <div style={{ position: "relative" }}>
        <button
          onClick={() => { setShowNotif((v) => !v); setShowSansi(false); }}
          style={{ position: "relative", width: 30, height: 30, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}
        >
          <IconBell />
          {unread > 0 && (
            <span style={{ position: "absolute", top: -3, right: -3, background: "var(--red)", color: "#fff", fontSize: 9, fontWeight: 400, width: 14, height: 14, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {unread}
            </span>
          )}
        </button>
        {showNotif && <NotifPopover onClose={() => setShowNotif(false)} />}
      </div>
    </>
  );
}

/* ---------- Toasts ---------- */
export function Toasts() {
  const { toasts, dismissToast } = useUI();
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", zIndex: 92, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--sw-text)", color: "var(--sw-page)", borderRadius: 999, padding: "9px 18px", boxShadow: "0 14px 40px rgba(23,18,15,0.35)", fontSize: 12.5, animation: "swModalIn .18s ease" }}>
          {t.strip && (
            <span style={{ display: "flex", width: 38, height: 5, borderRadius: 99, overflow: "hidden", animation: "swStripIn .5s ease" }}>
              <span style={{ flex: 1, background: "#7A0D20" }} /><span style={{ flex: 1, background: "#22409E" }} /><span style={{ flex: 1, background: "#0D4F31" }} /><span style={{ flex: 1, background: "#F3263E" }} /><span style={{ flex: 1, background: "#BDDA5F" }} />
            </span>
          )}
          <span>{t.msg}</span>
          {t.undo && (
            <button onClick={() => { t.undo!(); dismissToast(t.id); }} style={{ border: "none", background: "none", color: "#BDDA5F", fontSize: 12.5, fontWeight: 400, cursor: "pointer", padding: 0 }}>
              Undo
            </button>
          )}
          <button onClick={() => dismissToast(t.id)} style={{ border: "none", background: "none", color: "var(--sw-page)", opacity: 0.6, cursor: "pointer", fontSize: 11, padding: 0 }}>
            <IconX />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Profile modal ---------- */
export function ProfileModal() {
  const { profileTarget, openProfile, viewerLevel, setViewerLevel, setMetricModal } = useUI();
  const { me, profiles, departments, tasks, permissionTemplates, features, supabase, patch } = useStore();
  const p = profiles.find((x) => x.id === profileTarget);
  const trapRef = useFocusTrap(!!p);
  if (!p) return null;
  const canManage = !!me?.is_super || me?.level_id === "l1" || me?.level_id === "l2";
  const overrideAbilities = p.permission_overrides?.abilities || {};
  const dept = departments.find((d) => d.id === p.department_id);
  const manager = profiles.find((x) => x.id === p.manager_id);
  const reports = profiles.filter((x) => x.manager_id === p.id);
  const personTasks = tasksOfPerson(tasks, p.id);
  const open = personTasks.filter(isOpen);
  const overdue = open.filter(isOverdue);
  const { onTime, total } = onTimeStats(personTasks);
  const eff = efficiencyScore(personTasks);
  const joined = p.joined_at
    ? (() => {
        const d = new Date(p.joined_at);
        const months = Math.floor((Date.now() - d.getTime()) / (30.44 * 86400000));
        return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · ${Math.floor(months / 12)}y ${months % 12}mo tenure`;
      })()
    : "—";
  const showAdmin = viewerLevel === "admin";
  const waDigits = (p.wa_number || p.phone || "").replace(/[^0-9]/g, "");
  const lastLogin = p.last_login ? relTime(p.last_login) : "—";

  const row = (label: string, value: React.ReactNode) => (
    <React.Fragment key={label}>
      <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)" }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 400 }}>{value}</span>
    </React.Fragment>
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={() => openProfile(null)}
    >
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label={p.name} onClick={(e) => e.stopPropagation()} className="sw-modal-card" style={{ width: 420, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: 0, animation: "swModalIn .22s var(--ease-brand)" }}>
        <div style={{ position: "relative", background: "var(--sw-sidebar)", padding: "24px 24px 18px", borderBottom: "1px solid var(--sw-hair)" }}>
          <button onClick={() => openProfile(null)} aria-label="Close" style={{ position: "absolute", top: 14, right: 14, border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ position: "relative", width: 64, height: 64, borderRadius: 99, overflow: "hidden", flex: "none", border: "2px solid var(--sw-card)", boxShadow: "var(--shadow-card)" }}>
              {p.avatar_url ? (
                <img src={p.avatar_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, background: p.color, color: "#fff", fontSize: 20, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(p.name)}</div>
              )}
              {(me?.id === p.id || me?.is_super) && (
                <div style={{ position: "absolute", inset: 0 }}><AvatarUploadButton profileId={p.id} /></div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 400 }}>{p.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--sw-text-soft)", fontWeight: 400 }}>{p.role_title} · {dept?.name || "—"}</div>
            </div>
          </div>
        </div>
        <div style={{ padding: "18px 24px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "8px 10px", borderRadius: 9, background: "var(--sw-hover)", border: "1px solid var(--sw-hair)" }}>
            <span style={{ fontSize: 11.5, color: "var(--sw-muted)", fontWeight: 400 }}>Preview as viewer:</span>
            {(["staff", "admin"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewerLevel(v)}
                style={{ padding: "4px 11px", borderRadius: 999, border: `1px solid ${viewerLevel === v ? "var(--crimson)" : "var(--sw-hair)"}`, background: viewerLevel === v ? "var(--crimson)" : "none", color: viewerLevel === v ? "#fff" : "var(--sw-text-soft)", fontSize: 11.5, fontWeight: 400, cursor: "pointer" }}
              >
                {v === "staff" ? "Staff" : "Space Admin"}
              </button>
            ))}
          </div>
          <div className="sw-grid-label" style={{ gap: "11px 10px", marginBottom: 6 }}>
            {row("Email", p.email)}
            {row("Phone", p.phone || "—")}
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)" }} />
            <a
              href={waDigits ? `https://wa.me/${waDigits}` : "#"}
              target="_blank"
              rel="noopener"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", color: "var(--green)", fontSize: 12.5, fontWeight: 400, marginTop: -2 }}
            >
              <IconWhatsApp /> Message on WhatsApp
            </a>
            {row("Location", p.location || "—")}
            {row("Reports to", manager ? manager.name : "— (Department Head)")}
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)" }}>Efficiency</span>
            <button
              onClick={() => setMetricModal({ title: `${p.name} — efficiency breakdown`, taskIds: personTasks.map((t) => t.id) })}
              style={{ border: "none", background: "none", padding: 0, fontSize: 12.5, fontWeight: 400, color: eff.color, textDecoration: "underline", cursor: "pointer", textAlign: "left" }}
            >
              {eff.score}%
            </button>
            {row("Direct reports", reports.length ? reports.map((r) => r.name).join(", ") : "—")}
            {row("Joined", joined)}
          </div>
          {showAdmin && (
            <>
              <div style={{ height: 1, background: "var(--sw-hair)", margin: "14px 0" }} />
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 10 }}>
                Visible to Space Admins & Super Admin only
              </div>
              <div className="sw-grid-2" style={{ gap: 10, marginBottom: 12 }}>
                <div style={{ background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 17, fontWeight: 400 }}>{open.length}</div>
                  <div style={{ fontSize: 11, color: "var(--sw-muted)", fontWeight: 400 }}>Open tasks</div>
                </div>
                <div style={{ background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 17, fontWeight: 400, color: "var(--green)" }}>{total ? Math.round((onTime / total) * 100) : 100}%</div>
                  <div style={{ fontSize: 11, color: "var(--sw-muted)", fontWeight: 400 }}>On-time completion</div>
                </div>
              </div>
              <div className="sw-grid-label" style={{ gap: "11px 10px" }}>
                {row("Overdue rate", `${open.length ? Math.round((overdue.length / open.length) * 100) : 0}%`)}
                <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sw-muted)" }}>Account status</span>
                <span style={{ fontSize: 12.5, fontWeight: 400, color: "var(--green)" }}>● Active</span>
                {row("Last login", lastLogin)}
              </div>
            </>
          )}
          {canManage && (
            <>
              <div style={{ height: 1, background: "var(--sw-hair)", margin: "14px 0" }} />
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 10 }}>
                Permissions &amp; capacity — super admin only
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, color: "var(--sw-muted)", marginBottom: 4 }}>Permission template</div>
                <select
                  className="sw-select"
                  value={p.template_id || ""}
                  onChange={async (e) => {
                    const template_id = e.target.value || null;
                    patch("profiles", profiles.map((x) => (x.id === p.id ? { ...x, template_id } : x)));
                    await supabase.from("profiles").update({ template_id }).eq("id", p.id);
                  }}
                  style={{ height: 30, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11.5, color: "var(--sw-text-soft)", padding: "0 8px", width: "100%" }}
                >
                  <option value="">No template</option>
                  {permissionTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, color: "var(--sw-muted)", marginBottom: 4 }}>
                  Overrides {p.permission_overrides && <span style={{ color: "var(--crimson)" }}>· differs from template</span>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {[["approve_extensions", "Approve extensions"], ["manage_org", "Manage org"], ["manage_people", "Manage people"], ["view_company_reports", "Company reports"]].map(([key, lbl]) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
                      <input
                        type="checkbox"
                        checked={!!overrideAbilities[key]}
                        onChange={async (e) => {
                          const nextAbilities = { ...overrideAbilities, [key]: e.target.checked };
                          const permission_overrides = { ...(p.permission_overrides || {}), abilities: nextAbilities };
                          patch("profiles", profiles.map((x) => (x.id === p.id ? { ...x, permission_overrides } : x)));
                          await supabase.from("profiles").update({ permission_overrides }).eq("id", p.id);
                        }}
                      />
                      {lbl}
                    </label>
                  ))}
                </div>
              </div>
              {features.capacity_tracking && (
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--sw-muted)", marginBottom: 4 }}>Capacity (points/week)</div>
                  <input
                    type="number"
                    min={1}
                    defaultValue={p.capacity_points ?? 20}
                    onBlur={async (e) => {
                      const capacity_points = Number(e.target.value) || 20;
                      patch("profiles", profiles.map((x) => (x.id === p.id ? { ...x, capacity_points } : x)));
                      await supabase.from("profiles").update({ capacity_points }).eq("id", p.id);
                    }}
                    style={{ height: 30, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11.5, color: "var(--sw-text)", padding: "0 8px", width: 90 }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Metric detail modal (shared) ---------- */
export function MetricModal() {
  const { metricModal, setMetricModal, setActiveTaskId } = useUI();
  const { tasks } = useStore();
  const trapRef = useFocusTrap(!!metricModal);
  if (!metricModal) return null;
  const rows = tasks.filter((t) => metricModal.taskIds.includes(t.id));
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.45)", backdropFilter: "blur(2px)", zIndex: 58, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={() => setMetricModal(null)}
    >
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label={metricModal.title} onClick={(e) => e.stopPropagation()} className="sw-modal-card" style={{ width: 460, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto", background: "var(--sw-card)", borderRadius: 16, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: "22px 24px", animation: "swModalIn .18s ease" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 400, flex: 1 }}>{metricModal.title}</h3>
          <button onClick={() => setMetricModal(null)} aria-label="Close" style={{ border: "none", background: "var(--sw-hover)", width: 26, height: 26, borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--sw-text-soft)" }}><IconX /></button>
        </div>
        {rows.map((t) => (
          <button
            key={t.id}
            className="sw-row"
            onClick={() => { setMetricModal(null); setActiveTaskId(t.id); }}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 2px", border: "none", borderBottom: "1px solid var(--sw-hair)", background: "none", cursor: "pointer" }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLORS[t.status], flex: "none" }} />
            <span style={{ flex: 1, fontSize: 12.5, color: "var(--sw-text)" }}>{t.name}</span>
            <span style={{ fontSize: 11.5, color: "var(--sw-muted)" }}>{t.due ? fmtShort(t.due) : ""}</span>
          </button>
        ))}
        {!rows.length && <p style={{ margin: 0, fontSize: 12, color: "var(--sw-muted)" }}>Nothing to show.</p>}
      </div>
    </div>
  );
}

/* ---------- click-away hook ---------- */
export function useClickAway(onAway: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onAway]);
  return ref;
}
