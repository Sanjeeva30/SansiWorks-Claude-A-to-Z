"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";

/* ---------- Command palette ---------- */
export function CommandPalette() {
  const { showPalette, setShowPalette, setSection, setListPage, setCompanyPage, setWorkspacePage, setActiveTaskId, setActiveList, setShowQuickAdd } = useUI();
  const { tasks, profiles, docs, lists, spaces } = useStore();
  const { openProfile } = useUI();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showPalette) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [showPalette]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { group: string; label: string; sub: string; run: () => void }[] = [];
    const pages: [string, () => void][] = [
      ["Home", () => setSection("home")],
      ["My List", () => { setSection("list"); setListPage("mylist"); }],
      ["Everything", () => { setSection("list"); setListPage("everything"); }],
      ["Overview", () => { setSection("company"); setCompanyPage("executive"); }],
      ["People", () => { setSection("company"); setCompanyPage("people"); }],
      ["Inbox", () => { setSection("workspace"); setWorkspacePage("inbox"); }],
      ["Docs", () => { setSection("workspace"); setWorkspacePage("docs"); }],
      ["Forms", () => { setSection("workspace"); setWorkspacePage("forms"); }],
      ["Settings", () => { setSection("workspace"); setWorkspacePage("settings"); }],
      ["Admin console", () => { setSection("workspace"); setWorkspacePage("admin"); }],
      ["New task", () => setShowQuickAdd(true)],
    ];
    for (const [label, run] of pages) {
      if (!q || label.toLowerCase().includes(q)) out.push({ group: "Page", label, sub: "", run });
    }
    if (q) {
      for (const t of tasks.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 6)) {
        const l = lists.find((x) => x.id === t.list_id);
        const s = spaces.find((x) => x.id === l?.space_id);
        out.push({ group: "Task", label: t.name, sub: l ? `${s?.name} / ${l.name}` : "My List", run: () => setActiveTaskId(t.id) });
      }
      for (const p of profiles.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4)) {
        out.push({ group: "Person", label: p.name, sub: p.role_title || "", run: () => openProfile(p.id) });
      }
      for (const d of docs.filter((d) => d.title.toLowerCase().includes(q)).slice(0, 4)) {
        out.push({ group: "Doc", label: d.title, sub: d.category || "", run: () => { setSection("workspace"); setWorkspacePage("docs"); } });
      }
      for (const l of lists.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 4)) {
        const s = spaces.find((x) => x.id === l.space_id);
        out.push({ group: "List", label: l.name, sub: s?.name || "", run: () => { setSection("list"); setListPage("list"); setActiveList({ spaceId: l.space_id, listId: l.id }); } });
      }
    }
    return out.slice(0, 10);
  }, [query, tasks, profiles, docs, lists, spaces]);

  useEffect(() => {
    if (!showPalette) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, items.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); const it = items[index]; if (it) { it.run(); setShowPalette(false); } }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPalette, items, index, setShowPalette]);

  if (!showPalette) return null;
  return (
    <div onClick={() => setShowPalette(false)} style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.4)", backdropFilter: "blur(2px)", zIndex: 85, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "14vh" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", background: "var(--sw-card)", borderRadius: 14, boxShadow: "0 30px 90px rgba(23,18,15,0.4)", overflow: "hidden", animation: "swModalIn .15s ease" }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
          placeholder="Search tasks, people, docs, pages…"
          style={{ width: "100%", boxSizing: "border-box", height: 48, border: "none", borderBottom: "1px solid var(--sw-hair)", background: "transparent", padding: "0 18px", fontSize: 14, color: "var(--sw-text)", outline: "none" }}
        />
        <div style={{ maxHeight: 340, overflowY: "auto", padding: 6 }}>
          {items.map((i, idx) => (
            <button
              key={`${i.group}-${i.label}`}
              onClick={() => { i.run(); setShowPalette(false); }}
              onMouseEnter={() => setIndex(idx)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderRadius: 8, background: idx === index ? "var(--sw-hover)" : "transparent", cursor: "pointer" }}
            >
              <span style={{ fontSize: 9.5, fontWeight: 400, color: "var(--sw-muted)", width: 46, flex: "none", textTransform: "uppercase", letterSpacing: "0.06em" }}>{i.group}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--sw-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.label}</span>
              <span style={{ fontSize: 11, color: "var(--sw-muted)", flex: "none", maxWidth: 170, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.sub}</span>
            </button>
          ))}
          {!items.length && <p style={{ margin: 14, fontSize: 12.5, color: "var(--sw-muted)" }}>No matches.</p>}
        </div>
        <div style={{ display: "flex", gap: 14, padding: "8px 16px", borderTop: "1px solid var(--sw-hair)", fontSize: 10.5, color: "var(--sw-muted)" }}>
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span><span style={{ marginLeft: "auto" }}>Tip: press N anywhere for a new task</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Public request portal (overlay variant, from Forms page) ---------- */
export function PublicPortal() {
  const { showPortal, setShowPortal } = useUI();
  const { forms, lists, spaces, supabase } = useStore();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [refNo, setRefNo] = useState("");
  const [copied, setCopied] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  if (!showPortal) return null;

  const active = forms.filter((f) => f.active);
  const current = active.find((f) => f.id === currentId);
  const deptOf = (listId: string | null) => {
    const l = lists.find((x) => x.id === listId);
    const s = spaces.find((x) => x.id === l?.space_id);
    return s?.name || "General";
  };

  const submit = async () => {
    if (!current) return;
    await supabase.from("form_submissions").insert({ form_id: current.id, answers });
    setRefNo(`SW-${Math.floor(1000 + Math.random() * 9000)}`);
    setSent(true);
    setAnswers({});
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 82, background: "var(--sw-page)", overflowY: "auto" }}>
      <div style={{ display: "flex", height: 4 }}>
        <span style={{ flex: 1, background: "#7A0D20" }} /><span style={{ flex: 1, background: "#22409E" }} /><span style={{ flex: 1, background: "#0D4F31" }} /><span style={{ flex: 1, background: "#F3263E" }} /><span style={{ flex: 1, background: "#BDDA5F" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 28px", borderBottom: "1px solid var(--sw-hair)", background: "var(--sw-card)" }}>
        <span style={{ fontWeight: 800, letterSpacing: "0.07em", fontSize: 12, color: "var(--crimson)" }}>SANSICO</span>
        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--sw-text-soft)" }}>Group</span>
        <span style={{ fontSize: 12, color: "var(--sw-muted)", marginLeft: 6 }}>Request portal</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => {
            try { navigator.clipboard.writeText(`${window.location.origin}/portal`); } catch {}
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          style={{ padding: "7px 15px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text-soft)", fontSize: 12, fontWeight: 400, cursor: "pointer" }}
        >
          {copied ? "✓ Copied" : "Copy public link"}
        </button>
        <button onClick={() => { setShowPortal(false); setCurrentId(null); setSent(false); }} style={{ padding: "7px 15px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 12, fontWeight: 400, cursor: "pointer" }}>
          Back to SansiWorks
        </button>
      </div>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 28px 80px" }}>
        {current ? (
          sent ? (
            <div style={{ maxWidth: 520, margin: "40px auto", background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: 36, textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: 99, background: "rgba(13,79,49,0.1)", color: "var(--green)", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>✓</div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 26, margin: "0 0 8px" }}>Request <em style={{ fontStyle: "italic" }}>received</em>.</h2>
              <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--sw-text-soft)" }}>Your reference number is <b style={{ fontWeight: 800, color: "var(--sw-text)" }}>{refNo}</b>.</p>
              <p style={{ margin: "0 0 22px", fontSize: 12.5, color: "var(--sw-muted)" }}>The owning team has been notified in SansiWorks and will follow up on the contact you provided.</p>
              <button onClick={() => { setSent(false); setCurrentId(null); }} style={{ padding: "9px 22px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", color: "var(--sw-text)", fontSize: 12.5, fontWeight: 400, cursor: "pointer" }}>Submit another request</button>
            </div>
          ) : (
            <>
              <button onClick={() => setCurrentId(null)} style={{ border: "none", background: "none", color: "var(--crimson)", fontSize: 12.5, fontWeight: 400, cursor: "pointer", padding: 0, marginBottom: 18 }}>← All request types</button>
              <div style={{ maxWidth: 560, background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: "28px 30px" }}>
                <div style={{ display: "inline-block", fontSize: 10.5, fontWeight: 400, color: "var(--sw-text-soft)", background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "3px 11px", marginBottom: 10 }}>{deptOf(current.list_id)}</div>
                <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 26, margin: "0 0 18px" }}>{current.title}</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  {["Your name", "Company or facility", "Email or WhatsApp number"].map((label) => (
                    <label key={label} style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--sw-text-soft)" }}>
                      {label}
                      <input value={answers[label] || ""} onChange={(e) => setAnswers({ ...answers, [label]: e.target.value })} style={{ height: 36, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 12.5, color: "var(--sw-text)", outline: "none" }} />
                    </label>
                  ))}
                  {current.fields.map((f) => (
                    <label key={f.id} style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--sw-text-soft)" }}>
                      {f.label}
                      {f.type === "Paragraph" ? (
                        <textarea rows={4} value={answers[f.label] || ""} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.value })} style={{ borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "9px 12px", fontSize: 12.5, color: "var(--sw-text)", outline: "none", resize: "vertical" }} />
                      ) : (
                        <input value={answers[f.label] || ""} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.value })} style={{ height: 36, borderRadius: 9, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px", fontSize: 12.5, color: "var(--sw-text)", outline: "none" }} />
                      )}
                    </label>
                  ))}
                </div>
                <button onClick={submit} style={{ marginTop: 20, padding: "10px 26px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 13, fontWeight: 400, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.25)" }}>Send request</button>
              </div>
            </>
          )
        ) : (
          <>
            <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 38, margin: "0 0 8px", letterSpacing: "-0.01em" }}>How can we <em style={{ fontStyle: "italic" }}>help</em>?</h1>
            <p style={{ margin: "0 0 30px", fontSize: 14, color: "var(--sw-text-soft)", maxWidth: 520 }}>Submit a request to any Sansico team — vendors, facilities and partners welcome. No login needed; your request lands directly on the owning team&apos;s board.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {active.map((f) => (
                <button key={f.id} onClick={() => setCurrentId(f.id)} className="sw-card-h" style={{ textAlign: "left", background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 14, boxShadow: "var(--shadow-card)", padding: 20, cursor: "pointer" }}>
                  <div style={{ display: "inline-block", fontSize: 10, fontWeight: 400, color: "var(--sw-text-soft)", background: "var(--sw-hover)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "2px 10px", marginBottom: 10 }}>{deptOf(f.list_id)}</div>
                  <div style={{ fontSize: 15, fontWeight: 400, color: "var(--sw-text)", marginBottom: 6 }}>{f.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--sw-muted)" }}>{f.fields.length} questions · takes ~2 minutes</div>
                  <div style={{ marginTop: 12, fontSize: 12, fontWeight: 400, color: "var(--crimson)" }}>Open form →</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
