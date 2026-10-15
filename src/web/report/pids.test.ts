import { describe, expect, it } from "vitest";
import type { FreezeFrame, PidRow } from "../../core/report.ts";
import {
  filterPids,
  freezeFrameWas,
  groupPids,
  hideIdleTimers,
  isSupportRow,
  pairCards,
  pidWas,
} from "./pids.ts";

const pid = (
  description: string,
  value: string,
  units = "",
  over: Partial<PidRow> = {},
): PidRow => ({
  pid: "SAE 0x00",
  description,
  value,
  number: Number.isFinite(Number(value)) ? Number(value) : null,
  units,
  ...over,
});

describe("isSupportRow", () => {
  it("spots capability rows that are not readings", () => {
    for (const d of [
      "Supported PIDs 01-20",
      "Location of oxygen sensors",
      "OBD requirements to which vehicle is designed",
      "Fuel Type",
      "Freeze frame DTC",
    ])
      expect(isSupportRow(pid(d, "x")), d).toBe(true);
    expect(isSupportRow(pid("Engine RPM", "800", "RPM"))).toBe(false);
  });
});

describe("groupPids", () => {
  it("files each row under the first matching group, in group order, and drops support rows", () => {
    const rows = [
      pid("Engine coolant temperature", "90", "C"),
      pid("Commanded EGR A duty cycle", "20", "%"),
      pid("Supported PIDs 01-20", "BE1FA813"),
      pid("Engine RPM", "800", "RPM"),
      pid("Something unusual", "1"),
    ];
    const g = groupPids(rows);
    expect(g.map((x) => x.group)).toEqual(["EGR", "Engine & driver", "Temperatures", "Other"]);
    expect(g[1]?.rows.map((r) => r.description)).toEqual(["Engine RPM"]);
  });
});

describe("pidWas", () => {
  it("maps a row to the compared row's value text where it differs", () => {
    const a = pid("Engine RPM", "800", "RPM");
    const b = pid("Vehicle speed", "5", "mph");
    const c = pid("New only", "1");
    const was = pidWas(
      [a, b, c],
      [pid("Engine RPM", "750", "RPM"), pid("Vehicle speed", "5", "mph")],
    );
    expect(was.get(a)).toBe("750");
    expect(was.has(b)).toBe(false);
    expect(was.has(c)).toBe(false);
  });
  it("lines up repeated names by occurrence", () => {
    const first = pid("Same name", "1");
    const second = pid("Same name", "2");
    const was = pidWas([first, second], [pid("Same name", "1"), pid("Same name", "9")]);
    expect(was.has(first)).toBe(false);
    expect(was.get(second)).toBe("9");
  });
  it("is empty with no comparison", () => {
    expect(pidWas([pid("Engine RPM", "800")], null).size).toBe(0);
  });
});

describe("freezeFrameWas", () => {
  const frame = (title: string, rows: PidRow[]): FreezeFrame => ({ title, rows });
  it("matches frames on their title and rows on name", () => {
    const speed = pid("Vehicle speed", "62", "mph");
    const other = pid("Vehicle speed", "10", "mph");
    const was = freezeFrameWas(
      [frame("P0401 - First", [speed]), frame("P0402 - First", [pid("Vehicle speed", "1")])],
      [frame("P0402 - First", [pid("Vehicle speed", "1")]), frame("P0401 - First", [other])],
    );
    expect(was.get(speed)).toBe("10");
    expect(was.size).toBe(1);
  });
  it("is empty with no comparison", () => {
    expect(freezeFrameWas([frame("T", [pid("Vehicle speed", "1")])], null).size).toBe(0);
  });
});

describe("filterPids", () => {
  const rows = [pid("Engine RPM", "800"), pid("Vehicle speed", "5")];
  it("keeps rows whose description contains the text, ignoring case", () => {
    expect(filterPids(rows, "rpm").map((r) => r.description)).toEqual(["Engine RPM"]);
  });
  it("shows everything for an empty or blank filter", () => {
    expect(filterPids(rows, "")).toEqual(rows);
    expect(filterPids(rows, "  ")).toEqual(rows);
  });
});

describe("hideIdleTimers", () => {
  const timer = (n: number, v: string) =>
    pid(`Total run time with EI-AECD #${n} Timer 1 active`, v, "s");
  it("hides timers at 0 here and at 0 or absent in the compared Report", () => {
    const zeroBoth = timer(1, "0");
    const zeroAbsent = timer(2, "0");
    const out = hideIdleTimers([zeroBoth, zeroAbsent, pid("Engine RPM", "0")], [timer(1, "0")]);
    expect(out.rows.map((r) => r.description)).toEqual(["Engine RPM"]);
    expect(out.hidden).toBe(2);
  });
  it("shows a timer above 0 in either Report", () => {
    const now = timer(1, "5");
    const wasPositive = timer(2, "0");
    const out = hideIdleTimers([now, wasPositive], [timer(1, "0"), timer(2, "7")]);
    expect(out.rows).toEqual([now, wasPositive]);
    expect(out.hidden).toBe(0);
  });
  it("hides every timer at 0 with no comparison", () => {
    const out = hideIdleTimers([timer(1, "0"), timer(2, "3")], null);
    expect(out.hidden).toBe(1);
    expect(out.rows).toHaveLength(1);
  });
});

describe("pairCards", () => {
  it("pairs a commanded and an actual reading and measures the gap", () => {
    const cards = pairCards([
      pid("Commanded EGR A duty cycle", "20", "%"),
      pid("Actual EGR A duty cycle", "35", "%"),
    ]);
    expect(cards).toEqual([
      {
        label: "EGR A",
        commanded: "20",
        actual: "35",
        units: "%",
        commandedPct: 20,
        actualPct: 35,
        error: "+15",
        big: true,
      },
    ]);
  });
  it("scales a non-percent pair to 110 % of the larger and calls a small gap not big", () => {
    const [card] = pairCards([
      pid("Commanded fuel rail pressure A", "1000", "kPa"),
      pid("Fuel rail pressure A", "990", "kPa"),
    ]);
    expect(card?.commandedPct).toBeCloseTo(90.9, 1);
    expect(card?.error).toBe("\u221210");
    expect(card?.big).toBe(false);
  });
  it("skips a pair with a missing or non-numeric side", () => {
    expect(pairCards([pid("Commanded EGR A duty cycle", "20", "%")])).toEqual([]);
    expect(
      pairCards([
        pid("Commanded EGR A duty cycle", "N/A", "%"),
        pid("Actual EGR A duty cycle", "35", "%"),
      ]),
    ).toEqual([]);
  });
});
