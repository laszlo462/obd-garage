import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCatalogue } from "./channels.ts";
import { type DriveLog, parseDriveLog, parseStartTime } from "./drive-log.ts";

const fixture = (name: string) =>
  readFileSync(new URL(`../../test/fixtures/drive-logs/${name}`, import.meta.url));

const parsed = (input: string | Uint8Array, options = {}): DriveLog => {
  const r = parseDriveLog(input, options);
  if (r.kind !== "drive-log") throw new Error(`expected a Drive Log, got ${JSON.stringify(r)}`);
  return r.log;
};

const BOM = "﻿";
const START = "# StartTime = 10/02/2026 05:58:45.9486 PM";
const HEADER = "Time (sec), Engine RPM (RPM), Vehicle speed (MPH), Some Ford Thing (V)";
const synthetic = (rows: string[], { bom = BOM, start = START, header = HEADER } = {}) =>
  `${bom}${[start, header, ...rows].filter((l) => l !== "").join("\r\n")}\r\n`;

describe("parseDriveLog on the fixtures", () => {
  // columns counts Time (sec); collapsed is the count with the standard collapse keys.
  const cases = [
    {
      file: "CSVLog_20260725_185037.csv",
      columns: 24,
      start: "2026-07-25T18:50:37.987",
      firstT: 1.142,
      lastT: 1.142,
      read: 10,
      collapsed: 1,
    },
    {
      file: "CSVLog_20260726_175556.csv",
      columns: 42,
      start: "2026-07-26T17:55:56.435",
      firstT: 2.006,
      lastT: 1079.011,
      read: 2162,
      collapsed: 681,
    },
    {
      file: "CSVLog_20261002_175845.csv",
      columns: 18,
      start: "2026-10-02T17:58:45.948",
      firstT: 0.502,
      lastT: 9.508,
      read: 20,
      collapsed: 12,
    },
    {
      file: "CSVLog_20261002_175949.csv",
      columns: 18,
      start: "2026-10-02T17:59:49.532",
      firstT: 0.505,
      lastT: 917.987,
      read: 1837,
      collapsed: 1793,
    },
  ];

  for (const c of cases) {
    it(`parses ${c.file}`, () => {
      const log = parsed(fixture(c.file));
      expect(Object.keys(log.channels).length + 1).toBe(c.columns);
      expect(log.startTime).toBe(c.start);
      expect(log.t[0]).toBe(c.firstT);
      expect(log.t.at(-1)).toBe(c.lastT);
      expect(log.rows.read).toBe(c.read);
      expect(log.rows.skipped).toBe(0);
      expect(log.rows.collapsed).toBe(c.collapsed);
      expect(log.t.length).toBe(c.collapsed);
      for (const ch of Object.values(log.channels)) expect(ch.values.length).toBe(c.collapsed);
      expect(log.warnings).toEqual([]);
    });
  }

  it("reports the duration from the first to the last non-idle row", () => {
    expect(parsed(fixture("CSVLog_20261002_175949.csv")).duration).toBe(917.482);
    // Collapse leaves one row, but the duration still spans every kept row.
    expect(parsed(fixture("CSVLog_20260725_185037.csv")).duration).toBe(14.809);
  });

  it("maps the 42-column PID set through the catalogue and keeps every extra", () => {
    const log = parsed(fixture("CSVLog_20260726_175556.csv"));
    const known = Object.entries(log.channels).filter(([, c]) => c.known);
    const extras = Object.entries(log.channels).filter(([, c]) => !c.known);
    expect(known.map(([k]) => k)).toEqual([
      "voltage",
      "maf",
      "ambientTemp",
      "baro",
      "ect",
      "oilTemp",
      "map",
    ]);
    expect(extras.map(([k]) => k)).toEqual([
      "extra.exhaust-gas-recirculation-temp-sensor-a-bank-1-sensor-1",
      "extra.exhaust-gas-recirculation-temp-sensor-c-bank-1-sensor-2",
      "extra.exhaust-gas-recirculation-temp-sensor-b-bank-2-sensor-1",
      "extra.exhaust-gas-recirculation-temp-sensor-d-bank-2-sensor-2",
      "extra.charge-air-cooler-temperature-bank-1-sensor-1",
      "extra.charge-air-cooler-temperature-bank-1-sensor-2",
      "extra.charge-air-cooler-temperature-bank-2-sensor-1",
      "extra.charge-air-cooler-temperature-bank-2-sensor-2",
      "extra.exhaust-gas-temperature-bank-1-sensor-1",
      "extra.exhaust-gas-temperature-bank-1-sensor-2",
      "extra.exhaust-gas-temperature-bank-1-sensor-3",
      "extra.exhaust-gas-temperature-bank-1-sensor-4",
      "extra.actual-exhaust-gas-recirculation-a-duty-cycle-or-position",
      "extra.charge-air-cooler-temperature-bank-1-sensor-1-2",
      "extra.commanded-exhaust-gas-recirculation-a-duty-cycle-or-position",
      "extra.distance-since-diagnostic-trouble-codes-cleared",
      "extra.engine-coolant-temperature-sensor-2",
      "extra.exhaust-gas-recirculation-temperature-bank-1-sensor-1",
      "extra.exhaust-gas-recirculation-throttle-plate-measured",
      "extra.exhaust-gas-recirculation-throttle-position-commanded",
      "extra.exhaust-gas-recirculation-valve-position",
      "extra.exhaust-gas-recirculation-valve-position-2",
      "extra.exhaust-gas-temperature-11",
      "extra.exhaust-gas-temperature-12",
      "extra.exhaust-gas-temperature-13",
      "extra.exhaust-gas-temperature-bank-1-sensor-4-2",
      "extra.intake-air-temperature-bank-1-sensor-1",
      "extra.mass-air-flow-in-frequency",
      // The second, identical MAF PID: the first column keeps the "maf" key.
      "extra.mass-air-flow-sensor-a",
      "extra.number-of-warm-ups-since-dtcs-cleared",
      "extra.the-distance-travelled-since-the-mil-was-activated",
      "extra.the-distance-travelled-since-the-mil-was-activated-2",
      "extra.turbocharger-wastegate",
      "extra.variable-geometry-turbocharger",
    ]);
    expect(log.channels.maf).toMatchObject({
      label: "Mass air flow",
      unit: "lb/min",
      header: "Mass air flow sensor A (lb/min)",
    });
  });

  it("parses an annotated log's SAE-named PIDs", () => {
    const log = parsed(fixture("CSVLog_20261002_175949.csv"));
    for (const k of ["load", "rpm", "speed", "maf", "ect", "map", "dpfRegen"]) {
      expect(log.channels[k]?.known, k).toBe(true);
    }
    expect(log.channels.dpfRegen?.unit).toBeUndefined();
    // A vehicle-specific header name: mapping it is a Vehicle Profile alias, so the core keeps it as an extra.
    expect(
      log.channels["extra.dpf-soot-for-pickup-wide-frame-third-vin-position-is-t"]?.known,
    ).toBe(false);
  });

  it("recognises a Drive Log by content, whatever the file is called", () => {
    // Same bytes as a .csv, handed over as if read from a .txt file: the parser never sees a name.
    const bytes = fixture("CSVLog_20261002_175845.csv");
    expect(parseDriveLog(bytes).kind).toBe("drive-log");
    expect(parseDriveLog(bytes.toString("utf8")).kind).toBe("drive-log");
  });
});

