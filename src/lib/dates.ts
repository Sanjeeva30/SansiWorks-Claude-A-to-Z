export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayIso = () => iso(new Date());

export const addDaysIso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

export function fmtShort(dstr: string) {
  const d = new Date(dstr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function fmtFull(dstr: string) {
  const d = new Date(dstr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export const NL_FMT = (d: Date) => ({
  iso: iso(d),
  label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
});

// natural-language date parsing, verbatim from the design
export function parseNLDate(str: string): { iso: string; label: string } | null {
  const s = String(str || "").trim().toLowerCase();
  if (!s) return null;
  const base = new Date();
  if ("today".startsWith(s)) return NL_FMT(base);
  if (s.length >= 3 && "tomorrow".startsWith(s)) {
    base.setDate(base.getDate() + 1);
    return NL_FMT(base);
  }
  if (s.length >= 4 && "next week".startsWith(s)) {
    base.setDate(base.getDate() + 7);
    return NL_FMT(base);
  }
  if (s.length >= 3 && "end of month".startsWith(s))
    return NL_FMT(new Date(base.getFullYear(), base.getMonth() + 1, 0));
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const di = s.length >= 2 ? days.findIndex((d) => d.startsWith(s)) : -1;
  if (di >= 0) {
    const delta = (di - base.getDay() + 7) % 7 || 7;
    base.setDate(base.getDate() + delta);
    return NL_FMT(base);
  }
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : base.getFullYear();
    const d = new Date(+y, +m[2] - 1, +m[1]);
    if (!isNaN(d.getTime())) return NL_FMT(d);
  }
  return null;
}

export function relTime(ts: string): string {
  const then = new Date(ts).getTime();
  const now = Date.now();
  const mins = Math.round((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
