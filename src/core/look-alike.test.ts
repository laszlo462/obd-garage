import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type ChannelKey, createCatalogue, type LogColumn } from "./channels.ts";
import { derive, GENERIC_PROFILE, type Profile, type VehicleContext } from "./derive.ts";
import { freezeFrameLines, LOOK_ALIKE_ID, lookAlike } from "./look-alike.ts";
import { type FreezeFrame, type ParsedReport, type PidRow, parseReport } from "./report.ts";
import type { RuleLog } from "./rules.ts";

const row = (description: string, number: number | null, units: string): PidRow => ({
  pid: "",
  description,
  value: number === null ? "On" : String(number),
  number,
  units,
});

const report = (rows: PidRow[], date = "2026-10-02T21:32:14", dtc = "P0401"): ParsedReport => ({
  header: { vin: "1FT7W2BT5CE000001", date },
  freezeFrames: [{ title: `${dtc} - First Occurrence`, dtc, rows }],
});

/** A frame of rpm 1000, speed 50 km/h and load 40 %. */
const FRAME = [
  row("Engine RPM", 1000, "RPM"),
  row("Vehicle speed", 50, "km/h"),
  row("Calculated load value", 40, "%"),
];

const log = (t: number[], cols: Record<ChannelKey, LogColumn>): RuleLog => ({
  t,
  channels: new Map(Object.entries(cols)),
});

/** A log whose three Channels sit at the frame values, except where `out` indexes jump out of band. */
function steady(t: number[], out: number[] = []): RuleLog {
  const col = (unit: string, v: number, far: number): LogColumn => ({
    unit,
    values: t.map((_, i) => (out.includes(i) ? far : v)),
  });
  return log(t, {
    rpm: col("RPM", 1000, 3000),
    speed: col("km/h", 50, 120),
    load: col("%", 40, 90),
  });
}

const run = (l: RuleLog, ref: ParsedReport | undefined, params = {}) =>
  lookAlike.run(l, { params, ...(ref ? { reference: ref } : {}) });

const spans = (r: ReturnType<typeof run>) => (Array.isArray(r) ? r.map((e) => [e.t0, e.t1]) : r);

