import { describe, expect, it } from "vitest";
import { createGestureTracker } from "./gesture-tracker.ts";

/** A plot 400 px wide showing 0 to 100 s. Touch points are in plot-local pixels. */
const view = { width: 400, min: 0, max: 100 };
const at = (x: number, y = 50) => ({ x, y });
const tracker = (v: { width: number; min: number; max: number } = view) =>
  createGestureTracker(() => v);

describe("one finger: tap", () => {
  it("a touch that lifts without moving is a tap at where it landed", () => {
    const g = tracker();
    expect(g.start([at(100)])).toEqual({ type: "none" });
    expect(g.end([])).toEqual({ type: "tap", x: 100 });
  });

  it("a wobble under the slop is still a tap", () => {
    const g = tracker();
    g.start([at(100, 50)]);
    expect(g.move([at(105, 54)])).toEqual({ type: "none" });
    expect(g.end([])).toEqual({ type: "tap", x: 100 });
  });
});

describe("one finger: scrub and the direction lock", () => {
  it("a sideways drag past the slop scrubs, and keeps scrubbing as the finger drifts vertically", () => {
    const g = tracker();
    g.start([at(100, 50)]);
    expect(g.move([at(112, 52)])).toEqual({ type: "scrub", x: 112 });
    expect(g.move([at(150, 90)])).toEqual({ type: "scrub", x: 150 });
    expect(g.end([])).toEqual({ type: "none" });
  });

  it("a vertical drag past the slop locks to the page scroll and never scrubs or taps", () => {
    const g = tracker();
    g.start([at(100, 50)]);
    expect(g.move([at(102, 70)])).toEqual({ type: "none" });
    expect(g.move([at(300, 72)])).toEqual({ type: "none" });
    expect(g.end([])).toEqual({ type: "none" });
  });

  it("the slop is 8 px: a move of 8 stays undecided, 9 locks", () => {
    const undecided = tracker();
    undecided.start([at(100, 50)]);
    expect(undecided.move([at(108, 50)])).toEqual({ type: "none" });
    expect(undecided.move([at(109, 50)])).toEqual({ type: "scrub", x: 109 });
  });

  it("an exactly diagonal drag scrolls the page", () => {
    const g = tracker();
    g.start([at(100, 50)]);
    expect(g.move([at(120, 70)])).toEqual({ type: "none" });
  });
});

describe("two fingers", () => {
  it("a pinch out zooms around the midpoint, which stays on the same time", () => {
    const g = tracker();
    g.start([at(150), at(250)]); // midpoint x 200 is 50 s; spread 100
    expect(g.move([at(100), at(300)])).toEqual({ type: "pinch", min: 25, max: 75 });
  });

  it("a pinch whose midpoint also moves keeps the time under the midpoint", () => {
    const g = tracker();
    g.start([at(150), at(250)]);
    // spread 200, midpoint 220: 50 s sits under x 220, so min = 50 - 0.55 * 50.
    const intent = g.move([at(120), at(320)]);
    expect(intent.type).toBe("pinch");
    if (intent.type !== "pinch") return;
    expect(intent.min).toBeCloseTo(22.5, 9);
    expect(intent.max).toBeCloseTo(72.5, 9);
  });

  it("a pinch in zooms out", () => {
    const g = tracker();
    g.start([at(100), at(300)]);
    expect(g.move([at(150), at(250)])).toEqual({ type: "pinch", min: -50, max: 150 });
  });

  it("two fingers sliding together pan without changing the width of the range", () => {
    const g = tracker();
    g.start([at(150), at(250)]);
    // Content follows the fingers 50 px right = 12.5 s, so the range moves 12.5 s left.
    expect(g.move([at(200), at(300)])).toEqual({ type: "pan", min: -12.5, max: 87.5 });
  });

  it("changes under the slop do nothing yet", () => {
    const g = tracker();
    g.start([at(150), at(250)]);
    expect(g.move([at(152), at(252)])).toEqual({ type: "none" });
  });

  it("works from the range on screen when the second finger lands, not the range at the first", () => {
    let current = { width: 400, min: 0, max: 100 };
    const g = createGestureTracker(() => current);
    g.start([at(100)]);
    current = { width: 400, min: 20, max: 60 };
    g.move([at(100, 52)]);
    expect(g.start([at(100), at(300)])).toEqual({ type: "none" });
    // Midpoint 200 is 40 s; the spread doubles, so 40 s wide becomes 20 s wide around 40 s.
    expect(g.move([at(0), at(400)])).toEqual({ type: "pinch", min: 30, max: 50 });
  });

  it("does not shrink the spread below 20 px when the fingers start touching", () => {
    const g = tracker();
    g.start([at(199), at(201)]);
    // Spread counts as 20, so a spread of 40 halves the range: 50 s wide around the midpoint (50 s).
    expect(g.move([at(180), at(220)])).toEqual({ type: "pinch", min: 25, max: 75 });
  });

  it("lifting one finger ends the gesture: the leftover finger neither scrubs nor taps", () => {
    const g = tracker();
    g.start([at(150), at(250)]);
    g.move([at(100), at(300)]);
    expect(g.end([at(300)])).toEqual({ type: "none" });
    expect(g.move([at(340, 52)])).toEqual({ type: "none" });
    expect(g.end([])).toEqual({ type: "none" });
  });
});

describe("cancel", () => {
  it("forgets the gesture, so the next one starts clean", () => {
    const g = tracker();
    g.start([at(100)]);
    g.move([at(150)]);
    g.cancel();
    expect(g.move([at(160)])).toEqual({ type: "none" });
    expect(g.end([])).toEqual({ type: "none" });
  });
});
