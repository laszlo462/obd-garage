import { describe, expect, it } from "vitest";
import { nearestRow } from "./nearest-row.ts";

const t = [0, 1, 2, 4, 8];

describe("nearestRow", () => {
  it("returns the first row at or before the first time", () => {
    expect(nearestRow(t, -5)).toBe(0);
    expect(nearestRow(t, 0)).toBe(0);
  });

  it("returns the last row at or after the last time", () => {
    expect(nearestRow(t, 8)).toBe(4);
    expect(nearestRow(t, 100)).toBe(4);
  });

  it("returns the exact row for a time that is a row", () => {
    expect(nearestRow(t, 2)).toBe(2);
    expect(nearestRow(t, 4)).toBe(3);
  });

  it("returns the nearer row between two rows", () => {
    expect(nearestRow(t, 2.9)).toBe(2);
    expect(nearestRow(t, 3.1)).toBe(3);
    expect(nearestRow(t, 7)).toBe(4);
  });

  it("returns the earlier row at an exact midpoint", () => {
    expect(nearestRow(t, 3)).toBe(2);
    expect(nearestRow(t, 0.5)).toBe(0);
  });

  it("handles a single row and no rows", () => {
    expect(nearestRow([5], 99)).toBe(0);
    expect(nearestRow([], 1)).toBe(-1);
  });
});
