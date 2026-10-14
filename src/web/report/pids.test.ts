import { describe, expect, it } from "vitest";
import type { PidRow } from "../../core/report.ts";
import { groupPids, isSupportRow, pairCards } from "./pids.ts";

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
  it("keeps support rows when asked", () => {
    const g = groupPids([pid("Fuel Type", "Diesel")], { support: true });
    expect(g.flatMap((x) => x.rows)).toHaveLength(1);
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