describe("freeze-frame Look-alike", () => {
  it("needs a Reference Report and declares no fixed Channels", () => {
    expect(lookAlike.needsReferenceReport).toBe(true);
    expect(lookAlike.needs).toEqual([]);
  });

  it("makes a span when every shared Channel stays in band for 2 s", () => {
    // In band at 1 and 2; the next row (3, out of band) ends the span: 1 to 3 = exactly 2 s.
    const l = steady([0, 1, 2, 3], [0, 3]);
    const r = run(l, report(FRAME));
    expect(r).toEqual([
      {
        kind: "span",
        t0: 1,
        t1: 3,
        title: "Looks like the freeze frame (P0401, 2026-10-02 report)",
        text: "All 3 Channels shared with the freeze frame (Engine RPM, Vehicle speed, Engine load) stayed within their tolerance bands for 2 s.",
      },
    ]);
  });

  it("makes no span for 1.9 s in band", () => {
    // In band at 1 and 1.5; the next row is at 2.9: 1 to 2.9 = 1.9 s.
    const l = steady([0, 1, 1.5, 2.9], [0, 3]);
    expect(run(l, report(FRAME))).toEqual([]);
  });

  it("allows 50 ms of timestamp jitter: 1.95 s counts, 1.9 s does not", () => {
    expect(spans(run(steady([0, 1, 2.95], [0, 2]), report(FRAME)))).toEqual([[1, 2.95]]);
    expect(run(steady([0, 1, 2.9], [0, 2]), report(FRAME))).toEqual([]);
  });

  it("holds a row's values until the next row, so a single in-band row can make a span", () => {
    // One in-band row at 0 held for 10 s until the next row.
    expect(spans(run(steady([0, 10], [1]), report(FRAME)))).toEqual([[0, 10]]);
    // A run reaching the end of the log has no next row, so it ends at the last row.
    expect(spans(run(steady([0, 1, 2], [0]), report(FRAME)))).toEqual([]);
    expect(spans(run(steady([0, 1, 3]), report(FRAME)))).toEqual([[0, 3]]);
  });

  it("takes the band edge as in band (±10 % of 1000 rpm, minimum 100)", () => {
    const edge = log([0, 1, 2], {
      rpm: { unit: "RPM", values: [1100, 900, 1100] },
      speed: { unit: "km/h", values: [50, 50, 50] },
      load: { unit: "%", values: [40, 40, 40] },
    });
    expect(spans(run(edge, report(FRAME)))).toEqual([[0, 2]]);
    const past = log([0, 1, 2], {
      rpm: { unit: "RPM", values: [1100, 899, 1100] },
      speed: { unit: "km/h", values: [50, 50, 50] },
      load: { unit: "%", values: [40, 40, 40] },
    });
    expect(run(past, report(FRAME))).toEqual([]);
  });

  it("applies the per-unit absolute minimum when 10 % is narrower", () => {
    // Load 4 % in the frame: 10 % is 0.4, but the minimum for "%" is 5.
    const ref = report([
      row("Engine RPM", 1000, "RPM"),
      row("Vehicle speed", 50, "km/h"),
      row("Calculated load value", 4, "%"),
    ]);
    const l = log([0, 1, 2], {
      rpm: { unit: "RPM", values: [1000, 1000, 1000] },
      speed: { unit: "km/h", values: [50, 50, 50] },
      load: { unit: "%", values: [9, 9, 9] },
    });
    expect(spans(run(l, ref))).toEqual([[0, 2]]);
  });

  it("merges two spans 1.5 s apart into one", () => {
    // Spans 0..2 and 3.5..5.5; the out-of-band row at 2 ends the first, and the second starts 1.5 s later.
    const l = steady([0, 1, 2, 3.5, 4.5, 5.5], [2]);
    expect(spans(run(l, report(FRAME)))).toEqual([[0, 5.5]]);
  });

  it("keeps two spans exactly 2 s apart separate", () => {
    const l = steady([0, 1, 2, 4, 5, 6], [2]);
    expect(spans(run(l, report(FRAME)))).toEqual([
      [0, 2],
      [4, 6],
    ]);
  });

  it("is not applicable with only two shared Channels, naming them", () => {
    const l = log([0, 1, 2, 3], {
      rpm: { unit: "RPM", values: [1000, 1000, 1000, 1000] },
      speed: { unit: "km/h", values: [50, 50, 50, 50] },
    });
    expect(run(l, report(FRAME))).toEqual({
      notApplicable: "only 2 Channels shared with the freeze frame (rpm, speed); need 3",
    });
  });

  it("converts between the report's units and the log's", () => {
    const ref = report([
      row("Engine RPM", 1000, "RPM"),
      row("Vehicle speed", 50, "MPH"),
      row("Engine coolant temperature 1", 190, "°F"),
    ]);
    const l = log([0, 1, 2], {
      rpm: { unit: "RPM", values: [1000, 1000, 1000] },
      speed: { unit: "km/h", values: [80.5, 80.5, 80.5] }, // 50.02 mph
      ect: { unit: "°C", values: [88, 88, 88] }, // 190.4 °F
    });
    expect(spans(run(l, ref))).toEqual([[0, 2]]);
    const cold = log([0, 1, 2], {
      rpm: { unit: "RPM", values: [1000, 1000, 1000] },
      speed: { unit: "km/h", values: [80.5, 80.5, 80.5] },
      ect: { unit: "°C", values: [60, 60, 60] },
    });
    expect(run(cold, ref)).toEqual([]);
  });

  it("leaves out a Channel whose unit cannot convert, and still needs 3", () => {
    const ref = report([...FRAME, row("Intake manifold absolute pressure A", 30, "inHg")]);
    const l = log([0, 1, 2], {
      rpm: { unit: "RPM", values: [1000, 1000, 1000] },
      speed: { unit: "km/h", values: [50, 50, 50] },
      load: { unit: "%", values: [40, 40, 40] },
      map: { unit: "gizmos", values: [1, 1, 1] },
    });
    expect(spans(run(l, ref))).toEqual([[0, 2]]);
  });

  it("ignores non-numeric rows, unknown PIDs and the run-time counter", () => {
    const ref = report([
      ...FRAME,
      row("Freeze frame DTC", null, ""),
      row("Time since engine start", 1537, "sec"),
      row("Mystery sensor", 1, "%"),
    ]);
    const l = log([0, 1, 2], {
      rpm: { unit: "RPM", values: [1000, 1000, 1000] },
      speed: { unit: "km/h", values: [50, 50, 50] },
      load: { unit: "%", values: [40, 40, 40] },
      runTime: { unit: "sec", values: [5, 6, 7] },
    });
    expect(spans(run(l, ref))).toEqual([[0, 2]]);
  });

  it("maps freeze-frame names through the Profile's catalogue aliases", () => {
    const ref = report([
      row("Crank Speed", 1000, "RPM"),
      row("Vehicle speed", 50, "km/h"),
      row("Calculated load value", 40, "%"),
    ]);
    const l = steady([0, 1, 2]);
    expect(run(l, ref)).toEqual({ notApplicable: expect.stringContaining("only 2") });
    const catalogue = createCatalogue({ aliases: { rpm: ["Crank Speed"] } });
    const r = lookAlike.run(l, { params: {}, catalogue, reference: ref });
    expect(spans(r)).toEqual([[0, 2]]);
  });

  it("is not applicable when the report has no freeze frame", () => {
    const ref: ParsedReport = { header: { vin: "1FT7W2BT5CE000001", date: "2026-10-02T21:32:14" } };
    expect(run(steady([0, 1, 2]), ref)).toEqual({
      notApplicable: "the Reference Report has no freeze frame",
    });
  });

  it("takes the DTC and date for the title from the Reference Report", () => {
    const r = run(steady([0, 1, 2]), report(FRAME, "2026-08-21T21:56:40", "P2002"));
    expect(Array.isArray(r) && r[0]?.title).toBe(
      "Looks like the freeze frame (P2002, 2026-08-21 report)",
    );
  });

  describe("Profile tolerance override", () => {
    // rpm is 1150 against a frame of 1000: outside ±10 % (min 100), inside ±20 %.
    const wide = log([0, 1, 2], {
      rpm: { unit: "RPM", values: [1150, 1150, 1150] },
      speed: { unit: "km/h", values: [50, 50, 50] },
      load: { unit: "%", values: [40, 40, 40] },
    });
    const key = LOOK_ALIKE_ID;

    it("changes the result for the Channel it names", () => {
      expect(run(wide, report(FRAME))).toEqual([]);
      expect(spans(run(wide, report(FRAME), { [key]: { rpm: { relative: 0.2 } } }))).toEqual([
        [0, 2],
      ]);
    });

    it("can narrow a band, and set the absolute minimum", () => {
      expect(
        run(steady([0, 1, 2]), report(FRAME), { [key]: { rpm: { relative: 0, min: 0 } } }),
      ).not.toEqual([]);
      const off = log([0, 1, 2], {
        rpm: { unit: "RPM", values: [1050, 1050, 1050] },
        speed: { unit: "km/h", values: [50, 50, 50] },
        load: { unit: "%", values: [40, 40, 40] },
      });
      expect(run(off, report(FRAME), { [key]: { rpm: { relative: 0.01, min: 10 } } })).toEqual([]);
    });

    it("leaves other Channels on the default band", () => {
      expect(run(wide, report(FRAME), { [key]: { speed: { relative: 0.5 } } })).toEqual([]);
    });

    it("flows from a stub Profile's params through derive", () => {
      const csv = `﻿${[
        "# StartTime = 10/02/2026 05:58:45.9486 PM",
        "Time (sec), Engine RPM (RPM), Vehicle speed (km/h), Calculated load value (%)",
        "0, 1150, 50, 40",
        "1, 1151, 50, 40",
        "2, 1152, 50, 40",
      ].join("\r\n")}\r\n`;
      const ctx = (profile: Profile): VehicleContext => ({
        profile,
        packs: [],
        params: {},
        referenceReport: report(FRAME),
      });
      const find = (profile: Profile) => {
        const r = derive(csv, ctx(profile));
        if (r.kind !== "derived") throw new Error("not derived");
        return r;
      };
      expect(find(GENERIC_PROFILE).events.filter((e) => e.category === "look-alike")).toEqual([]);
      const tuned = find({ params: { [key]: { rpm: { relative: 0.2 } } } });
      expect(tuned.events.filter((e) => e.category === "look-alike")).toMatchObject([
        { ruleId: LOOK_ALIKE_ID, packId: null, kind: "span", t0: 0, t1: 2 },
      ]);
    });
  });
});