describe("parseDriveLog failures and non-Drive-Logs", () => {
  const row = "1.0,600,0,12.5";

  it("fails on a Drive Log without a BOM", () => {
    expect(parseDriveLog(synthetic([row], { bom: "" }))).toMatchObject({
      kind: "failed",
      code: "missing-bom",
    });
  });

  it("fails on a Drive Log without a StartTime line", () => {
    expect(parseDriveLog(synthetic([row], { start: "" }))).toMatchObject({
      kind: "failed",
      code: "missing-start-time",
    });
  });

  it("fails on an unreadable StartTime", () => {
    expect(parseDriveLog(synthetic([row], { start: "# StartTime = yesterday" }))).toMatchObject({
      kind: "failed",
      code: "bad-start-time",
    });
  });

  it("fails on a Drive Log without a Time (sec) column", () => {
    expect(
      parseDriveLog(synthetic(["600,0"], { header: "Engine RPM (RPM), Vehicle speed (MPH)" })),
    ).toMatchObject({ kind: "failed", code: "missing-time-column" });
  });

  it("says a Report or random text is not a Drive Log", () => {
    const report = readFileSync(
      new URL(
        "../../test/fixtures/reports/Diagnostic_Report_2026-10-02_213218.html",
        import.meta.url,
      ),
    );
    expect(parseDriveLog(report)).toEqual({ kind: "not-drive-log" });
    expect(parseDriveLog("hello, world\nthis is not a log\n")).toEqual({ kind: "not-drive-log" });
    expect(parseDriveLog(`${BOM}just some text\n`)).toEqual({ kind: "not-drive-log" });
    expect(parseDriveLog("")).toEqual({ kind: "not-drive-log" });
  });
});

