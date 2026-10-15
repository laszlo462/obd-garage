import { describe, expect, it } from "vitest";
import { tableWindow } from "./table-window.ts";

describe("tableWindow", () => {
  it("centres the window on the cursor row, 5 rows each side of an 11-row window", () => {
    expect(tableWindow(50, 100, 11)).toEqual({ start: 45, end: 56 });
  });

  it("stops at the first row, keeping the full size", () => {
    expect(tableWindow(0, 100, 11)).toEqual({ start: 0, end: 11 });
    expect(tableWindow(3, 100, 11)).toEqual({ start: 0, end: 11 });
  });

  it("stops at the last row, keeping the full size", () => {
    expect(tableWindow(99, 100, 11)).toEqual({ start: 89, end: 100 });
    expect(tableWindow(96, 100, 11)).toEqual({ start: 89, end: 100 });
  });

  it("shows every row of a log shorter than the window", () => {
    expect(tableWindow(2, 4, 11)).toEqual({ start: 0, end: 4 });
  });

  it("shows nothing for a log with no rows", () => {
    expect(tableWindow(0, 0, 11)).toEqual({ start: 0, end: 0 });
  });
});