describe("derive with and without a Reference Report", () => {
  const csv = `﻿${[
    "# StartTime = 10/02/2026 05:58:45.9486 PM",
    "Time (sec), Engine RPM (RPM), Vehicle speed (km/h), Calculated load value (%)",
    "0, 1000, 50, 40",
    "2, 1001, 50, 40",
  ].join("\r\n")}\r\n`;

  it("skips the rule without a Reference Report (an Unassigned log)", () => {
    const r = derive(csv, { profile: GENERIC_PROFILE, packs: [], params: {} });
    if (r.kind !== "derived") throw new Error("not derived");
    expect(r.outcomes.find((o) => o.ruleId === LOOK_ALIKE_ID)).toEqual({
      ruleId: LOOK_ALIKE_ID,
      packId: null,
      status: "skipped",
      reason: "no-reference-report",
    });
    expect(r.events.some((e) => e.category === "look-alike")).toBe(false);
  });

  it("marks the rule's Events with the look-alike category", () => {
    const r = derive(csv, {
      profile: GENERIC_PROFILE,
      packs: [],
      params: {},
      referenceReport: report(FRAME),
    });
    if (r.kind !== "derived") throw new Error("not derived");
    expect(r.events.filter((e) => e.category === "look-alike")).toHaveLength(1);
    expect(r.outcomes.find((o) => o.ruleId === LOOK_ALIKE_ID)).toMatchObject({
      status: "ran",
      events: 1,
    });
  });
});

