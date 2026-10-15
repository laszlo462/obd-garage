import { describe, expect, it } from "vitest";
import { lastThirtyDays, summaryLine } from "./export-range.ts";
import { exportSummary } from "./test-support.ts";

describe("lastThirtyDays", () => {
  it("runs from the local date and the 29 days before it", () => {
    expect(lastThirtyDays(new Date(2026, 9, 14, 23, 30))).toEqual({
      from: "2026-09-15",
      to: "2026-10-14",
    });
  });

  it("counts whole calendar days across a year end and a month with 31 days", () => {
    expect(lastThirtyDays(new Date(2027, 0, 5, 0, 10))).toEqual({
      from: "2026-12-07",
      to: "2027-01-05",
    });
    expect(lastThirtyDays(new Date(2026, 10, 2, 12))).toEqual({
      from: "2026-10-04",
      to: "2026-11-02",
    });
  });
});

describe("summaryLine", () => {
  it("counts the Drive Logs and Reports, then the Reference Reports outside the range", () => {
    expect(summaryLine(exportSummary({ driveLogs: 1, reports: 0, referenceOnly: 1 }))).toBe(
      "1 Drive Log · 0 Reports, +1 Reference Report outside the range",
    );
    expect(summaryLine(exportSummary({ driveLogs: 12, reports: 2, referenceOnly: 3 }))).toBe(
      "12 Drive Logs · 2 Reports, +3 Reference Reports outside the range",
    );
  });

  it("leaves the plus part out when no Reference Report lies outside the range", () => {
    expect(summaryLine(exportSummary({ driveLogs: 2, reports: 1, referenceOnly: 0 }))).toBe(
      "2 Drive Logs · 1 Report",
    );
  });
});
