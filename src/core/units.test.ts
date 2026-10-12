import { describe, expect, it } from "vitest";
import { convert, normaliseUnit } from "./units.ts";

describe("convert", () => {
  it("converts temperature both ways", () => {
    expect(convert([212, 32, -40], "°F", "°C")).toEqual({ ok: true, values: [100, 0, -40] });
    expect(convert([100, 0], "°C", "°F")).toEqual({ ok: true, values: [212, 32] });
  });

  it("converts pressure both ways", () => {
    const r = convert([29.92], "inHg", "kPa");
    expect(r.ok && r.values[0]).toBeCloseTo(101.32, 2);
    const back = convert([101.325], "kPa", "inHg");
    expect(back.ok && back.values[0]).toBeCloseTo(29.92, 2);
    const psi = convert([14.6959], "psi", "kPa");
    expect(psi.ok && psi.values[0]).toBeCloseTo(101.325, 2);
    const kpa = convert([100], "kPa", "psi");
    expect(kpa.ok && kpa.values[0]).toBeCloseTo(14.5038, 3);
    const hg = convert([29.92], "inHg", "psi");
    expect(hg.ok && hg.values[0]).toBeCloseTo(14.696, 2);
  });

  it("converts speed both ways", () => {
    const r = convert([60], "mph", "km/h");
    expect(r.ok && r.values[0]).toBeCloseTo(96.56, 2);
    const back = convert([96.56064], "km/h", "mph");
    expect(back.ok && back.values[0]).toBeCloseTo(60, 4);
  });

  it("is the identity for the same unit, known or not", () => {
    expect(convert([1, 2], "°C", "°C")).toEqual({ ok: true, values: [1, 2] });
    expect(convert([1, 2], "rpm", "rpm")).toEqual({ ok: true, values: [1, 2] });
    expect(convert([1, 2], "RPM", "rpm")).toEqual({ ok: true, values: [1, 2] });
  });

  it("accepts common spellings of a unit", () => {
    expect(normaliseUnit(" degF ")).toBe("°F");
    expect(normaliseUnit("kph")).toBe("km/h");
    expect(convert([212], "F", "C")).toEqual({ ok: true, values: [100] });
  });

  it("never guesses: unknown or cross-quantity pairs are not convertible and name the units", () => {
    for (const [from, to] of [
      ["furlong", "°C"],
      ["°C", "kPa"],
      ["mph", "psi"],
    ] as const) {
      const r = convert([1], from, to);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toContain(from);
        expect(r.reason).toContain(to);
      }
    }
  });

  it("does not mutate its input", () => {
    const input = [212];
    convert(input, "°F", "°C");
    expect(input).toEqual([212]);
  });
});
