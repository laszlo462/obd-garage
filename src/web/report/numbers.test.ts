import { describe, expect, it } from "vitest";
import { dec, delta, fmtNum, num } from "./numbers.ts";

describe("num", () => {
  it("reads plain numbers, with thousands commas, and nothing else", () => {
    expect(num("12.5")).toBe(12.5);
    expect(num(" -3 ")).toBe(-3);
    expect(num("1,234.5")).toBe(1234.5);
    expect(num("2e3")).toBe(2000);
    expect(num("P0401")).toBeNaN();
    expect(num("")).toBeNaN();
    expect(num(null)).toBeNaN();
  });
});

describe("dec", () => {
  it("counts the decimals printed", () => {
    expect(dec("12")).toBe(0);
    expect(dec("12.50")).toBe(2);
    expect(dec("12.5 mi")).toBe(1);
  });
});

describe("fmtNum", () => {
  it("groups thousands, keeps the printed decimals and shows the 'no value' sentinels as n/a", () => {
    expect(fmtNum("6303.81")).toBe("6,303.81");
    expect(fmtNum("7492")).toBe("7,492");
    expect(fmtNum("65535")).toBe("n/a");
    expect(fmtNum("4294967295")).toBe("n/a");
    expect(fmtNum("On")).toBe("On");
  });
});

describe("delta", () => {
  it("signs the difference at the finer printed precision", () => {
    expect(delta("6303.81", "5573.08")).toBe("+730.73");
    expect(delta("3", "3.5")).toBe("\u22120.5");
    expect(delta("4", "4.0")).toBe("0");
  });
  it("says changed for text that differs and nothing when equal", () => {
    expect(delta("On", "Off")).toBe("changed");
    expect(delta("On", "On")).toBe("");
  });
});
