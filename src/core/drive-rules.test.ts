import { describe, expect, it } from "vitest";
import type { ChannelKey, LogColumn } from "./channels.ts";
import { cruise, idle, regen } from "./drive-rules.ts";
import type { EventDraft, NotApplicable, Params, RuleLog } from "./rules.ts";

const log = (t: number[], cols: Record<ChannelKey, LogColumn>): RuleLog => ({
  t,
  channels: new Map(Object.entries(cols)),
});
const secs = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);
const flat = (n: number, v: number) => secs(n).map(() => v);
const ctx = (params: Params = {}) => ({ params });
const events = (r: EventDraft[] | NotApplicable) => {
  if (!Array.isArray(r)) throw new Error(`expected events, got ${JSON.stringify(r)}`);
  return r;
};

describe("idle", () => {
  const idleLog = (secondsIdle: number, unit = "km/h") =>
    log(secs(secondsIdle), {
      rpm: { unit: "RPM", values: flat(secondsIdle, 700) },
      speed: { unit, values: flat(secondsIdle, 0) },
    });

  it("needs rpm and speed", () => {
    expect(idle.needs).toEqual(["rpm", "speed"]);
  });

  it("emits a span for 30 s of idle and nothing for 29 s", () => {
    expect(events(idle.run(idleLog(29), ctx()))).toEqual([]);
    expect(events(idle.run(idleLog(30), ctx()))).toEqual([
      expect.objectContaining({ kind: "span", t0: 0, t1: 30, title: "Idle" }),
    ]);
  });

  it("requires rpm above 400 and speed below 2 km/h, exclusive", () => {
    const l = (rpm: number, speed: number) =>
      log(secs(30), {
        rpm: { unit: "RPM", values: flat(30, rpm) },
        speed: { unit: "km/h", values: flat(30, speed) },
      });
    expect(events(idle.run(l(400, 0), ctx()))).toEqual([]);
    expect(events(idle.run(l(401, 0), ctx()))).toHaveLength(1);
    expect(events(idle.run(l(700, 2), ctx()))).toEqual([]);
    expect(events(idle.run(l(700, 1.9), ctx()))).toHaveLength(1);
  });

  it("reads speed through the unit table, so mph logs work", () => {
    // 1.2 mph = 1.93 km/h (idle); 1.3 mph = 2.09 km/h (not idle)
    const l = (mph: number) =>
      log(secs(30), {
        rpm: { unit: "RPM", values: flat(30, 700) },
        speed: { unit: "MPH", values: flat(30, mph) },
      });
    expect(events(idle.run(l(1.2), ctx()))).toHaveLength(1);
    expect(events(idle.run(l(1.3), ctx()))).toEqual([]);
  });

  it("splits at a moving sample and reports each long enough stretch", () => {
    const speed = flat(80, 0);
    speed[40] = 10;
    const l = log(secs(80), {
      rpm: { unit: "RPM", values: flat(80, 700) },
      speed: { unit: "km/h", values: speed },
    });
    expect(events(idle.run(l, ctx())).map((e) => [e.t0, e.t1])).toEqual([
      [0, 39],
      [41, 80],
    ]);
  });

  it("treats a missing sample as breaking the stretch", () => {
    const speed = flat(70, 0);
    speed[35] = Number.NaN;
    const l = log(secs(70), {
      rpm: { unit: "RPM", values: flat(70, 700) },
      speed: { unit: "km/h", values: speed },
    });
    expect(events(idle.run(l, ctx())).map((e) => [e.t0, e.t1])).toEqual([
      [0, 34],
      [36, 70],
    ]);
  });

  it("takes its thresholds from params", () => {
    expect(events(idle.run(idleLog(20), ctx({ "core.idle": { minDurationS: 15 } })))).toHaveLength(
      1,
    );
    expect(events(idle.run(idleLog(40), ctx({ "core.idle": { minDurationS: 45 } })))).toEqual([]);
    const l = log(secs(30), {
      rpm: { unit: "RPM", values: flat(30, 500) },
      speed: { unit: "km/h", values: flat(30, 0) },
    });
    expect(events(idle.run(l, ctx({ "core.idle": { minRpm: 600 } })))).toEqual([]);
    const moving = log(secs(30), {
      rpm: { unit: "RPM", values: flat(30, 700) },
      speed: { unit: "km/h", values: flat(30, 4) },
    });
    expect(events(idle.run(moving, ctx({ "core.idle": { maxSpeedKmh: 5 } })))).toHaveLength(1);
  });

  it("ignores a param of the wrong type", () => {
    expect(
      events(idle.run(idleLog(30), ctx({ "core.idle": { minDurationS: "soon" } }))),
    ).toHaveLength(1);
  });

  it("falls back to defaults for a non-object entry", () => {
    expect(events(idle.run(idleLog(30), ctx({ "core.idle": "fast" })))).toHaveLength(1);
    expect(events(idle.run(idleLog(30), ctx({ "core.idle": null })))).toHaveLength(1);
  });

  it("is not applicable when speed has no usable unit", () => {
    const l = log(secs(30), {
      rpm: { unit: "RPM", values: flat(30, 700) },
      speed: { values: flat(30, 0) },
    });
    expect(idle.run(l, ctx())).toMatchObject({ notApplicable: expect.stringContaining("speed") });
  });
});

