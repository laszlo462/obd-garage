import { describe, expect, it } from "vitest";
import {
  compactDateTime,
  count,
  daysAgo,
  duration,
  monthKey,
  monthLabel,
  shortDate,
} from "./format.ts";

describe("compactDateTime", () => {
  it("reads the naive string as written, with no time-zone shift", () => {
    expect(compactDateTime("2026-10-04T17:22:05")).toBe("04 Oct 17:22");
    expect(compactDateTime("2026-01-01T00:05:00.987")).toBe("01 Jan 00:05");
  });

  it("is a dash when there is no recorded time", () => {
    expect(compactDateTime(null)).toBe("–");
  });
});

describe("duration", () => {
  it("rounds to whole minutes", () => {
    expect(duration(2460)).toBe("41 min");
    expect(duration(2489.6)).toBe("41 min");
  });

  it("gives seconds under a minute and hours past 60 min", () => {
    expect(duration(42)).toBe("42 s");
    expect(duration(3900)).toBe("1 h 5 min");
    expect(duration(7200)).toBe("2 h");
  });

  it("is a dash when unknown", () => {
    expect(duration(null)).toBe("–");
  });
});

describe("monthKey and monthLabel", () => {
  it("group by the recorded month in the written time, with no time-zone shift", () => {
    expect(monthKey("2026-10-31T23:59:59")).toBe("2026-10");
    expect(monthKey("2026-11-01T00:00:01")).toBe("2026-11");
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(monthLabel("2026-01")).toBe("January 2026");
  });

  it("put a log with no recorded time under Unknown date", () => {
    expect(monthKey(null)).toBe("");
    expect(monthLabel("")).toBe("Unknown date");
  });
});

describe("count", () => {
  it("is singular for one and plural otherwise", () => {
    expect(count(1, "report")).toBe("1 report");
    expect(count(0, "report")).toBe("0 reports");
    expect(count(9, "drive log")).toBe("9 drive logs");
  });
});

describe("shortDate", () => {
  it("is the day and month as written", () => {
    expect(shortDate("2026-10-02T21:32:14")).toBe("2 Oct");
  });
});

describe("daysAgo", () => {
  const today = new Date(2026, 9, 11, 8, 0);
  it("counts calendar days from the written date", () => {
    expect(daysAgo("2026-10-02T21:32:14", today)).toBe("9 days ago");
    expect(daysAgo("2026-10-10T23:59:00", today)).toBe("yesterday");
    expect(daysAgo("2026-10-11T00:01:00", today)).toBe("today");
  });
});
