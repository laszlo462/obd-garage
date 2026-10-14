import { describe, expect, it } from "vitest";
import { channelFormat } from "./channel-format.ts";

/** A spread of values from `from` to `to`, including both ends. */
const sweep = (from: number, to: number, steps = 997) =>
  Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);

describe("channelFormat", () => {
  it("uses no decimals for a Channel of whole numbers", () => {
    const f = channelFormat([0, 1200, 800, 3400]);
    expect(f.decimals).toBe(0);
    expect(f.format(1200)).toMatch(/1200$/);
  });

  it("uses more decimals for small fractional Channels than for large ones", () => {
    expect(channelFormat([0.5, 12.25, 3.125]).decimals).toBe(2);
    expect(channelFormat([150.5, 212.25, 180.125]).decimals).toBe(1);
  });

  it("drops the decimals from 1000 up, where they only take room", () => {
    expect(channelFormat([800.5, 1514.25, 3400.75]).decimals).toBe(0);
    expect(channelFormat([800.5, 999.25]).decimals).toBe(1);
  });

  it("gives every value of a Channel the same length across its whole range", () => {
    for (const [from, to] of [
      [0, 3400],
      [-40, 250],
      [0, 100],
      [-0.5, 0.5],
      [0.05, 99.95],
      [-9.5, 10.5],
    ] as const) {
      const values = sweep(from, to);
      const f = channelFormat(values);
      const lengths = new Set(values.map((v) => f.format(v).length));
      expect(lengths.size, `${from}..${to}`).toBe(1);
    }
  });

  it("gives a missing value the same length as a number", () => {
    const values = [0, 3400, null, 120];
    const f = channelFormat(values);
    expect(f.format(null).length).toBe(f.format(3400).length);
    expect(f.format(null).trim()).toBe("–");
  });

  it("keeps the same length for a Channel with no numbers at all", () => {
    const f = channelFormat([null, null]);
    expect(f.format(null).length).toBe(f.format(5).length);
  });

  it("pads with figure spaces so digits stay aligned", () => {
    const f = channelFormat([0, 100]);
    expect(f.format(7)).toBe("  7");
    expect(f.format(100)).toBe("100");
  });
});
