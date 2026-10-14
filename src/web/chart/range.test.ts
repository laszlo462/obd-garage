import { describe, expect, it } from "vitest";
import { clampRange } from "./range.ts";

const whole = { min: 0, max: 100 };

describe("clampRange", () => {
  it("leaves a range inside the drive alone", () => {
    expect(clampRange({ min: 20, max: 60 }, whole, 2)).toEqual({ min: 20, max: 60 });
  });

  it("slides a range that runs off the start back in, keeping its width", () => {
    expect(clampRange({ min: -10, max: 30 }, whole, 2)).toEqual({ min: 0, max: 40 });
  });

  it("slides a range that runs off the end back in, keeping its width", () => {
    expect(clampRange({ min: 80, max: 120 }, whole, 2)).toEqual({ min: 60, max: 100 });
  });

  it("shows the whole drive for a range wider than it", () => {
    expect(clampRange({ min: -50, max: 200 }, whole, 2)).toEqual(whole);
  });

  it("widens a range narrower than the minimum around its middle", () => {
    expect(clampRange({ min: 50, max: 50.5 }, whole, 2)).toEqual({ min: 49.25, max: 51.25 });
  });

  it("keeps a widened range inside the drive", () => {
    expect(clampRange({ min: 0, max: 0.1 }, whole, 2)).toEqual({ min: 0, max: 2 });
  });
});
