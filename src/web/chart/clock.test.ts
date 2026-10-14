import { describe, expect, it } from "vitest";
import { clockAt, elapsedAt, startSecondOfDay } from "./clock.ts";

describe("startSecondOfDay", () => {
  it("reads the time of day from the naive start time as text", () => {
    expect(startSecondOfDay("2026-10-02T17:58:45.9486")).toBeCloseTo(
      17 * 3600 + 58 * 60 + 45.9486,
      4,
    );
    expect(startSecondOfDay("2026-10-02T00:00:00")).toBe(0);
  });

  it("is 0 when there is no start time", () => {
    expect(startSecondOfDay("")).toBe(0);
  });
});

describe("clockAt", () => {
  const start = startSecondOfDay("2026-10-02T17:58:45.9486");

  it("adds the elapsed seconds to the start and shows whole seconds", () => {
    expect(clockAt(start, 0)).toBe("17:58:45");
    expect(clockAt(start, 1350)).toBe("18:21:15");
  });

  it("wraps past midnight", () => {
    expect(clockAt(startSecondOfDay("2026-10-02T23:59:50"), 20)).toBe("00:00:10");
  });

  it("can drop the seconds for axis labels", () => {
    expect(clockAt(start, 0, false)).toBe("17:58");
  });
});

describe("elapsedAt", () => {
  it("shows minutes and seconds with a plus", () => {
    expect(elapsedAt(0)).toBe("+0:00");
    expect(elapsedAt(59.9)).toBe("+0:59");
    expect(elapsedAt(22 * 60 + 32)).toBe("+22:32");
  });

  it("adds hours past 60 minutes", () => {
    expect(elapsedAt(3600 + 5 * 60 + 9)).toBe("+1:05:09");
  });
});
