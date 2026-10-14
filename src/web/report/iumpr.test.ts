import { describe, expect, it } from "vitest";
import type { IumprCounter } from "../../core/report.ts";
import { iumprByEcu } from "./iumpr.ts";

const c = (ecu: string, description: string, value: string): IumprCounter => ({
  ecu,
  counter: "0x00",
  description,
  value,
});

const now = [
  c("ECM", "OBD Monitoring Conditions Encountered Counts", "2471"),
  c("ECM", "Ignition Cycle Counter", "7492"),
  c("ECM", "NMHC Catalyst Monitor Completion Condition Counts", "415"),
  c("ECM", "NMHC Catalyst Monitor Conditions Encountered Counts", "500"),
  c("ECM", "EGR Monitor Completion Condition Counts", "5"),
  c("ECM", "EGR Monitor Conditions Encountered Counts", "100"),
  c("ECM", "NOx Monitor Completion Condition Counts", "9"),
  c("ECM", "NOx Monitor Conditions Encountered Counts", "0"),
  c("TCM", "Ignition Cycle Counter", "10"),
];

describe("iumprByEcu", () => {
  it("makes the ratio of completions to conditions met for each monitor of each ECU", () => {
    const [ecm, tcm] = iumprByEcu(now);
    expect(ecm?.ecu).toBe("ECM");
    expect(ecm?.ignitionCycles).toBe(7492);
    expect(ecm?.generalDenominator).toBe(2471);
    expect(ecm?.monitors.map((m) => [m.name, m.completions, m.conditions])).toEqual([
      ["NMHC Catalyst", 415, 500],
      ["EGR", 5, 100],
      ["NOx", 9, 0],
    ]);
    expect(ecm?.monitors[0]?.ratio).toBeCloseTo(0.83, 5);
    expect(tcm?.monitors).toEqual([]);
    expect(tcm?.generalDenominator).toBeNull();
  });
  it("flags a ratio under 0.1 as low and over 2 as off the scale, and has no ratio without conditions", () => {
    const m = iumprByEcu(now)[0]?.monitors ?? [];
    expect(m[0]).toMatchObject({ low: false, offScale: false });
    expect(m[1]).toMatchObject({ low: true, offScale: false });
    expect(m[2]).toMatchObject({ ratio: null, low: false, offScale: false });
    const big = iumprByEcu([
      c("ECM", "X Monitor Completion Condition Counts", "30"),
      c("ECM", "X Monitor Conditions Encountered Counts", "10"),
    ]);
    expect(big[0]?.monitors[0]).toMatchObject({ ratio: 3, offScale: true });
  });
  it("counts what happened since the compared Report", () => {
    const before = [
      c("ECM", "Ignition Cycle Counter", "7000"),
      c("ECM", "NMHC Catalyst Monitor Completion Condition Counts", "400"),
      c("ECM", "NMHC Catalyst Monitor Conditions Encountered Counts", "480"),
    ];
    const ecm = iumprByEcu(now, before)[0];
    expect(ecm?.ignitionCyclesDelta).toBe("+492");
    expect(ecm?.monitors[0]?.since).toEqual({ completions: 15, conditions: 20 });
    expect(ecm?.monitors[1]?.since).toBeNull();
    expect(iumprByEcu(now)[0]?.monitors[0]?.since).toBeNull();
  });
});