describe("Look-alikes on the fixture Drive Logs", () => {
  const logs = new URL("../../test/fixtures/drive-logs/", import.meta.url);
  const reports = new URL("../../test/fixtures/reports/", import.meta.url);
  const parsed = readdirSync(reports)
    .filter((f) => f.endsWith(".html"))
    .map((f) => {
      const r = parseReport(readFileSync(new URL(f, reports)));
      if (r.kind !== "report") throw new Error(`${f} is not a report`);
      return { f, report: r.report, at: Date.parse(r.report.header.date) };
    });
  // File names carry the log's start: CSVLog_YYYYMMDD_HHMMSS.csv.
  const startOf = (name: string) => {
    const m = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(name);
    if (!m) throw new Error(name);
    return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
  };

  for (const name of readdirSync(logs).filter((f) => f.endsWith(".csv"))) {
    it(`snapshots the Look-alikes in ${name}, paired with its closest report`, () => {
      const at = startOf(name);
      const closest = parsed.reduce((a, b) => (Math.abs(b.at - at) < Math.abs(a.at - at) ? b : a));
      const r = derive(readFileSync(new URL(name, logs)), {
        profile: GENERIC_PROFILE,
        packs: [],
        params: {},
        referenceReport: closest.report,
      });
      if (r.kind !== "derived") throw new Error(`${name} did not derive`);
      expect({
        report: closest.f,
        outcome: r.outcomes.find((o) => o.ruleId === LOOK_ALIKE_ID),
        events: r.events.filter((e) => e.category === "look-alike"),
      }).toMatchSnapshot();
    });
  }
});

describe("freezeFrameLines", () => {
  const frameOf = (rows: PidRow[]) => report(rows).freezeFrames?.[0] as FreezeFrame;
  const view = (cols: Record<string, LogColumn>) => new Map(Object.entries(cols));

  it("gives each matched Channel's value", () => {
    const channels = view({
      rpm: { unit: "RPM", values: [900] },
      speed: { unit: "km/h", values: [40] },
      load: { unit: "%", values: [30] },
    });
    expect(freezeFrameLines(frameOf(FRAME), channels)).toEqual([
      { key: "rpm", value: 1000 },
      { key: "speed", value: 50 },
      { key: "load", value: 40 },
    ]);
  });

  it("leaves out a Channel the log lacks", () => {
    const channels = view({ speed: { unit: "km/h", values: [40] } });
    expect(freezeFrameLines(frameOf(FRAME), channels)).toEqual([{ key: "speed", value: 50 }]);
  });

  it("converts the value into the log Channel's unit", () => {
    const channels = view({ speed: { unit: "mph", values: [40] } });
    const [line] = freezeFrameLines(frameOf([row("Vehicle speed", 80.4672, "km/h")]), channels);
    expect(line?.key).toBe("speed");
    expect(line?.value).toBeCloseTo(50, 6);
  });

  it("leaves out a row whose unit will not convert", () => {
    const channels = view({ speed: { unit: "kPa", values: [40] } });
    expect(freezeFrameLines(frameOf([row("Vehicle speed", 50, "km/h")]), channels)).toEqual([]);
  });

  it("leaves out a Channel that has no unit in the log", () => {
    const channels = view({ speed: { values: [40] } });
    expect(freezeFrameLines(frameOf([row("Vehicle speed", 50, "km/h")]), channels)).toEqual([]);
  });

  it("leaves out rows with no number or no unit, and the time Channels", () => {
    const channels = view({
      rpm: { unit: "RPM", values: [900] },
      speed: { unit: "km/h", values: [40] },
      load: { unit: "%", values: [30] },
      runTime: { unit: "s", values: [5] },
    });
    const frame = frameOf([
      row("Engine RPM", null, "RPM"),
      row("Vehicle speed", 50, ""),
      row("Calculated load value", 40, "%"),
      row("Run time since engine start", 600, "s"),
    ]);
    expect(freezeFrameLines(frame, channels)).toEqual([{ key: "load", value: 40 }]);
  });
});