describe("cruise", () => {
  const speedLog = (values: number[], unit = "km/h", t = secs(values.length - 1)) =>
    log(t, { speed: { unit, values } });

  it("needs speed", () => {
    expect(cruise.needs).toEqual(["speed"]);
  });

  it("emits a span for 60 s steady at or above 40 km/h and nothing for 59 s", () => {
    expect(events(cruise.run(speedLog(flat(59, 100)), ctx()))).toEqual([]);
    expect(events(cruise.run(speedLog(flat(60, 100)), ctx()))).toEqual([
      expect.objectContaining({ kind: "span", t0: 0, t1: 60, title: "Cruise" }),
    ]);
  });

  it("requires speed of at least 40 km/h", () => {
    expect(events(cruise.run(speedLog(flat(60, 40)), ctx()))).toHaveLength(1);
    expect(events(cruise.run(speedLog(flat(60, 39.9)), ctx()))).toEqual([]);
  });

  it("allows drift within 5 % of the span mean, not beyond", () => {
    // mean 100: 4.9 % high and 4.9 % low stay in; 5.1 % out.
    const withSwing = (swing: number) => {
      const v = flat(60, 100);
      v[10] = 100 + swing;
      v[20] = 100 - swing;
      return v;
    };
    expect(events(cruise.run(speedLog(withSwing(4.9)), ctx()))).toHaveLength(1);
    expect(events(cruise.run(speedLog(withSwing(5.1)), ctx()))).toEqual([]);
  });

  it("works on mph logs through the unit table", () => {
    // 25 mph = 40.2 km/h; 24.8 mph = 39.9 km/h
    expect(events(cruise.run(speedLog(flat(60, 25), "MPH"), ctx()))).toHaveLength(1);
    expect(events(cruise.run(speedLog(flat(60, 24.8), "MPH"), ctx()))).toEqual([]);
  });

  it("ends the span where speed leaves the band and finds the next one", () => {
    const v = [...flat(70, 100), ...flat(70, 60)];
    const r = events(cruise.run(speedLog(v), ctx()));
    expect(r.map((e) => [e.t0, e.t1])).toEqual([
      [0, 70],
      [71, 141],
    ]);
  });

  it("does not span a missing sample", () => {
    const v = flat(130, 100);
    v[65] = Number.NaN;
    const r = events(cruise.run(speedLog(v), ctx()));
    expect(r.map((e) => [e.t0, e.t1])).toEqual([
      [0, 64],
      [66, 130],
    ]);
  });

  it("takes its thresholds from params", () => {
    expect(
      events(cruise.run(speedLog(flat(60, 30)), ctx({ "core.cruise": { minSpeedKmh: 30 } }))),
    ).toHaveLength(1);
    expect(
      events(cruise.run(speedLog(flat(40, 100)), ctx({ "core.cruise": { minDurationS: 30 } }))),
    ).toHaveLength(1);
    const v = flat(60, 100);
    v[10] = 108;
    expect(
      events(cruise.run(speedLog(v), ctx({ "core.cruise": { tolerance: 0.1 } }))),
    ).toHaveLength(1);
  });

  it("is not applicable when speed has no usable unit", () => {
    const l = log(secs(60), { speed: { values: flat(60, 100) } });
    expect(cruise.run(l, ctx())).toMatchObject({ notApplicable: expect.stringContaining("speed") });
  });
});

describe("regen", () => {
  const regenLog = (values: number[]) => log(secs(values.length - 1), { dpfRegen: { values } });

  it("declares the DPF regeneration channel as its need, so an absent channel is not applicable", () => {
    expect(regen.needs).toEqual(["dpfRegen"]);
  });

  it("emits a span over each run of status 1", () => {
    const r = events(regen.run(regenLog([0, 0, 1, 1, 1, 0, 1, 1, 0]), ctx()));
    expect(r.map((e) => [e.kind, e.t0, e.t1, e.title])).toEqual([
      ["span", 2, 4, "DPF regeneration"],
      ["span", 6, 7, "DPF regeneration"],
    ]);
  });

  it("emits a span that runs to the end of the log", () => {
    const r = events(regen.run(regenLog([0, 1, 1]), ctx()));
    expect(r.map((e) => [e.t0, e.t1])).toEqual([[1, 2]]);
  });

  it("is silent when the channel is logged but never 1", () => {
    expect(events(regen.run(regenLog([0, 0, 0]), ctx()))).toEqual([]);
  });

  it("ignores other statuses and missing samples", () => {
    expect(events(regen.run(regenLog([0, 2, Number.NaN, 0]), ctx()))).toEqual([]);
  });
});
