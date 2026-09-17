import { describe, expect, it } from "vitest";
import { formatDayStamp, formatLastTouched } from "@/lib/utils";

/* Built from local calendar parts on purpose: the stamp counts calendar days
   where the learner is, so a test written in UTC would pass or fail by zone. */
const NOW = new Date(2026, 2, 12, 9, 0, 0);
const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY);

describe("formatLastTouched", () => {
  it("counts by calendar day, not by elapsed hours", () => {
    expect(formatLastTouched(new Date(2026, 2, 12, 0, 30), NOW)).toBe("today");
    expect(formatLastTouched(new Date(2026, 2, 11, 23, 30), NOW)).toBe("yesterday");
  });

  it("keeps a date in the future quiet rather than naming it", () => {
    expect(formatLastTouched(new Date(2026, 2, 14, 9, 0), NOW)).toBe("today");
  });

  it("names days up to a week", () => {
    expect(formatLastTouched(at(3), NOW)).toBe("3 days ago");
    expect(formatLastTouched(at(6), NOW)).toBe("6 days ago");
  });

  it("turns to weeks, then to a stamped date", () => {
    expect(formatLastTouched(at(7), NOW)).toBe("a week ago");
    expect(formatLastTouched(at(13), NOW)).toBe("a week ago");
    expect(formatLastTouched(at(14), NOW)).toBe("2 weeks ago");
    expect(formatLastTouched(at(29), NOW)).toBe("4 weeks ago");
    expect(formatLastTouched(at(31), NOW)).toBe("9 FEB");
  });

  it("names the year only when it is not this one", () => {
    expect(formatLastTouched(new Date(2025, 10, 4, 9, 0), NOW)).toBe("4 NOV 2025");
  });
});

describe("formatDayStamp", () => {
  it("stamps the day, the fixed month table and the year", () => {
    expect(formatDayStamp(new Date(2026, 8, 2, 12, 0))).toBe("2 SEP 2026");
  });
});
