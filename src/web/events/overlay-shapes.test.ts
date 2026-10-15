import { describe, expect, it } from "vitest";
import { overlayShapes } from "./overlay-shapes.ts";

const ev = (
  kind: "span" | "point",
  category: string,
  startSec: number | null,
  endSec: number | null,
) => ({ kind, category, startSec, endSec });

const range = { min: 10, max: 20 };

describe("overlayShapes", () => {
  it("gives a span inside the range as it is", () => {
    expect(overlayShapes([ev("span", "generic", 12, 15)], range)).toEqual([
      { kind: "span", category: "generic", x0: 12, x1: 15 },
    ]);
  });

  it("clips a span that crosses an edge", () => {
    expect(overlayShapes([ev("span", "pack", 5, 12), ev("span", "pack", 18, 30)], range)).toEqual([
      { kind: "span", category: "pack", x0: 10, x1: 12 },
      { kind: "span", category: "pack", x0: 18, x1: 20 },
    ]);
  });

  it("drops an Event wholly outside the range", () => {
    expect(
      overlayShapes(
        [
          ev("span", "generic", 1, 9),
          ev("span", "generic", 21, 30),
          ev("point", "generic", 25, 25),
        ],
        range,
      ),
    ).toEqual([]);
  });

  it("keeps a point on the edge of the range and drops one just past it", () => {
    expect(
      overlayShapes([ev("point", "generic", 10, 10), ev("point", "generic", 20.5, 20.5)], range),
    ).toEqual([{ kind: "point", category: "generic", x0: 10, x1: 10 }]);
  });

  it("skips an Event with no time", () => {
    expect(overlayShapes([ev("point", "generic", null, null)], range)).toEqual([]);
  });
});
