import { describe, expect, it } from "vitest";
import type { Mode06Test } from "../../core/report.ts";
import {
  band,
  groupMisfires,
  headroom,
  isMisfire,
  isOpen,
  limitsWasText,
  scaleFor,
  sortLeastHeadroom,
} from "./mode06.ts";

describe("limitsWasText", () => {
  it("writes the other Report's limits as 'limits were a – b', with 'none' for an open one", () => {
    expect(limitsWasText({ min: 0, max: 12.5 })).toBe("limits were 0 – 12.5");
    expect(limitsWasText({ min: 1000, max: 65535 })).toBe("limits were 1,000 – none");
    expect(limitsWasText({ min: null, max: 10 })).toBe("limits were none – 10");
  });
});

const t06 = (over: Partial<Mode06Test> = {}): Mode06Test => ({
  mid: "$01",
  midName: "Exhaust Gas Sensor Monitor Bank 1 \u2013 Sensor 1",
  tid: "$90",
  tidName: "Manufacturer Defined",
  valueText: "5",
  minText: "0",
  maxText: "10",
  value: 5,
  min: 0,
  max: 10,
  units: "sec",
  result: "Pass",
  ...over,
});

describe("isOpen", () => {
  it("treats a missing number and the scaling end stops as 'no limit'", () => {
    expect(isOpen(null)).toBe(true);
    expect(isOpen(65535)).toBe(true);
    expect(isOpen(-32768)).toBe(true);
    expect(isOpen(4294967295)).toBe(true);
    expect(isOpen(327.67)).toBe(true);
    expect(isOpen(0)).toBe(false);
    expect(isOpen(6)).toBe(false);
    expect(isOpen(65000)).toBe(false);
  });
});

describe("headroom", () => {
  it("is the distance to the nearest limit, as a fraction of the min-max span", () => {
    const h = headroom(t06({ value: 9, min: 0, max: 10 }));
    expect(h).toEqual({ abs: 1, frac: 0.1, side: "max" });
    expect(headroom(t06({ value: 2, min: 0, max: 10 }))).toEqual({
      abs: 2,
      frac: 0.2,
      side: "min",
    });
  });
  it("gives a distance but no fraction for a one-sided limit", () => {
    expect(headroom(t06({ value: 7, min: 3, max: 65535 }))).toEqual({
      abs: 4,
      frac: null,
      side: "min",
    });
  });
  it("is null with no value or no limits", () => {
    expect(headroom(t06({ value: null }))).toBeNull();
    expect(headroom(t06({ min: null, max: 65535 }))).toBeNull();
  });
});

describe("band", () => {
  it("is bad under 5 %, warn under 20 %, ok otherwise", () => {
    const at = (v: number) => band(t06({ value: v, min: 0, max: 100 }));
    expect(at(4)).toBe("bad");
    expect(at(5)).toBe("warn");
    expect(at(19)).toBe("warn");
    expect(at(20)).toBe("ok");
    expect(at(50)).toBe("ok");
  });
  it("has no band for a one-sided or limitless test, and is bad for a failed one", () => {
    expect(band(t06({ min: null, max: 65535 }))).toBeNull();
    expect(band(t06({ min: 3, max: 65535, value: 4 }))).toBeNull();
    expect(band(t06({ result: "Fail", value: 50, min: 0, max: 100 }))).toBe("bad");
  });
});

describe("scaleFor", () => {
  it("maps limits and values to 0-100 with a margin, and gives open sides extra room", () => {
    const two = scaleFor(t06({ value: 5, min: 0, max: 10 }));
    expect(two?.(5)).toBeCloseTo(50, 5);
    expect(two?.(0)).toBeCloseTo(6.9, 1);
    const open = scaleFor(t06({ value: 5, min: 0, max: 65535 }));
    expect(open?.(5)).toBeCloseTo(57.4, 1);
  });
  it("clamps to 0-100, includes the compared Report's points and is null with nothing to plot", () => {
    const s = scaleFor(t06({ value: 5, min: 0, max: 10 }), t06({ value: 30, min: 0, max: 10 }));
    expect(s?.(1000)).toBe(100);
    expect(s?.(-1000)).toBe(0);
    expect(s?.(5)).toBeLessThan(50);
    expect(scaleFor(t06({ value: null, min: null, max: null }))).toBeNull();
  });
});

describe("sortLeastHeadroom", () => {
  it("puts failures first, then the smallest fraction, and the one-sided tests last", () => {
    const wide = t06({ tid: "$A", value: 50, min: 0, max: 100 });
    const tight = t06({ tid: "$B", value: 98, min: 0, max: 100 });
    const oneSided = t06({ tid: "$C", value: 5, min: 3, max: 65535 });
    const failed = t06({ tid: "$D", result: "Fail", value: 500, min: 0, max: 100 });
    expect(sortLeastHeadroom([wide, oneSided, tight, failed]).map((t) => t.tid)).toEqual([
      "$D",
      "$B",
      "$A",
      "$C",
    ]);
  });
  it("does not change the input order", () => {
    const a = t06({ tid: "$A" });
    const input = [t06({ tid: "$B", value: 9.9 }), a];
    sortLeastHeadroom(input);
    expect(input.map((t) => t.tid)).toEqual(["$B", "$A"]);
  });
});

describe("misfire grouping", () => {
  const mis = (cyl: number, tid: string, value: number | null, mid = 0xa1 + cyl) =>
    t06({
      mid: `$${mid.toString(16).toUpperCase()}`,
      midName: `Misfire Cylinder ${cyl} Data`,
      tid,
      tidName: "Misfire counts for last 10 driving cycles (EWMA)",
      value,
      valueText: String(value),
    });
  it("tells misfire MIDs ($A1 to $B1 named misfire) from other tests", () => {
    expect(isMisfire(mis(1, "$0B", 0))).toBe(true);
    expect(isMisfire(t06({ mid: "$A5", midName: "Something else" }))).toBe(false);
    expect(isMisfire(t06())).toBe(false);
  });
  it("makes one row per TID and one column per cylinder, with a gap where a pair is missing", () => {
    const g = groupMisfires([mis(1, "$0B", 0), mis(2, "$0B", 3), mis(1, "$0C", 1), t06()]);
    expect(g.cylinders).toEqual(["1", "2"]);
    expect(g.rows.map((r) => r.tid)).toEqual(["$0B", "$0C"]);
    expect(g.rows[0]?.cells.map((c) => c?.value)).toEqual([0, 3]);
    expect(g.rows[1]?.cells.map((c) => c?.value)).toEqual([1, undefined]);
    expect(g.rows[1]?.cells[1]).toBeNull();
    expect(g.rows[0]?.name).toBe("last 10 driving cycles");
  });
  it("is empty when the Report has no misfire tests", () => {
    expect(groupMisfires([t06()])).toEqual({ cylinders: [], rows: [] });
  });
});
