import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STANDARD_CATALOGUE } from "../core/channels.ts";
import { derive } from "../core/derive.ts";
import { parseReport } from "../core/report.ts";
import { GENERIC } from "./generic.ts";
import { createVehicleProfiles, VEHICLE_PROFILES } from "./registry.ts";
import { MIXED_NOTICE, RESCALED_NOTICE, SIX_SEVEN } from "./six-seven.ts";
import type { VehicleProfile } from "./types.ts";

const logs = new URL("../../test/fixtures/drive-logs/", import.meta.url);
const reports = new URL("../../test/fixtures/reports/", import.meta.url);
const BOM = "﻿";

const csv = (header: string, rows: string[]) =>
  `${BOM}${["# StartTime = 10/02/2026 05:58:45.9486 PM", header, ...rows].join("\r\n")}\r\n`;

function derived(input: string | Uint8Array, profile: VehicleProfile = SIX_SEVEN) {
  const r = derive(input, { profile, packs: [], params: {} });
  if (r.kind !== "derived") throw new Error(`expected derived, got ${r.kind}`);
  return r;
}

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, logs)));

describe("Generic", () => {
  it("matches nothing, adds nothing and suggests no packs", () => {
    expect(GENERIC.matchesVin("1FT7W2BT5CE000001")).toBe(false);
    expect(GENERIC.catalogue).toBeUndefined();
    expect(GENERIC.decodeFixes).toBeUndefined();
    expect(GENERIC.suggestedPackIds).toEqual([]);
    expect(GENERIC.hiddenColumns).toEqual([]);
  });
});

describe("Generic chart preset", () => {
  it("charts Speed, RPM, Load and ECT, one panel each", () => {
    expect(GENERIC.defaultChartPreset.map((p) => p.series.map((s) => s.key))).toEqual([
      ["speed"],
      ["rpm"],
      ["load"],
      ["ect"],
    ]);
    expect(GENERIC.defaultChartPreset.map((p) => p.unit)).toEqual(["mph", "rpm", "%", "°F"]);
  });
});

