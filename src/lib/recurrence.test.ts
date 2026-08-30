import { describe, it, expect } from "vitest";
import {
  nextOccurrence, describeRecurrence, fromLegacyRecur, recurrenceOf,
  type Recurrence,
} from "./recurrence";

const r = (over: Partial<Recurrence>): Recurrence =>
  ({ freq: "weekly", interval: 1, ends: { type: "never" }, anchor: "due", ...over });

// A fixed "today" so none of these depend on the wall clock.
const TODAY = "2026-07-29"; // a Wednesday

describe("nextOccurrence — basic frequencies", () => {
  it("daily", () => {
    expect(nextOccurrence({ rule: r({ freq: "daily" }), due: "2026-08-10", today: TODAY })).toBe("2026-08-11");
  });
  it("every 3 days", () => {
    expect(nextOccurrence({ rule: r({ freq: "daily", interval: 3 }), due: "2026-08-10", today: TODAY })).toBe("2026-08-13");
  });
  it("weekly", () => {
    expect(nextOccurrence({ rule: r({ freq: "weekly" }), due: "2026-08-10", today: TODAY })).toBe("2026-08-17");
  });
  it("every 2 weeks", () => {
    expect(nextOccurrence({ rule: r({ freq: "weekly", interval: 2 }), due: "2026-08-10", today: TODAY })).toBe("2026-08-24");
  });
  it("monthly keeps the day of month", () => {
    expect(nextOccurrence({ rule: r({ freq: "monthly" }), due: "2026-08-10", today: TODAY })).toBe("2026-09-10");
  });
  it("yearly", () => {
    expect(nextOccurrence({ rule: r({ freq: "yearly" }), due: "2026-08-10", today: TODAY })).toBe("2027-08-10");
  });
});

describe("nextOccurrence — the overdue bug the old engine had", () => {
  it("does not return a date that is already in the past", () => {
    // Weekly task due 3 weeks before today. due+7 would still be overdue.
    const next = nextOccurrence({ rule: r({ freq: "weekly" }), due: "2026-07-08", today: TODAY })!;
    expect(next > TODAY).toBe(true);
    expect(next).toBe("2026-08-05"); // keeps stepping in 7s until it clears today
  });
  it("still lands on the correct weekday after skipping ahead", () => {
    const next = nextOccurrence({ rule: r({ freq: "weekly" }), due: "2026-07-08", today: TODAY })!;
    expect(new Date(`${next}T12:00:00Z`).getUTCDay()).toBe(new Date("2026-07-08T12:00:00Z").getUTCDay());
  });
  it("anchored to completion, measures from when it was actually done", () => {
    const next = nextOccurrence({
      rule: r({ freq: "daily", interval: 3, anchor: "completion" }),
      due: "2026-07-01", completedOn: "2026-07-29", today: TODAY,
    });
    expect(next).toBe("2026-08-01");
  });
});

describe("nextOccurrence — weekly on specific weekdays", () => {
  const rule = r({ freq: "weekly", byWeekday: [1, 3, 5] }); // Mon, Wed, Fri
  it("moves to the next selected day within the same week", () => {
    // 2026-08-10 is a Monday -> next selected is Wednesday
    expect(nextOccurrence({ rule, due: "2026-08-10", today: TODAY })).toBe("2026-08-12");
  });
  it("wraps to the first selected day of the next week", () => {
    // 2026-08-14 is a Friday -> wraps to Monday
    expect(nextOccurrence({ rule, due: "2026-08-14", today: TODAY })).toBe("2026-08-17");
  });
  it("honours the interval when wrapping", () => {
    const biweekly = r({ freq: "weekly", interval: 2, byWeekday: [1] });
    expect(nextOccurrence({ rule: biweekly, due: "2026-08-10", today: TODAY })).toBe("2026-08-24");
  });
});

describe("nextOccurrence — monthly edge cases", () => {
  it("clamps 31st to the last day of a shorter month", () => {
    expect(nextOccurrence({ rule: r({ freq: "monthly" }), due: "2026-01-31", today: "2026-01-01" })).toBe("2026-02-28");
  });
  it("handles the nth weekday of the month", () => {
    // second Wednesday of September 2026 = 2026-09-09
    const rule = r({ freq: "monthly", monthlyMode: "nthWeekday", nth: 2, weekday: 3 });
    expect(nextOccurrence({ rule, due: "2026-08-12", today: TODAY })).toBe("2026-09-09");
  });
  it("handles the last weekday of the month", () => {
    // last Friday of September 2026 = 2026-09-25
    const rule = r({ freq: "monthly", monthlyMode: "nthWeekday", nth: -1, weekday: 5 });
    expect(nextOccurrence({ rule, due: "2026-08-28", today: TODAY })).toBe("2026-09-25");
  });
});