describe("parseDriveLog rows", () => {
  it("skips malformed rows and counts them as a warning", () => {
    const log = parsed(
      synthetic([
        "1.0,600,0,12.5",
        "2.0,610,0", // too few fields
        "3.0,abc,0,12.5", // not a number
        "4.0,620,,12.5", // empty field
        "5.0,630,0,12.5,9", // too many fields
        "6.0,640,0,12.5",
      ]),
    );
    expect(log.rows).toEqual({ read: 6, skipped: 4, idle: 0, collapsed: 2 });
    expect(log.warnings).toEqual(["4 rows skipped"]);
    expect(log.t).toEqual([1, 6]);
  });

  it("drops the all-zero rows logged before the adapter connected", () => {
    const log = parsed(synthetic(["0.000,0,0,0", "0.5,0,0,0", "1.0,600,0,12.5"]));
    expect(log.rows).toMatchObject({ read: 3, idle: 2, collapsed: 1 });
    expect(log.t).toEqual([1]);
  });

  it("accepts a separator with or without a space, and ignores blank lines", () => {
    const log = parsed(synthetic(["1.0, 600, 0, 12.5", "", "2.0,700,0,12.5"]).concat("\r\n\r\n"));
    expect(log.t).toEqual([1, 2]);
    expect(log.channels.rpm?.values).toEqual([600, 700]);
  });

  it("returns a log with no rows when every row is idle", () => {
    const log = parsed(synthetic(["0.000,0,0,0"]));
    expect(log.t).toEqual([]);
    expect(log.duration).toBe(0);
  });
});

describe("held-row collapse", () => {
  const rows = [
    "1.0,600,0,12.5",
    "1.1,600,0,12.6", // only a non-key channel changed: held
    "1.2,600,5,12.6", // still held
    "1.3,650,5,12.6", // rpm changed: new batch
    "1.4,650,5,12.7",
    "1.5,600,5,12.7", // rpm changed back: new batch
  ];

  it("keeps one row per refresh batch with its raw Time (sec)", () => {
    const log = parsed(synthetic(rows));
    expect(log.t).toEqual([1.0, 1.3, 1.5]);
    expect(log.channels.rpm?.values).toEqual([600, 650, 600]);
    expect(log.channels.speed?.values).toEqual([0, 5, 5]);
    expect(log.channels["extra.some-ford-thing"]?.values).toEqual([12.5, 12.6, 12.7]);
  });

  it("is deterministic", () => {
    const input = synthetic(rows);
    expect(parsed(input)).toEqual(parsed(input));
  });

  it("uses every column when no collapse key is present", () => {
    const log = parsed(
      synthetic(["1.0,0,12.5", "1.1,0,12.5", "1.2,5,12.5"], {
        header: "Time (sec), Vehicle speed (MPH), Some Ford Thing (V)",
      }),
    );
    expect(log.t).toEqual([1.0, 1.2]);
  });

  it("takes collapse keys and a catalogue from the caller (a Vehicle Profile)", () => {
    const catalogue = createCatalogue({
      channels: [{ key: "fordThing", label: "Ford thing", aliases: ["Some Ford Thing"] }],
    });
    const log = parsed(synthetic(rows), { catalogue, collapseKeys: ["rpm", "fordThing"] });
    expect(log.channels.fordThing?.known).toBe(true);
    expect(log.t).toEqual([1.0, 1.1, 1.3, 1.4, 1.5]);
  });
});

describe("parseStartTime", () => {
  it("converts to a naive local ISO time", () => {
    expect(parseStartTime("# StartTime = 07/25/2026 06:50:37.9879 PM")).toBe(
      "2026-07-25T18:50:37.987",
    );
    expect(parseStartTime("# StartTime = 1/2/2026 12:05:00 AM")).toBe("2026-01-02T00:05:00");
    expect(parseStartTime("# StartTime = 01/02/2026 12:05:00.5 PM")).toBe(
      "2026-01-02T12:05:00.500",
    );
  });

  it("rejects out-of-range or malformed values", () => {
    expect(parseStartTime("# StartTime = 13/02/2026 01:00:00 PM")).toBeUndefined();
    expect(parseStartTime("# StartTime = 01/02/2026 13:00:00 PM")).toBeUndefined();
    expect(parseStartTime("# StartTime = 2026-01-02 13:00:00")).toBeUndefined();
  });
});