describe("VIN matching", () => {
  it("matches the VIN of every fixture Diagnostic Report to 6.7", () => {
    const files = readdirSync(reports).filter((f) => f.endsWith(".html"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const r = parseReport(new Uint8Array(readFileSync(new URL(f, reports))));
      if (r.kind !== "report") throw new Error(`${f} did not parse as a report`);
      expect(VEHICLE_PROFILES.matchVin(r.report.header.vin).id, f).toBe("6.7");
    }
  });

  it("matches the other Super Duty bodies with the 6.7L, in lower case too", () => {
    for (const vin of ["1FT8W3BT0CEA00001", "1FDUF5GT0CEA00001", "1ft7w2bt0geA00001"]) {
      expect(SIX_SEVEN.matchesVin(vin), vin).toBe(true);
    }
  });

  it("falls back to Generic for another Ford and for a non-Ford", () => {
    const other = [
      "1FT7W2B60CEA00001", // Super Duty, 6.2L gasoline
      "1FTFW1ET0CFA00001", // F-150, 3.5L EcoBoost (also T at position 8)
      "1FT7W2BT0HEA00001", // 6.7L, model year 2017
      "1FT7W2BT0AEA00001", // model year 2010, before the 6.7
      "1GCUYEED0CZ000001", // Chevrolet
      "1FT7W2BT0CEA0000", // too short
      "",
    ];
    for (const vin of other) {
      expect(VEHICLE_PROFILES.matchVin(vin).id, vin).toBe("generic");
    }
  });
});

describe("the registry", () => {
  const a = { ...GENERIC, id: "a", matchesVin: () => true };
  const b = { ...GENERIC, id: "b", matchesVin: () => true };

  it("lets the first matching Profile win", () => {
    expect(createVehicleProfiles([a, b]).matchVin("X").id).toBe("a");
  });

  it("finds a Profile by id, Generic included", () => {
    expect(VEHICLE_PROFILES.get("6.7")).toBe(SIX_SEVEN);
    expect(VEHICLE_PROFILES.get("generic")).toBe(GENERIC);
    expect(VEHICLE_PROFILES.get("nope")).toBeUndefined();
  });

  it("suggests the 6.7 P0401 pack for 6.7 and nothing for Generic", () => {
    expect(SIX_SEVEN.suggestedPackIds).toEqual(["p0401"]);
    expect(VEHICLE_PROFILES.matchVin("1GCUYEED0CZ000001").suggestedPackIds).toEqual([]);
  });
});

describe("EGR decode fix", () => {
  const HEADER =
    "Time (sec), Engine RPM (RPM), Actual EGR A duty cycle/position (%), Commanded EGR A duty cycle/position (%)";
  const egr = (r: ReturnType<typeof derived>) => ({
    actual: r.channels.egrActual?.values,
    commanded: r.channels.egrCommanded?.values,
  });
  const noFixes: VehicleProfile = { ...SIX_SEVEN, decodeFixes: [] };

  it("rescales a pre-October annotated log and says so", () => {
    const name = "CSVLog_20260821_212246.csv";
    const raw = derived(fixture(name), noFixes);
    const fixed = derived(fixture(name));
    expect(Math.max(...(egr(raw).actual ?? []))).toBeCloseTo(100.98, 1);
    expect(Math.max(...(egr(fixed).actual ?? []))).toBeCloseTo(60.59, 1);
    expect(Math.max(...(egr(fixed).commanded ?? []))).toBeCloseTo(59.61, 1);
    expect(fixed.notices).toEqual([RESCALED_NOTICE]);
    expect(RESCALED_NOTICE).toBe("EGR position rescaled from the pre-October decode");
  });

  it("leaves an October log alone", () => {
    const name = "CSVLog_20261002_175949.csv";
    const raw = derived(fixture(name), noFixes);
    const fixed = derived(fixture(name));
    expect(egr(fixed)).toEqual(egr(raw));
    expect(fixed.notices).toEqual([]);
  });

  it("leaves a log without EGR channels alone", () => {
    expect(derived(fixture("CSVLog_20260725_185037.csv")).notices).toEqual([]);
  });

  it("does not rescale a log that mixes both decodes, and says so", () => {
    // Synthetic: the old decode (to 99.35, off the 100/255 grid) switches to SAE (on the grid) mid-log.
    const rows = [
      "0.1, 700, 98.695656, 99.347824",
      "0.2, 800, 72.608696, 73.26087",
      "0.3, 900, 40, 40.392155",
      "0.4, 950, 59.60784, 59.60784",
      "0.5, 960, 20, 20.392157",
    ];
    const mixed = derived(csv(HEADER, rows));
    expect(egr(mixed)).toEqual({
      actual: [98.695656, 72.608696, 40, 59.60784, 20],
      commanded: [99.347824, 73.26087, 40.392155, 59.60784, 20.392157],
    });
    expect(mixed.notices).toEqual([MIXED_NOTICE]);
    expect(MIXED_NOTICE).toBe("mixed EGR decode, not rescaled");
  });

  it("rescales an old-decode log whose valve stays shut while commanded opens", () => {
    // A stuck-closed valve: actual never passes 62 %, commanded reads the old decode.
    const stuck = derived(csv(HEADER, ["0.1, 700, 0, 0", "0.2, 800, 3.26087, 99.347824"]));
    expect(egr(stuck)).toEqual({ actual: [0, 1.96], commanded: [0, 59.61] });
    expect(stuck.notices).toEqual([RESCALED_NOTICE]);
  });

  it("rescales synthetic data where both channels read the old decode", () => {
    const old = derived(csv(HEADER, ["0.1, 700, 0, 0", "0.2, 800, 99.35, 99.35"]));
    expect(egr(old)).toEqual({ actual: [0, 59.61], commanded: [0, 59.61] });
  });
});

describe("6.7 Channels on the fixture Drive Logs", () => {
  const own = new Set([
    ...(SIX_SEVEN.catalogue?.channels ?? [])
      .map((c) => c.key)
      .filter((k) => !STANDARD_CATALOGUE.channels.some((s) => s.key === k)),
    "ect",
    "dpfSoot",
    "dpfRegen",
  ]);
  const resolved = (name: string) =>
    Object.entries(derived(fixture(name)).channels)
      .filter(([k, c]) => c.known && own.has(k))
      .map(([k]) => k)
      .sort();

  const OCT = [
    "dpfRegen",
    "dpfSoot",
    "ect",
    "egrActual",
    "egrCommanded",
    "egrCoolerBypass",
    "egrvp",
    "exhaustPressure",
    "nox",
  ];
  const AUG = [
    "ect",
    "egrActual",
    "egrCommanded",
    "egrTemp",
    "egrThrottleCmd",
    "egrvp",
    "egt11",
    "exhaustPressure",
    "nox",
  ];

  it("resolves the 6.7 Channels each log carries", () => {
    const expected: Record<string, string[]> = {
      "CSVLog_20260725_185037.csv": ["ect", "egrTemp", "egrThrottleCmd", "egrvp", "egt11"],
      "CSVLog_20260726_175556.csv": [
        "ect",
        "egrActual",
        "egrCommanded",
        "egrTemp",
        "egrThrottleCmd",
        "egrvp",
        "egt11",
      ],
      "CSVLog_20260726_221700.csv": AUG,
      "CSVLog_20260821_212246.csv": AUG,
      "CSVLog_20261002_175845.csv": OCT,
      "CSVLog_20261002_175949.csv": OCT,
      "CSVLog_20261002_182500.csv": OCT,
      "CSVLog_20261002_204254.csv": [...OCT, "egrThrottleCmd"],
      "CSVLog_20261004_172256.csv": [...OCT, "egrThrottleCmd"],
    };
    const files = readdirSync(logs).filter((f) => f.endsWith(".csv"));
    expect(files.sort()).toEqual(Object.keys(expected).sort());
    for (const f of files) expect(resolved(f), f).toEqual([...(expected[f] ?? [])].sort());
  });

  it("hides only columns that are real extras in the fixtures", () => {
    const keys = new Set(
      readdirSync(logs)
        .filter((f) => f.endsWith(".csv"))
        .flatMap((f) => Object.keys(derived(fixture(f)).channels)),
    );
    for (const hidden of SIX_SEVEN.hiddenColumns) expect(keys.has(hidden), hidden).toBe(true);
  });
});
