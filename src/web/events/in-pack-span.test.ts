import { describe, expect, it } from "vitest";
import { inPackSpan } from "./in-pack-span.ts";

const pack = (startSec: number, endSec: number) => ({
  kind: "span",
  category: "pack",
  startSec,
  endSec,
});

describe("inPackSpan", () => {
  it("is true inside a pack span", () => {
    expect(inPackSpan([pack(10, 20)], 15)).toBe(true);
  });

  it("is true on the start edge, false just before it", () => {
    expect(inPackSpan([pack(10, 20)], 10)).toBe(true);
    expect(inPackSpan([pack(10, 20)], 9.99)).toBe(false);
  });

  it("is true on the end edge, false just after it", () => {
    expect(inPackSpan([pack(10, 20)], 20)).toBe(true);
    expect(inPackSpan([pack(10, 20)], 20.01)).toBe(false);
  });

  it("looks at every pack span", () => {
    expect(inPackSpan([pack(10, 20), pack(30, 40)], 35)).toBe(true);
    expect(inPackSpan([pack(10, 20), pack(30, 40)], 25)).toBe(false);
  });

  it("ignores generic spans", () => {
    expect(inPackSpan([{ kind: "span", category: "generic", startSec: 10, endSec: 20 }], 15)).toBe(
      false,
    );
  });
});
