import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { monitorState, type ParsedReport, parseReport } from "./report.ts";

const fixture = (name: string) =>
  readFileSync(new URL(`../../test/fixtures/reports/${name}`, import.meta.url), "utf8");

const OCT = fixture("Diagnostic_Report_2026-10-02_213218.html");
const AUG = fixture("Diagnostic Report 2026-08-21 215710.html");

const parsed = (html: string): ParsedReport => {
  const r = parseReport(html);
  if (r.kind !== "report") throw new Error(`expected a report, got ${JSON.stringify(r)}`);
  return r.report;
};

describe("parseReport header", () => {
  it.each([
    { name: "October", html: OCT, date: "2026-10-02T21:32:14" },
    { name: "August", html: AUG, date: "2026-08-21T21:56:40" },
  ])("reads VIN, naive local date and Year Make Model ($name)", ({ html, date }) => {
    const { header } = parsed(html);
    expect(header.vin).toBe("1FT7W2BT5CE000001");
    expect(header.date).toBe(date);
    expect(header.year).toBe(2012);
    expect(header.make).toBe("Ford");
    expect(header.model).toBe("S-Duty F250-F550");
  });
});

describe("parseReport sections", () => {
  it.each([
    { name: "October", html: OCT, rpm: 598 },
    { name: "August", html: AUG, rpm: 596.5 },
  ])("reads all eight sections with their counts ($name)", ({ html, rpm }) => {
    const r = parsed(html);
    expect(r.overview?.mil).toBe("on");
    expect(r.overview?.ready).toBe(false);
    expect(r.overview?.confirmedCount).toBe(1);
    expect(r.overview?.standard).toBe("WI - 2001 and newer");
    expect(r.overview?.reasons).toContainEqual({ ecu: "ECM-EngineControl", text: "The MIL is On" });
    expect(r.overview?.additional).toHaveLength(5);
    expect(r.vehicleInfo).toHaveLength(9);
    expect(r.monitors?.map((m) => [m.ecu, m.tests.length])).toEqual([
      ["ECM-EngineControl", 11],
      ["TCM-TransmisCtrl", 11],
    ]);
    expect(r.dtcs).toHaveLength(4);
    expect(r.freezeFrames).toHaveLength(1);
    expect(r.freezeFrames?.[0]?.rows).toHaveLength(81);
    expect(r.liveData).toHaveLength(132);
    expect(r.mode06).toHaveLength(46);
    expect(r.iumpr).toHaveLength(16);
    expect(r.liveData?.[1]).toEqual({
      pid: "SAE 0x0C",
      description: "Engine RPM",
      value: String(rpm),
      number: rpm,
      units: "RPM",
    });
  });

  it("collapses a DTC's rows into one entry with its statuses", () => {
    const p0401 = parsed(OCT).dtcs?.find((d) => d.code === "P0401");
    expect(p0401).toEqual({
      ecu: "ECM-EngineControl",
      code: "P0401",
      type: "Powertrain",
      description: 'EGR "A" Flow Insufficient Detected',
      statuses: ["Confirmed", "Pending", "Permanent"],
      uds: [],
    });
    expect(parsed(OCT).dtcs?.find((d) => d.code === "B1B58-11")?.uds).toHaveLength(5);
  });

  it("reads a Mode $06 test with its limits", () => {
    expect(parsed(OCT).mode06?.[0]).toEqual({
      mid: "$01",
      midName: "Exhaust Gas Sensor Monitor Bank 1 – Sensor 1",
      tid: "$90",
      tidName: "Manufacturer Defined",
      valueText: "3",
      minText: "0",
      maxText: "6",
      value: 3,
      min: 0,
      max: 6,
      units: "sec",
      result: "Pass",
    });
  });

  it("exposes freeze-frame PIDs by Description, with the DTC that stored the frame", () => {
    const frame = parsed(OCT).freezeFrames?.[0];
    expect(frame?.title).toBe("P0401 - First Occurrence");
    expect(frame?.dtc).toBe("P0401");
    expect(frame?.rows.find((r) => r.description === "Engine RPM")).toMatchObject({
      value: "1346",
      number: 1346,
      units: "RPM",
    });
  });

  it("classifies readiness monitors", () => {
    const [ecm, tcm] = parsed(OCT).monitors ?? [];
    expect(ecm?.tests[0]).toEqual({
      name: "Misfire",
      continuous: true,
      status: "ECU has completed this test",
      state: "complete",
    });
    expect(tcm?.tests[0]?.state).toBe("na");
  });

  it("reads the IUMPR counters and Vehicle info", () => {
    const r = parsed(OCT);
    expect(r.iumpr?.[0]).toEqual({
      ecu: "ECM-EngineControl",
      counter: "0x00",
      description: "OBD Monitoring Conditions Encountered Counts",
      value: "2498",
    });
    expect(r.vehicleInfo?.[0]).toEqual({
      description: "Vehicle Identification Number",
      value: "1FT7W2BT5CE000001",
    });
  });
});

