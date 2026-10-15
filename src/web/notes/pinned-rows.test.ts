import { describe, expect, it } from "vitest";
import { pinnedRows } from "./pinned-rows.ts";

const t = [0, 10, 20, 30];
const note = (id: number, snappedTimeSec: number | null, pinnedTimeSec = snappedTimeSec) => ({
  id,
  snappedTimeSec,
  pinnedTimeSec,
});

describe("pinnedRows", () => {
  it("puts a Note on the row whose time is its snapped time", () => {
    const rows = pinnedRows([note(1, 20)], t);
    expect([...rows.keys()]).toEqual([2]);
    expect(rows.get(2)?.map((n) => n.id)).toEqual([1]);
  });

  it("puts a Note whose snapped time lies between rows on the nearest row", () => {
    const rows = pinnedRows([note(1, 26)], t);
    expect([...rows.keys()]).toEqual([3]);
  });

  it("skips a whole-upload Note and a pinned Note without a snapped time", () => {
    const rows = pinnedRows([note(1, null, null), note(2, null, 15)], t);
    expect(rows.size).toBe(0);
  });

  it("collects several Notes on one row, in list order", () => {
    const rows = pinnedRows([note(1, 10), note(2, 10), note(3, 30)], t);
    expect(rows.get(1)?.map((n) => n.id)).toEqual([1, 2]);
    expect(rows.get(3)?.map((n) => n.id)).toEqual([3]);
  });
});
