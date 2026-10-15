import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReport } from "../../core/report.ts";
import { compareReports, dtcKey } from "./compare.ts";
import { dtc, monitorTest, report } from "./test-reports.ts";

const empty = {
  newCodes: [],
  alsoIn: [],
  goneCodes: [],
  statusChanges: {},
  monitorWas: {},
  mode06Was: {},
  overview: { mil: null, codes: null, monitors: null, sinceClear: null },
};

describe("compareReports", () => {
  it("has every field empty with no comparison", () => {
    const r = report({ dtcs: [dtc("P0401", ["Confirmed"])] });
    expect(compareReports(r, null)).toEqual(empty);
  });

  it("marks a code as new, or also in the other Report, by ECU and code", () => {
    const current = report({
      dtcs: [
        dtc("P0401", ["Confirmed"]),
        dtc("P0299", ["Pending"]),
        dtc("P0401", ["Confirmed"], { ecu: "TCM" }),
      ],
    });
    const other = report({ dtcs: [dtc("P0401", ["Confirmed"]), dtc("P1111", ["Confirmed"])] });
    const c = compareReports(current, other);
    expect(c.newCodes).toEqual(["ECM|P0299", "TCM|P0401"]);
    expect(c.alsoIn).toEqual(["ECM|P0401"]);
  });
});

describe("compareReports: gone codes", () => {
  it("lists the other Report's codes this one lacks, in its order and once per key", () => {
    const current = report({ dtcs: [dtc("P0401", ["Confirmed"])] });
    const gone = dtc("P0299", ["Pending"]);
    const other = report({
      dtcs: [gone, dtc("P0401", ["Confirmed"]), dtc("P1111", ["Confirmed"]), gone],
    });
    expect(compareReports(current, other).goneCodes.map((d) => d.code)).toEqual(["P0299", "P1111"]);
  });

  it("tells a code on another ECU apart", () => {
    const current = report({ dtcs: [dtc("P0401", ["Confirmed"])] });
    const other = report({ dtcs: [dtc("P0401", ["Confirmed"], { ecu: "TCM" })] });
    expect(compareReports(current, other).goneCodes.map(dtcKey)).toEqual(["TCM|P0401"]);
  });
});

describe("compareReports: status changes", () => {
  it("gives the statuses added and removed on a code both Reports list, and none when equal", () => {
    const current = report({
      dtcs: [dtc("P0401", ["Confirmed", "Pending"]), dtc("P0299", ["Pending"])],
    });
    const other = report({
      dtcs: [dtc("P0401", ["Pending", "Permanent"]), dtc("P0299", ["Pending"])],
    });
    expect(compareReports(current, other).statusChanges).toEqual({
      "ECM|P0401": { added: ["Confirmed"], removed: ["Permanent"] },
    });
  });
});

describe("compareReports: was values", () => {
  const ecm = (...tests: ReturnType<typeof monitorTest>[]) => [{ ecu: "ECM", tests }];

  it("gives the other status of a monitor whose state changed, keyed by ECU and name", () => {
    const current = report({
      monitors: ecm(monitorTest("Catalyst", "complete"), monitorTest("Misfire", "complete")),
    });
    const other = report({
      monitors: ecm(monitorTest("Catalyst", "incomplete"), monitorTest("Misfire", "complete")),
    });
    expect(compareReports(current, other).monitorWas).toEqual({
      "ECM|Catalyst#1": "Incomplete",
    });
  });

  it("lines up monitors that repeat a name by occurrence", () => {
    const current = report({
      monitors: ecm(monitorTest("Reserved", "na"), monitorTest("Reserved", "complete")),
    });
    const other = report({
      monitors: ecm(monitorTest("Reserved", "na"), monitorTest("Reserved", "incomplete")),
    });
    expect(compareReports(current, other).monitorWas).toEqual({ "ECM|Reserved#2": "Incomplete" });
  });

  it("gives the other value of each Mode $06 test both Reports list", () => {
    const test = (tid: string, valueText: string) => ({
      mid: "$01",
      midName: "Sensor",
      tid,
      tidName: "Manufacturer Defined",
      valueText,
      minText: "0",
      maxText: "10",
      value: Number(valueText),
      min: 0,
      max: 10,
      units: "sec",
      result: "Pass",
    });
    const current = report({ mode06: [test("$90", "3"), test("$91", "1")] });
    const other = report({ mode06: [test("$90", "2.4"), test("$92", "7")] });
    expect(compareReports(current, other).mode06Was).toEqual({ "$01 $90#1": "2.4" });
  });
});

