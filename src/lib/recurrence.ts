/* ---- Recurrence engine ----

   The previous implementation supported three words (daily/weekly/monthly),
   advanced strictly from the DUE date, and had a bug worth naming: completing a
   task that was three weeks overdue produced a next occurrence that was itself
   already overdue, because due+7 was still in the past. People then completed
   two or three phantom occurrences in a row to catch up. Real schedulers skip
   forward to the next date that is actually in the future, and so does this.

   Dates are handled as plain YYYY-MM-DD strings and parsed at UTC midday, so a
   daylight-saving shift can never roll a date backwards by one day. */

export type Freq = "daily" | "weekly" | "monthly" | "yearly";
export type MonthlyMode = "dayOfMonth" | "nthWeekday";
export type EndType = "never" | "after" | "on";
/** Where the next date is measured from: the scheduled due date, or the day it
    was actually completed. "Water the plants every 3 days" means 3 days after
    you last did it; "rent due on the 1st" does not. */
export type Anchor = "due" | "completion";

export interface Recurrence {
  freq: Freq;
  /** Every N days/weeks/months/years. 1 = every one. */
  interval: number;
  /** Weekly only. 0=Sun … 6=Sat. Empty/absent = same weekday as the due date. */
  byWeekday?: number[];
  /** Monthly only. */
  monthlyMode?: MonthlyMode;
  /** nthWeekday only: 1..4 = first..fourth, -1 = last. */
  nth?: number;
  /** nthWeekday only: 0=Sun … 6=Sat. */
  weekday?: number;
  ends?: { type: EndType; count?: number; date?: string };
  /** Push a result that lands on Sat/Sun to the following Monday. */
  skipWeekends?: boolean;
  anchor?: Anchor;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const NTH_LABELS: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", [-1]: "last" };

export const DEFAULT_RECURRENCE: Recurrence = { freq: "weekly", interval: 1, ends: { type: "never" }, anchor: "due" };

/* ---- date helpers (UTC-midday, so DST can never shift the calendar day) ---- */
function parse(iso: string): Date | null {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
/** Add months, clamping the day so 31 Jan + 1 month is 28/29 Feb, not 3 March. */
function addMonthsClamped(d: Date, n: number): Date {
  const day = d.getUTCDate();
  const c = new Date(d);
  c.setUTCDate(1);
  c.setUTCMonth(c.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 0, 12)).getUTCDate();
  c.setUTCDate(Math.min(day, lastDay));
  return c;
}
/** The nth (1..4, or -1 for last) given weekday of a month. */
function nthWeekdayOf(year: number, month: number, weekday: number, nth: number): Date {
  if (nth === -1) {
    const last = new Date(Date.UTC(year, month + 1, 0, 12));
    const diff = (last.getUTCDay() - weekday + 7) % 7;
    return addDays(last, -diff);
  }
  const first = new Date(Date.UTC(year, month, 1, 12));
  const diff = (weekday - first.getUTCDay() + 7) % 7;
  return addDays(first, diff + (nth - 1) * 7);
}
function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** Legacy `recur` words map onto the structured form so old rows keep working. */
export function fromLegacyRecur(recur: string | null | undefined): Recurrence | null {
  if (!recur || recur === "none") return null;
  if (recur === "daily" || recur === "weekly" || recur === "monthly") {
    return { freq: recur, interval: 1, ends: { type: "never" }, anchor: "due" };
  }
  return null;
}

/** Normalises whatever the row carries into one shape. */
export function recurrenceOf(task: { recurrence?: unknown; recur?: string | null }): Recurrence | null {
  const r = task.recurrence as Recurrence | null | undefined;
  if (r && typeof r === "object" && r.freq) return r;
  return fromLegacyRecur(task.recur);
}

/** One step forward from `d`, ignoring end conditions and the "must be future" rule. */
function step(rule: Recurrence, d: Date): Date {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  switch (rule.freq) {
    case "daily":
      return addDays(d, interval);
    case "weekly": {
      const days = (rule.byWeekday || []).filter((n) => n >= 0 && n <= 6).sort((a, b) => a - b);
      if (!days.length) return addDays(d, 7 * interval);
      // Next selected weekday later this week, else jump `interval` weeks and
      // take the first selected day of that week.
      const cur = d.getUTCDay();
      const later = days.find((n) => n > cur);
      if (later !== undefined) return addDays(d, later - cur);
      const weekStart = addDays(d, -cur);
      return addDays(weekStart, 7 * interval + days[0]);
    }
    case "monthly": {
      if (rule.monthlyMode === "nthWeekday" && rule.weekday !== undefined && rule.nth !== undefined) {
        const base = addMonthsClamped(d, interval);
        return nthWeekdayOf(base.getUTCFullYear(), base.getUTCMonth(), rule.weekday, rule.nth);
      }
      return addMonthsClamped(d, interval);
    }
    case "yearly":
      return addMonthsClamped(d, 12 * interval);
    default:
      return addDays(d, 1);
  }
}

export interface NextOccurrenceInput {
  rule: Recurrence;
  /** The completed occurrence's due date (YYYY-MM-DD), if it had one. */
  due: string | null;
  /** The day it was completed (YYYY-MM-DD). Defaults to today. */
  completedOn?: string;
  /** 0-based index of the occurrence just completed. */
  index?: number;
  /** Today, injectable so tests are not clock-dependent. */
  today?: string;
}

/**
 * The next due date, or null when the series has ended (or there's nothing to
 * schedule from). Never returns a date in the past when anchored to the due
 * date — it keeps stepping until it clears today, which is what stops an
 * overdue repeating task from spawning an already-overdue successor.
 */
export function nextOccurrence({ rule, due, completedOn, index = 0, today }: NextOccurrenceInput): string | null {
  if (!rule) return null;

  const todayIso = today || new Date().toISOString().slice(0, 10);
  const anchor = rule.anchor === "completion" ? (completedOn || todayIso) : due;
  if (!anchor) return null;

  const start = parse(anchor);
  if (!start) return null;

  // "Ends after N occurrences": index is 0-based, so completing #N-1 is the end.
  const ends = rule.ends || { type: "never" };
  if (ends.type === "after" && ends.count !== undefined && index + 1 >= ends.count) return null;

  let next = step(rule, start);

  /* Anchored to the due date, a long-overdue task would otherwise produce a
     successor that is also in the past. Keep stepping until it clears today.
     Capped so a malformed rule can't spin. */
  if (rule.anchor !== "completion") {
    const todayD = parse(todayIso)!;
    let guard = 0;
    while (next <= todayD && guard < 500) {
      next = step(rule, next);
      guard++;
    }
  }

  if (rule.skipWeekends) {
    let guard = 0;
    while (isWeekend(next) && guard < 7) {
      next = addDays(next, 1);
      guard++;
    }
  }

  if (ends.type === "on" && ends.date) {
    const limit = parse(ends.date);
    if (limit && next > limit) return null;
  }

  return fmt(next);
}

/** Human-readable summary — "Every 2 weeks on Mon, Wed · until 31 Dec 2026". */
export function describeRecurrence(rule: Recurrence | null): string {
  if (!rule) return "Doesn't repeat";
  const n = Math.max(1, Math.floor(rule.interval || 1));
  let base: string;

  switch (rule.freq) {
    case "daily":
      base = n === 1 ? "Every day" : `Every ${n} days`;
      break;
    case "weekly": {
      const days = (rule.byWeekday || []).slice().sort((a, b) => a - b);
      const every = n === 1 ? "Every week" : `Every ${n} weeks`;
      base = days.length ? `${every} on ${days.map((d) => WEEKDAY_LABELS[d]).join(", ")}` : every;
      break;
    }
    case "monthly": {
      const every = n === 1 ? "Every month" : `Every ${n} months`;
      base = rule.monthlyMode === "nthWeekday" && rule.weekday !== undefined && rule.nth !== undefined
        ? `${every} on the ${NTH_LABELS[rule.nth] || rule.nth} ${WEEKDAY_LONG[rule.weekday]}`
        : `${every} on the same date`;
      break;
    }
    case "yearly":
      base = n === 1 ? "Every year" : `Every ${n} years`;
      break;
    default:
      base = "Repeats";
  }

  if (rule.skipWeekends) base += " · skips weekends";
  if (rule.anchor === "completion") base += " · from completion date";

  const ends = rule.ends;
  if (ends?.type === "after" && ends.count) base += ` · ${ends.count} times`;
  if (ends?.type === "on" && ends.date) {
    const d = parse(ends.date);
    if (d) base += ` · until ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
  }
  return base;
}
