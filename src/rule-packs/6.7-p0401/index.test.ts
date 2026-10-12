import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ChannelKey, LogColumn } from "../../core/channels.ts";
import { derive } from "../../core/derive.ts";
import type { Event, RuleLog } from "../../core/rules.ts";
import { SIX_SEVEN } from "../../profiles/six-seven.ts";
import { entryWindow, P0401_PACK } from "./index.ts";

const ctx = { params: {} };
const logs = new URL("../../../test/fixtures/drive-logs/", import.meta.url);
const annotations = new URL("../../../test/fixtures/annotations/", import.meta.url);
/** How far an annotated entry-window event may sit from the nearest span. */
const LOOSE_S = 20;
const START = "# StartTime = 10/02/2026 05:58:45.9486 PM";
const csv = (header: string, rows: string[]) => `﻿${[START, header, ...rows].join("\r\n")}\r\n`;

const log = (cols: Record<ChannelKey, LogColumn>, n: number): RuleLog => ({
  t: Array.from({ length: n }, (_, i) => i),
  channels: new Map(Object.entries(cols)),
});

/** Runs the rule over samples one second apart, plus a closing sample that is outside the window. */
function run(rpm: number[], ect: number[], egr: number[], ectUnit = "°C") {
  const l = log(
    {
      rpm: { unit: "RPM", values: [...rpm, 0] },
      ect: { unit: ectUnit, values: [...ect, 20] },
      egrActual: { unit: "%", values: [...egr, 0] },
    },
    rpm.length + 1,
  );
  const r = entryWindow.run(l, ctx);
  if (!Array.isArray(r)) throw new Error("expected events");
  return r;
}

describe("6.7 P0401 pack", () => {
  it("is the p0401 pack with the entry window rule, needing the 6.7 Channels", () => {
    expect(P0401_PACK.id).toBe("p0401");
    expect(P0401_PACK.rules).toEqual([entryWindow]);
    expect(entryWindow.id).toBe("p0401.entry-window");
    expect(entryWindow.needs).toEqual(["rpm", "ect", "egrActual"]);
  });
});

describe("entry window boundaries", () => {
  it("includes 600 and 2500 rpm, excludes 599 and 2501", () => {
    expect(run([600], [80], [50])).toHaveLength(1);
    expect(run([2500], [80], [50])).toHaveLength(1);
    expect(run([599], [80], [50])).toHaveLength(0);
    expect(run([2501], [80], [50])).toHaveLength(0);
  });

  it("includes 70 and 100 °C, excludes 69.9 and 100.1", () => {
    expect(run([1000], [70], [50])).toHaveLength(1);
    expect(run([1000], [100], [50])).toHaveLength(1);
    expect(run([1000], [69.9], [50])).toHaveLength(0);
    expect(run([1000], [100.1], [50])).toHaveLength(0);
  });

  it("converts ECT from °F: 158 °F is in, 157.8 °F is out", () => {
    expect(run([1000], [158], [50], "°F")).toHaveLength(1);
    expect(run([1000], [157.8], [50], "°F")).toHaveLength(0);
  });

  it("includes 40 and 60 % valve, excludes 39.9 and 60.1", () => {
    expect(run([1000], [80], [40])).toHaveLength(1);
    expect(run([1000], [80], [60])).toHaveLength(1);
    expect(run([1000], [80], [39.9])).toHaveLength(0);
    expect(run([1000], [80], [60.1])).toHaveLength(0);
  });

  it("treats a missing sample as outside the window", () => {
    expect(run([Number.NaN], [80], [50])).toHaveLength(0);
  });
});

describe("entry window spans", () => {
  it("emits one span per run, ending at the first sample outside it", () => {
    const events = run([1000, 1000, 100, 1000], [80, 80, 80, 80], [50, 50, 50, 50]);
    expect(events.map((e) => [e.kind, e.t0, e.t1])).toEqual([
      ["span", 0, 2],
      ["span", 3, 4],
    ]);
  });

  it("ends a run that reaches the last row at that row", () => {
    const l = log(
      {
        rpm: { unit: "RPM", values: [100, 1000, 1000] },
        ect: { unit: "°C", values: [80, 80, 80] },
        egrActual: { unit: "%", values: [50, 50, 50] },
      },
      3,
    );
    expect(entryWindow.run(l, ctx)).toMatchObject([{ kind: "span", t0: 1, t1: 2 }]);
  });

  it("explains the window, cites DOBDSM1202 and states the valve-scale caveat", () => {
    const [e] = run([1000], [80], [50]);
    expect(e?.title).toBe("P0401 entry window");
    expect(e?.text).toContain("600");
    expect(e?.text).toContain("DOBDSM1202");
    expect(e?.text).toMatch(/scale/);
  });

  it("is silent when the log never enters the window", () => {
    expect(run([300], [80], [50])).toEqual([]);
  });
});

