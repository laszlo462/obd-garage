import { describe, expect, it } from "vitest";
import type { Dtc } from "../../core/report.ts";
import { dtcBadges, dtcCodeTone, monitorBadge } from "./dtc.ts";

const dtc = (statuses: string[]): Dtc => ({
  ecu: "ECM",
  code: "P0401",
  type: "",
  description: "EGR flow",
  statuses,
  uds: [],
});

describe("dtcBadges", () => {
  it("names Confirmed as Stored and tones current, confirmed and permanent bad, pending warn", () => {
    expect(dtcBadges(dtc(["Confirmed", "Pending", "Permanent", "Current", "Historical"]))).toEqual([
      { label: "Stored", tone: "bad" },
      { label: "Pending", tone: "warn" },
      { label: "Permanent", tone: "bad" },
      { label: "Current", tone: "bad" },
      { label: "Historical", tone: "neutral" },
    ]);
  });
});

describe("dtcCodeTone", () => {
  it("is bad, or warn when the code is only pending, or muted when only historical", () => {
    expect(dtcCodeTone(dtc(["Confirmed", "Pending"]))).toBe("bad");
    expect(dtcCodeTone(dtc(["Pending"]))).toBe("warn");
    expect(dtcCodeTone(dtc(["Historical"]))).toBe("muted");
  });
});

describe("monitorBadge", () => {
  it("is Complete ok, Incomplete warn, Not supported neutral", () => {
    expect(monitorBadge("complete")).toEqual({ label: "Complete", tone: "ok" });
    expect(monitorBadge("incomplete")).toEqual({ label: "Incomplete", tone: "warn" });
    expect(monitorBadge("na")).toEqual({ label: "Not supported", tone: "neutral" });
  });
});
