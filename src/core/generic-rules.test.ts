import { describe, expect, it } from "vitest";
import type { ChannelKey, LogColumn } from "./channels.ts";
import { engineStart, peaks } from "./generic-rules.ts";
import type { RuleLog } from "./rules.ts";

const log = (t: number[], cols: Record<ChannelKey, LogColumn>): RuleLog => ({
  t,
  channels: new Map(Object.entries(cols)),
});
const ctx = { params: {} };

describe("engine start", () => {
  it("declares rpm as its need", () => {
    expect(engineStart.needs).toEqual(["rpm"]);
  });

  it("marks the first sample above 400 rpm after a 0 rpm sample", () => {
    const l = log([0, 1, 2, 3], { rpm: { unit: "RPM", values: [0, 0, 250, 820] } });
    expect(engineStart.run(l, ctx)).toEqual([
      {
        kind: "point",
        t0: 3,
        t1: 3,
        title: "Engine start",
        text: "Engine RPM rose from 0 to 820 rpm.",
      },
    ]);
  });

  it("is silent when the engine is already running at log start", () => {
    const l = log([0, 1, 2], { rpm: { unit: "RPM", values: [700, 750, 800] } });
    expect(engineStart.run(l, ctx)).toEqual([]);
  });

  it("is silent when rpm never exceeds 400", () => {
    const l = log([0, 1, 2], { rpm: { unit: "RPM", values: [0, 300, 400] } });
    expect(engineStart.run(l, ctx)).toEqual([]);
  });

  it("reports one Event for a log that stalls and restarts", () => {
    const l = log([0, 1, 2, 3, 4], { rpm: { unit: "RPM", values: [0, 800, 0, 0, 900] } });
    expect(engineStart.run(l, ctx)).toHaveLength(1);
  });

  it("ignores missing samples", () => {
    const l = log([0, 1, 2], { rpm: { unit: "RPM", values: [Number.NaN, 0, 600] } });
    expect(engineStart.run(l, ctx)).toHaveLength(1);
  });
});

describe("peaks", () => {
  const full = log([0, 1, 2, 3], {
    rpm: { unit: "RPM", values: [800, 2150, 1200, 900] },
    speed: { unit: "MPH", values: [0, 10, 62.1371, 30] },
    ect: { unit: "°F", values: [100, 140, 176, 170] },
  });

  it("emits one point Event per channel at its maximum, speed in km/h and ECT in °C", () => {
    const events = peaks.run(full, ctx);
    if (!Array.isArray(events)) throw new Error("expected events");
    expect(events.map((e) => [e.title, e.t0, e.t1, e.kind])).toEqual([
      ["Peak engine speed", 1, 1, "point"],
      ["Peak vehicle speed", 2, 2, "point"],
      ["Peak coolant temperature", 2, 2, "point"],
    ]);
    expect(events.map((e) => e.text)).toEqual([
      "Engine RPM peaked at 2150 rpm.",
      "Vehicle speed peaked at 100 km/h.",
      "Engine coolant temperature peaked at 80 °C.",
    ]);
  });

  it("takes the first sample on a tie", () => {
    const l = log([0, 1, 2], { rpm: { unit: "RPM", values: [900, 900, 100] } });
    const events = peaks.run(l, ctx);
    expect(Array.isArray(events) && events[0]?.t0).toBe(0);
  });

  it("still runs for the channels present when ECT is missing", () => {
    const l = log([0, 1], {
      rpm: { unit: "RPM", values: [800, 900] },
      speed: { unit: "km/h", values: [0, 50] },
    });
    const events = peaks.run(l, ctx);
    expect(Array.isArray(events) && events.map((e) => e.title)).toEqual([
      "Peak engine speed",
      "Peak vehicle speed",
    ]);
  });

  it("needs at least one of rpm, speed and ECT", () => {
    expect(peaks.needs).toEqual([]);
    expect(peaks.needsAny).toEqual(["rpm", "speed", "ect"]);
  });

  it("is not applicable when no peak channel has a usable unit", () => {
    const l = log([0, 1], {
      rpm: { values: [800, 900] },
      speed: { unit: "furlongs", values: [1, 2] },
    });
    const result = peaks.run(l, ctx);
    expect(Array.isArray(result)).toBe(false);
    expect(result).toMatchObject({ notApplicable: expect.stringContaining("rpm") });
  });
});
