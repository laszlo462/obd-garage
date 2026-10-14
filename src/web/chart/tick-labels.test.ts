import { describe, expect, it } from "vitest";
import { tickLabels } from "./clock.ts";

const START = 18 * 3600 + 50 * 60 + 39.2;

describe("tickLabels", () => {
  it("labels every tick when each reads differently", () => {
    expect(tickLabels(START, [0, 60, 120], 120)).toEqual(["18:50:39", "18:51:39", "18:52:39"]);
  });

  it("drops the seconds from ticks of a long span", () => {
    expect(tickLabels(START, [0, 600], 600)).toEqual(["18:50", "19:00"]);
  });

  it("prints a label once when ticks over a very short span would repeat it", () => {
    const labels = tickLabels(START, [0, 0.2, 0.4, 0.6], 1);
    expect(labels.filter((l) => l !== "")).toEqual(["18:50:39"]);
    expect(labels).toHaveLength(4);
  });
});