describe("parseReport failures and variants", () => {
  // OBDLink puts a narrow no-break space before AM/PM, so replace the whole line.
  const withDate = (date: string) => OCT.replace(/(<b>Date:<\/b>)[^<]*/, `$1 ${date}`);

  const without = (html: string, re: RegExp) => {
    expect(html).toMatch(re);
    return html.replace(re, "");
  };

  it("fails with a typed failure when the VIN is missing", () => {
    const r = parseReport(without(OCT, /<b>VIN:<\/b>[^<]*<br \/>/));
    expect(r).toMatchObject({ kind: "failed", code: "missing-vin" });
  });

  it("fails with a typed failure when the date is missing or unreadable", () => {
    expect(parseReport(without(OCT, /<b>Date:<\/b>[^<]*<br \/>/))).toMatchObject({
      kind: "failed",
      code: "missing-date",
    });
    expect(parseReport(withDate("13/45/2026 9:32:14 PM"))).toMatchObject({
      kind: "failed",
      code: "bad-date",
    });
  });

  it("parses with a section absent when that section is removed", () => {
    const start = OCT.indexOf("<h2>Mode $06");
    const end = OCT.indexOf("<div><hr />", start);
    expect(start).toBeGreaterThan(0);
    const r = parsed(OCT.slice(0, start) + OCT.slice(end));
    expect(r.mode06).toBeUndefined();
    expect(r.iumpr).toHaveLength(16);
    expect("mode06" in r).toBe(false);
  });

  it("reads a 24-hour Date: line as naive local time", () => {
    expect(parsed(withDate("10/2/2026 21:32:14")).header.date).toBe("2026-10-02T21:32:14");
    expect(parsed(withDate("10/2/2026 12:05:00 AM")).header.date).toBe("2026-10-02T00:05:00");
  });

  it("says not-report for other files", () => {
    expect(parseReport("StartTime,Time (sec)\n1,2")).toEqual({ kind: "not-report" });
    expect(parseReport("<html><body><p>hello</p></body></html>")).toEqual({ kind: "not-report" });
  });

  it("accepts bytes", () => {
    expect(parseReport(new TextEncoder().encode(OCT)).kind).toBe("report");
  });

  it("keeps a script tag or markup in a cell as plain text", () => {
    const evil = OCT.replace(
      "<td>Misfire</td>",
      "<td>Mis<script>alert(1)</script><b>fire</b><img src=x onerror=alert(2)><br/>two</td>",
    );
    const r = parsed(evil);
    const name = r.monitors?.[0]?.tests[0]?.name ?? "";
    expect(name).toContain("Mis");
    expect(name).toContain("fire");
    expect(name).not.toMatch(/[<>]/);
    expect(JSON.stringify(r)).not.toMatch(/<script|<img|<b>/);
  });
});

describe("monitorState", () => {
  it("reads a bare 'Incomplete' as incomplete", () => {
    expect(monitorState("Incomplete")).toBe("incomplete");
  });

  it("reads 'Test incomplete' as incomplete", () => {
    expect(monitorState("Test incomplete")).toBe("incomplete");
  });

  it("reads 'ECU has completed this test' as complete", () => {
    expect(monitorState("ECU has completed this test")).toBe("complete");
  });

  it("reads 'ECU has not completed this test' as incomplete", () => {
    expect(monitorState("ECU has not completed this test")).toBe("incomplete");
  });

  it("reads 'not supported' as na", () => {
    expect(monitorState("not supported")).toBe("na");
  });
});