describe("nextOccurrence — end conditions", () => {
  it("stops after N occurrences", () => {
    const rule = r({ freq: "daily", ends: { type: "after", count: 3 } });
    expect(nextOccurrence({ rule, due: "2026-08-10", index: 0, today: TODAY })).toBe("2026-08-11");
    expect(nextOccurrence({ rule, due: "2026-08-11", index: 1, today: TODAY })).toBe("2026-08-12");
    expect(nextOccurrence({ rule, due: "2026-08-12", index: 2, today: TODAY })).toBeNull();
  });
  it("stops on a given date", () => {
    const rule = r({ freq: "weekly", ends: { type: "on", date: "2026-08-20" } });
    expect(nextOccurrence({ rule, due: "2026-08-10", today: TODAY })).toBe("2026-08-17");
    expect(nextOccurrence({ rule, due: "2026-08-17", today: TODAY })).toBeNull();
  });
  it("never-ending rules keep going", () => {
    expect(nextOccurrence({ rule: r({ freq: "weekly" }), due: "2027-01-04", index: 99, today: TODAY })).toBe("2027-01-11");
  });
});

describe("nextOccurrence — skip weekends", () => {
  it("pushes a Saturday result to Monday", () => {
    // 2026-08-08 is a Saturday
    const rule = r({ freq: "daily", skipWeekends: true });
    expect(nextOccurrence({ rule, due: "2026-08-07", today: "2026-08-01" })).toBe("2026-08-10");
  });
  it("leaves weekday results alone", () => {
    const rule = r({ freq: "daily", skipWeekends: true });
    expect(nextOccurrence({ rule, due: "2026-08-10", today: TODAY })).toBe("2026-08-11");
  });
});

describe("nextOccurrence — guards", () => {
  it("returns null with no due date when anchored to due", () => {
    expect(nextOccurrence({ rule: r({ freq: "daily" }), due: null, today: TODAY })).toBeNull();
  });
  it("still works with no due date when anchored to completion", () => {
    expect(nextOccurrence({ rule: r({ freq: "daily", anchor: "completion" }), due: null, completedOn: "2026-08-10", today: TODAY })).toBe("2026-08-11");
  });
  it("ignores a malformed due date", () => {
    expect(nextOccurrence({ rule: r({ freq: "daily" }), due: "not-a-date", today: TODAY })).toBeNull();
  });
});

describe("legacy compatibility", () => {
  it("maps the old words onto the new shape", () => {
    expect(fromLegacyRecur("weekly")).toEqual({ freq: "weekly", interval: 1, ends: { type: "never" }, anchor: "due" });
    expect(fromLegacyRecur("none")).toBeNull();
    expect(fromLegacyRecur(null)).toBeNull();
  });
  it("prefers structured recurrence when both are present", () => {
    const got = recurrenceOf({ recurrence: { freq: "monthly", interval: 2 }, recur: "weekly" });
    expect(got!.freq).toBe("monthly");
    expect(got!.interval).toBe(2);
  });
  it("falls back to the legacy column for old rows", () => {
    expect(recurrenceOf({ recurrence: null, recur: "daily" })!.freq).toBe("daily");
  });
});

describe("describeRecurrence", () => {
  it("describes intervals", () => {
    expect(describeRecurrence(r({ freq: "daily" }))).toBe("Every day");
    expect(describeRecurrence(r({ freq: "daily", interval: 3 }))).toBe("Every 3 days");
  });
  it("lists weekdays", () => {
    expect(describeRecurrence(r({ freq: "weekly", interval: 2, byWeekday: [1, 3] })))
      .toBe("Every 2 weeks on Mon, Wed");
  });
  it("describes the nth weekday", () => {
    expect(describeRecurrence(r({ freq: "monthly", monthlyMode: "nthWeekday", nth: 2, weekday: 3 })))
      .toBe("Every month on the second Wednesday");
  });
  it("appends end conditions and modifiers", () => {
    expect(describeRecurrence(r({ freq: "weekly", skipWeekends: true, ends: { type: "after", count: 5 } })))
      .toBe("Every week · skips weekends · 5 times");
    expect(describeRecurrence(r({ freq: "weekly", ends: { type: "on", date: "2026-12-31" } })))
      .toBe("Every week · until 31 Dec 2026");
  });
  it("handles no recurrence", () => {
    expect(describeRecurrence(null)).toBe("Doesn't repeat");
  });
});
