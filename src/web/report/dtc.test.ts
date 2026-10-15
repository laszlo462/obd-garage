import { describe, expect, it } from "vitest";
import type { Dtc } from "../../core/report.ts";
import {
  dtcBadges,
  dtcCodeTone,
  monitorBadge,
  monitorCounts,
  statusChangeText,
  statusLabel,
} from "./dtc.ts";

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

describe("statusLabel", () => {
  it("reads Confirmed as Stored in any case and leaves other statuses alone", () => {
    expect(statusLabel("Confirmed")).toBe("Stored");
    expect(statusLabel("confirmed")).toBe("Stored");
    expect(statusLabel("Pending")).toBe("Pending");
  });
});

describe("statusChangeText", () => {
  it("lists what was added first, then what was removed, with Confirmed as Stored", () => {
    expect(statusChangeText({ added: ["Confirmed"], removed: ["Pending"] })).toBe(
      "+Stored −Pending",
    );
    expect(statusChangeText({ added: ["Pending", "Permanent"], removed: [] })).toBe(
      "+Pending +Permanent",
    );
    expect(statusChangeText({ added: [], removed: ["Confirmed"] })).toBe("−Stored");
  });
});

describe("monitorCounts", () => {
  it("counts complete, incomplete and not supported tests", () => {
    const t = (state: "complete" | "incomplete" | "na") => ({
      name: "x",
      continuous: false,
      status: "",
      state,
    });
    expect(
      monitorCounts([t("complete"), t("na"), t("incomplete"), t("complete"), t("na")]),
    ).toEqual({ complete: 2, incomplete: 1, notSupported: 2 });
    expect(monitorCounts([])).toEqual({ complete: 0, incomplete: 0, notSupported: 0 });
  });
});
