// Instant client-side search + smart filters.
// The whole workspace is already in the store, so search runs in-memory with a
// relevance scorer (exact > prefix > word-boundary > substring > fuzzy subsequence).
import { StoreData } from "./store";
import { Task } from "./types";

/* ---------------- scoring ---------------- */
export function scoreMatch(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 82;
  const wb = t.split(/[\s/\-_.]+/);
  if (wb.some((w) => w.startsWith(q))) return 70;
  const idx = t.indexOf(q);
  if (idx >= 0) return 55 - Math.min(15, idx * 0.5);
  // fuzzy subsequence: every query char appears in order
  let ti = 0;
  let gaps = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return 0;
    gaps += found - ti;
    ti = found + 1;
  }
  return Math.max(5, 30 - gaps * 1.5);
}

export interface SearchHit {
  group: "Task" | "Person" | "Doc" | "List" | "Form" | "Page" | "Action";
  id: string;
  label: string;
  sub: string;
  score: number;
  /* navigation payload interpreted by the caller */
  nav:
    | { kind: "task"; id: string }
    | { kind: "person"; id: string }
    | { kind: "doc" }
    | { kind: "list"; spaceId: string; listId: string }
    | { kind: "form" }
    | { kind: "run"; run: () => void };
}

export function searchWorkspace(query: string, store: StoreData, limitPerGroup = 5): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits: SearchHit[] = [];

  for (const t of store.tasks) {
    const idLabel = `SW-${t.task_number}`;
    const s = Math.max(
      scoreMatch(q, t.name),
      q.toUpperCase() === idLabel || q === String(t.task_number) ? 100 : 0,
      t.description ? scoreMatch(q, t.description) * 0.6 : 0
    );
    if (s > 12) {
      const l = store.lists.find((x) => x.id === t.list_id);
      const sp = store.spaces.find((x) => x.id === l?.space_id);
      hits.push({
        group: "Task", id: t.id, label: t.name,
        sub: `${idLabel} · ${l ? `${sp?.name} / ${l.name}` : "Personal"}`,
        score: s + (t.status !== "Done" ? 6 : 0),
        nav: { kind: "task", id: t.id },
      });
    }
  }
  for (const p of store.profiles) {
    const s = Math.max(scoreMatch(q, p.name), scoreMatch(q, p.email) * 0.8, p.role_title ? scoreMatch(q, p.role_title) * 0.7 : 0);
    if (s > 12) hits.push({ group: "Person", id: p.id, label: p.name, sub: p.role_title || p.email, score: s, nav: { kind: "person", id: p.id } });
  }
  for (const d of store.docs) {
    const s = Math.max(scoreMatch(q, d.title), d.excerpt ? scoreMatch(q, d.excerpt) * 0.5 : 0);
    if (s > 12) hits.push({ group: "Doc", id: d.id, label: d.title, sub: d.category || d.type, score: s, nav: { kind: "doc" } });
  }
  for (const l of store.lists) {
    const sp = store.spaces.find((x) => x.id === l.space_id);
    const s = Math.max(scoreMatch(q, l.name), sp ? scoreMatch(q, `${sp.name} ${l.name}`) * 0.8 : 0);
    if (s > 12) hits.push({ group: "List", id: l.id, label: l.name, sub: sp?.name || "", score: s + 4, nav: { kind: "list", spaceId: l.space_id, listId: l.id } });
  }
  for (const f of store.forms) {
    const s = scoreMatch(q, f.title);
    if (s > 12) hits.push({ group: "Form", id: f.id, label: f.title, sub: "Form", score: s * 0.9, nav: { kind: "form" } });
  }

  // top N per group, then flatten sorted by score
  const byGroup = new Map<string, SearchHit[]>();
  for (const h of hits.sort((a, b) => b.score - a.score)) {
    if (!byGroup.has(h.group)) byGroup.set(h.group, []);
    const g = byGroup.get(h.group)!;
    if (g.length < limitPerGroup) g.push(h);
  }
  return Array.from(byGroup.values()).flat().sort((a, b) => b.score - a.score);
}

/* ---------------- recent searches ---------------- */
const RECENTS_KEY = "sw-recent-searches";
export function getRecentSearches(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]"); } catch { return []; }
}
export function pushRecentSearch(q: string) {
  const v = q.trim();
  if (!v) return;
  const list = [v, ...getRecentSearches().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 6);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)); } catch {}
}

/* ---------------- smart filters ---------------- */
export interface FilterState {
  text: string;
  assignees: string[]; // profile ids
  statuses: string[];
  priorities: string[];
  due: "" | "overdue" | "today" | "week" | "next-week" | "none";
  effort: "" | "light" | "medium" | "heavy"; // 1-2 / 3-5 / 8+
}

export const EMPTY_FILTERS: FilterState = { text: "", assignees: [], statuses: [], priorities: [], due: "", effort: "" };

export function countActiveFilters(f: FilterState): number {
  return (
    (f.text ? 1 : 0) + (f.assignees.length ? 1 : 0) + (f.statuses.length ? 1 : 0) +
    (f.priorities.length ? 1 : 0) + (f.due ? 1 : 0) + (f.effort ? 1 : 0)
  );
}

export function applyFilters(tasks: Task[], f: FilterState, today: string): Task[] {
  let rows = tasks;
  const q = f.text.trim().toLowerCase();
  if (q) rows = rows.filter((t) => t.name.toLowerCase().includes(q) || `sw-${t.task_number}`.includes(q));
  if (f.assignees.length) rows = rows.filter((t) => !!t.assignee_id && f.assignees.includes(t.assignee_id));
  if (f.statuses.length) rows = rows.filter((t) => f.statuses.includes(t.status));
  if (f.priorities.length) rows = rows.filter((t) => f.priorities.includes(t.priority));
  if (f.due) {
    const d = new Date(today + "T00:00:00");
    const dow = (d.getDay() + 6) % 7; // Mon=0
    const weekStart = new Date(d); weekStart.setDate(d.getDate() - dow);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const nextStart = new Date(weekEnd); nextStart.setDate(weekEnd.getDate() + 1);
    const nextEnd = new Date(nextStart); nextEnd.setDate(nextStart.getDate() + 6);
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    rows = rows.filter((t) => {
      switch (f.due) {
        case "overdue": return !!t.due && t.due < today && t.status !== "Done";
        case "today": return t.due === today;
        case "week": return !!t.due && t.due >= iso(weekStart) && t.due <= iso(weekEnd);
        case "next-week": return !!t.due && t.due >= iso(nextStart) && t.due <= iso(nextEnd);
        case "none": return !t.due;
        default: return true;
      }
    });
  }
  if (f.effort) {
    rows = rows.filter((t) => {
      const e = t.effort || 1;
      return f.effort === "light" ? e <= 2 : f.effort === "medium" ? e >= 3 && e <= 5 : e >= 8;
    });
  }
  return rows;
}

export const DUE_LABELS: Record<string, string> = {
  overdue: "Overdue", today: "Due today", week: "This week", "next-week": "Next week", none: "No due date",
};
export const EFFORT_LABELS: Record<string, string> = { light: "1–2 pts", medium: "3–5 pts", heavy: "8+ pts" };
