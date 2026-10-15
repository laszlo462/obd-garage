import { describe, expect, it } from "vitest";
import { overlayShapes } from "./overlay-shapes.ts";
import { overlayPattern } from "./overlay-style.ts";

describe("overlayPattern", () => {
  it("draws generic spans, generic points and pack spans in three different patterns, not by hue alone", () => {
    const shapes = overlayShapes(
      [
        { kind: "span", category: "generic", startSec: 1, endSec: 2 },
        { kind: "point", category: "generic", startSec: 3, endSec: 3 },
        { kind: "span", category: "pack", startSec: 4, endSec: 5 },
      ],
      { min: 0, max: 10 },
    );
    expect(shapes.map(overlayPattern)).toEqual(["fill", "dashed-line", "hatch"]);
  });
});