describe("valve scale", () => {
  it("tests the values as the Profile left them: 59.61 % is in, an unrescaled 99.35 % is out", () => {
    expect(run([1000], [80], [59.61])).toHaveLength(1);
    expect(run([1000], [80], [99.35])).toHaveLength(0);
  });

  it("runs on raw values for a mixed decode, which the Profile leaves unrescaled", () => {
    const header =
      "Time (sec), Engine RPM (RPM), Engine coolant temperature (°C), Actual EGR A duty cycle/position (%)";
    // 99.35 puts the log past the old-decode threshold; the SAE-grid 50.98 % (130 steps) marks it mixed.
    const rows = [
      "0.1, 1000, 80, 99.35",
      "0.2, 1100, 80, 50.98",
      "0.3, 1200, 80, 50.98",
      "0.4, 1300, 80, 50.98",
      "0.5, 0, 20, 0",
    ];
    const r = derive(csv(header, rows), { profile: SIX_SEVEN, packs: [P0401_PACK], params: {} });
    if (r.kind !== "derived") throw new Error(r.kind);
    expect(r.notices).toEqual(["mixed EGR decode, not rescaled"]);
    const spans = r.events.filter((e) => e.packId === "p0401");
    expect(spans.map((e) => [e.t0, e.t1])).toEqual([[0.2, 0.5]]);
  });
});

describe("not applicable", () => {
  it("names the missing Channels when a log has no EGR", () => {
    const r = derive(csv("Time (sec), Engine RPM (RPM)", ["0.1, 800", "0.2, 900"]), {
      profile: SIX_SEVEN,
      packs: [P0401_PACK],
      params: {},
    });
    if (r.kind !== "derived") throw new Error(r.kind);
    expect(r.outcomes.find((o) => o.ruleId === "p0401.entry-window")).toEqual({
      ruleId: "p0401.entry-window",
      packId: "p0401",
      status: "not-applicable",
      missing: ["ect", "egrActual"],
    });
  });

  it("says which Channel is missing in words when run directly", () => {
    const l = log({ rpm: { unit: "RPM", values: [900] }, ect: { unit: "°C", values: [80] } }, 1);
    expect(entryWindow.run(l, ctx)).toEqual({ notApplicable: "no Actual EGR A in this log" });
  });

  it("is not applicable when the valve has no unit", () => {
    const l = log(
      {
        rpm: { unit: "RPM", values: [900] },
        ect: { unit: "°C", values: [80] },
        egrActual: { values: [50] },
      },
      1,
    );
    expect(entryWindow.run(l, ctx)).toHaveProperty("notApplicable");
  });
});

describe("annotated Drive Logs", () => {
  const names = readdirSync(annotations)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  function packEvents(name: string): Event[] {
    const r = derive(new Uint8Array(readFileSync(new URL(`${name}.csv`, logs))), {
      profile: SIX_SEVEN,
      packs: [P0401_PACK],
      params: {},
    });
    if (r.kind !== "derived") throw new Error(r.kind);
    return r.events.filter((e) => e.packId === "p0401");
  }

  it("covers the six annotated logs", () => {
    expect(names).toHaveLength(6);
  });

  for (const name of names) {
    it(`${name}: every annotated entry-window event overlaps a P0401 span`, () => {
      const ann = JSON.parse(readFileSync(new URL(`${name}.json`, annotations), "utf8")) as {
        events: { t0: number; t1: number; title: string }[];
      };
      const refs = ann.events.filter((e) => /entry window/i.test(e.title));
      const spans = packEvents(name);
      for (const ref of refs) {
        // A loose reference: the annotation marks where ECT reaches 158 F, the first gate to open. Its
        // time is rounded, and the valve may not reach 40 % until a few seconds later (one log: 16 s).
        const gap = Math.min(...spans.map((s) => Math.max(s.t0 - ref.t1, ref.t0 - s.t1, 0)));
        expect(gap, `${ref.title} at ${ref.t0}`).toBeLessThanOrEqual(LOOSE_S);
      }
    });

    it(`${name}: spans match the snapshot`, () => {
      expect(
        packEvents(name).map((e) => [e.kind, e.category, e.t0, e.t1, e.title]),
      ).toMatchSnapshot();
    });
  }
});
