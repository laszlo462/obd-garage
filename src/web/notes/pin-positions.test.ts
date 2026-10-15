import { describe, expect, it } from "vitest";
import { pinPositions } from "./pin-positions.ts";

const t = [0, 10, 20, 30, 40];

describe("pinPositions", () => {
  it("places a pinned row at its fraction of the visible range", () => {
    expect(pinPositions([1, 3], t, { min: 0, max: 40 })).toEqual([
      { row: 1, fraction: 0.25 },
      { row: 3, fraction: 0.75 },
    ]);
  });

  it("drops rows outside the range and keeps those on its edges", () => {
    expect(pinPositions([0, 1, 2, 3, 4], t, { min: 10, max: 30 })).toEqual([
      { row: 1, fraction: 0 },
      { row: 2, fraction: 0.5 },
      { row: 3, fraction: 1 },
    ]);
  });
});
