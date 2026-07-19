"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { searchWorkspace, getRecentSearches, pushRecentSearch, SearchHit } from "@/lib/search";
import { IconSearch } from "./icons";

/* Search-as-you-type box with grouped instant results. Used in the My Work topbar. */
export function GlobalSearch({ width = 340 }: { width?: number }) {
  const store = useStore();
  const { setActiveTaskId, openProfile, setActiveList, setDocDetailId, openDetail } = useUI();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hits = useMemo(() => (query.trim() ? searchWorkspace(query, store, 4) : []), [query, store]);

  const runHit = (h: SearchHit) => {
    pushRecentSearch(query || h.label);
    setOpen(false);
    setQuery("");
    switch (h.nav.kind) {
      case "task": setActiveTaskId(h.nav.id); break;
      case "person": openProfile(h.nav.id); break;
      case "doc": setDocDetailId(h.nav.id); break;
      case "form": openDetail("form", h.nav.id); break;
      case "list": setActiveList({ spaceId: h.nav.spaceId, listId: h.nav.listId }); break;
      case "run": h.nav.run(); break;
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const h = hits[index]; if (h) runHit(h); }
    else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  };

  const showRecents = open && !query.trim() && recents.length > 0;

  return (
    <div ref={boxRef} style={{ position: "relative", width, maxWidth: "42vw" }}>
      <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--sw-muted)", display: "flex", pointerEvents: "none" }}>
        <IconSearch size={12} />
      </span>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setIndex(0); setOpen(true); }}
        onFocus={() => { setOpen(true); setRecents(getRecentSearches()); }}
        onKeyDown={onKey}
        placeholder="Search tasks, docs, people…"
        style={{ width: "100%", height: 30, borderRadius: 8, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", padding: "0 12px 0 30px", fontSize: 12, color: "var(--sw-text)", outline: "none", boxSizing: "border-box" }}
      />
      {open && (query.trim() || showRecents) && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "0 22px 60px rgba(23,18,15,.25)", zIndex: 55, overflow: "hidden" }}>
          {showRecents && (
            <div style={{ padding: 6 }}>
              <div style={{ padding: "5px 10px 3px", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sw-muted)" }}>Recent</div>
              {recents.map((r) => (
                <button key={r} onClick={() => { setQuery(r); setIndex(0); }} className="sw-row" style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", border: "none", borderRadius: 7, background: "none", cursor: "pointer", fontSize: 12.5, color: "var(--sw-text-soft)" }}>
                  {r}
                </button>
              ))}
            </div>
          )}
          {query.trim() && (
            <div style={{ maxHeight: 330, overflowY: "auto", padding: 6 }}>
              {hits.map((h, i) => (
                <button
                  key={`${h.group}-${h.id}`}
                  onClick={() => runHit(h)}
                  onMouseEnter={() => setIndex(i)}
                  style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 8, background: i === index ? "var(--sw-hover)" : "transparent", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 9, fontWeight: 800, color: "var(--sw-muted)", width: 40, flex: "none", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h.group}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--sw-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.label}</span>
                  <span style={{ fontSize: 10.5, color: "var(--sw-muted)", flex: "none", maxWidth: 150, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.sub}</span>
                </button>
              ))}
              {!hits.length && <p style={{ margin: 10, fontSize: 12, color: "var(--sw-muted)" }}>No matches for &ldquo;{query}&rdquo;.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