describe("compareReports: overview change lines", () => {
  const overview = (mil: "on" | "off" | "unknown", distance?: string) => ({
    mil,
    ready: null,
    reasons: [],
    additional: distance
      ? [
          {
            description: "Distance traveled since DTCs cleared",
            value: distance,
            units: "miles",
          },
        ]
      : [],
  });
  const line = (current: Parameters<typeof report>[0], other: Parameters<typeof report>[0]) =>
    compareReports(report(current), report(other)).overview;

  it("says what the MIL was, or no change", () => {
    expect(line({ overview: overview("on") }, { overview: overview("off") }).mil).toBe("was OFF");
    expect(line({ overview: overview("on") }, { overview: overview("on") }).mil).toBe("no change");
  });

  it("counts the stored and pending codes that came or went", () => {
    const stored = dtc("P0401", ["Confirmed"]);
    const pending = dtc("P0299", ["Pending"]);
    expect(line({ dtcs: [stored, pending] }, { dtcs: [stored] }).codes).toBe("+1 pending");
    expect(line({ dtcs: [stored] }, { dtcs: [stored, pending] }).codes).toBe("\u22121 pending");
    expect(line({ dtcs: [stored, pending] }, { dtcs: [] }).codes).toBe("+1 stored, +1 pending");
    expect(line({ dtcs: [stored] }, { dtcs: [stored] }).codes).toBe("no change");
  });

  it("counts the monitors that are complete, more or fewer", () => {
    const ecm = (...states: ("complete" | "incomplete" | "na")[]) => [
      { ecu: "ECM", tests: states.map((s, i) => monitorTest(`M${i}`, s)) },
    ];
    expect(
      line(
        { monitors: ecm("complete", "complete", "na") },
        { monitors: ecm("complete", "incomplete", "na") },
      ).monitors,
    ).toBe("1 more complete");
    expect(
      line({ monitors: ecm("incomplete", "incomplete") }, { monitors: ecm("complete", "complete") })
        .monitors,
    ).toBe("2 fewer complete");
    expect(line({ monitors: ecm("complete") }, { monitors: ecm("complete") }).monitors).toBe(
      "no change",
    );
  });

  it("gives the distance driven since the codes were cleared, signed", () => {
    expect(
      line({ overview: overview("on", "6303.81") }, { overview: overview("on", "5573.08") })
        .sinceClear,
    ).toBe("+730.73 mi");
    expect(
      line({ overview: overview("on") }, { overview: overview("on", "5") }).sinceClear,
    ).toBeNull();
  });
});

describe("compareReports: the two real fixture Reports", () => {
  const load = (name: string) => {
    const parsed = parseReport(
      readFileSync(new URL(`../../../test/fixtures/reports/${name}`, import.meta.url)),
    );
    if (parsed.kind !== "report") throw new Error(`${name} did not parse`);
    return parsed.report;
  };
  const aug = load("Diagnostic Report 2026-08-21 215710.html");
  const oct = load("Diagnostic_Report_2026-10-02_213218.html");
  const all = [
    "ECM-EngineControl|P0401",
    "Parking Aid Module|B1B58-11",
    "Powertrain Control Module|P0401-00",
    "Powertrain Control Module|P20EE-00",
  ];

  it("October against August: the same four codes, one more pending, 730.73 miles on, a changed value", () => {
    const c = compareReports(oct, aug);
    expect(c.newCodes).toEqual([]);
    expect(c.alsoIn).toEqual(all);
    expect(c.monitorWas).toEqual({});
    expect(c.mode06Was["$01 $90#1"]).toBe("2.4");
    expect(c.overview).toEqual({
      mil: "no change",
      codes: "+1 pending",
      monitors: "no change",
      sinceClear: "+730.73 mi",
    });
  });

  it("August against October: the same facts the other way round", () => {
    const c = compareReports(aug, oct);
    expect(c.newCodes).toEqual([]);
    expect(c.alsoIn).toEqual(all);
    expect(c.mode06Was["$01 $90#1"]).toBe("3");
    expect(c.overview.codes).toBe("\u22121 pending");
    expect(c.overview.sinceClear).toBe("\u2212730.73 mi");
  });

  it("is empty with No comparison", () => {
    expect(compareReports(oct, null)).toEqual(empty);
  });
});
