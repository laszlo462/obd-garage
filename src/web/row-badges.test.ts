import { describe, expect, it } from "vitest";
import { type BadgeRow, rowBadges } from "./row-badges.ts";

const report = (over: Partial<Extract<BadgeRow, { kind: "report" }>> = {}): BadgeRow => ({
  kind: "report",
  noteCount: 0,
  mil: "off",
  storedCodes: [],
  pendingCodes: [],
  incompleteMonitors: 0,
  totalMonitors: 10,
  ...over,
});
const log = (over: Partial<Extract<BadgeRow, { kind: "drive-log" }>> = {}): BadgeRow => ({
  kind: "drive-log",
  noteCount: 0,
  eventCount: 0,
  skippedRows: 0,
  ...over,
});

describe("rowBadges for a Drive Log", () => {
  it("shows the Event count as neutral, the Note count in the accent colour and skipped rows as a warning", () => {
    expect(rowBadges(log({ eventCount: 3, noteCount: 2, skippedRows: 12 }))).toEqual([
      { text: "3 events", tone: "neutral" },
      { text: "2 notes", tone: "accent" },
      { text: "12 rows skipped", tone: "warn" },
    ]);
  });

  it("uses singular words for one, and shows nothing for zero", () => {
    expect(
      rowBadges(log({ eventCount: 1, noteCount: 1, skippedRows: 1 })).map((b) => b.text),
    ).toEqual(["1 event", "1 note", "1 row skipped"]);
    expect(rowBadges(log())).toEqual([]);
  });
});

describe("rowBadges for a Report", () => {
  it("shows MIL on and stored codes as bad, pending codes as warn", () => {
    expect(
      rowBadges(report({ mil: "on", storedCodes: ["P0401"], pendingCodes: ["P0402"] })),
    ).toEqual([
      { text: "MIL ON", tone: "bad" },
      { text: "P0401", tone: "bad" },
      { text: "P0402 pending", tone: "warn" },
      { text: "monitors ready", tone: "ok" },
    ]);
  });

  it("shows MIL off and ready monitors as ok, incomplete monitors as neutral", () => {
    expect(rowBadges(report({ mil: "off" })).map((b) => [b.text, b.tone])).toEqual([
      ["MIL OFF", "ok"],
      ["monitors ready", "ok"],
    ]);
    expect(
      rowBadges(report({ mil: "unknown", incompleteMonitors: 2 })).map((b) => [b.text, b.tone]),
    ).toEqual([["2 monitors incomplete", "neutral"]]);
  });

  it("shows the Note count in the accent colour", () => {
    expect(rowBadges(report({ noteCount: 2 })).at(-1)).toEqual({ text: "2 notes", tone: "accent" });
  });
});
