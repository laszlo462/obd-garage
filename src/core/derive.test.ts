import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCatalogue } from "./channels.ts";
import { derive, GENERIC_PROFILE, type Profile, type VehicleContext } from "./derive.ts";
import type { Rule } from "./rules.ts";

const dir = new URL("../../test/fixtures/drive-logs/", import.meta.url);
const BOM = "﻿";
const START = "# StartTime = 10/02/2026 05:58:45.9486 PM";
const csv = (header: string, rows: string[]) =>
  `${BOM}${[START, header, ...rows].join("\r\n")}\r\n`;

const generic: VehicleContext = { profile: GENERIC_PROFILE, packs: [], params: {} };
const SMALL = csv("Time (sec), Engine RPM (RPM), Vehicle speed (MPH)", [
  "0.1, 0, 0",
  "0.2, 0, 5",
  "0.3, 850, 10",
]);

function derived(input: string | Uint8Array, ctx = generic) {
  const r = derive(input, ctx);
  if (r.kind !== "derived") throw new Error(`expected derived, got ${JSON.stringify(r)}`);
  return r;
}

describe("derive", () => {
  it("returns metadata, channels, events, outcomes and notices for a Drive Log", () => {
    const r = derived(SMALL);
    expect(r.metadata.startTime).toBe("2026-10-02T17:58:45.948");
    expect(Object.keys(r.channels)).toEqual(["rpm", "speed"]);
    expect(r.events.map((e) => [e.ruleId, e.packId, e.category, e.title])).toEqual([
      ["core.engine-start", null, "generic", "Engine start"],
      ["core.peaks", null, "generic", "Peak engine speed"],
      ["core.peaks", null, "generic", "Peak vehicle speed"],
    ]);
    expect(r.notices).toEqual([]);
  });

  it("records one outcome per rule, naming missing Channels when not applicable", () => {
    const r = derived(csv("Time (sec), Vehicle speed (MPH)", ["0.1, 5", "0.2, 9"]));
    expect(r.outcomes.slice(0, 2)).toEqual([
      { ruleId: "core.engine-start", packId: null, status: "not-applicable", missing: ["rpm"] },
      { ruleId: "core.peaks", packId: null, status: "ran", events: 1 },
    ]);
    expect(r.outcomes.find((o) => o.ruleId === "core.regen")).toEqual({
      ruleId: "core.regen",
      packId: null,
      status: "not-applicable",
      missing: ["dpfRegen"],
    });
  });

  it("marks Peaks not applicable naming all three channels when none exist", () => {
    const r = derived(csv("Time (sec), Barometric pressure (kPa)", ["0.1, 99", "0.2, 98"]));
    expect(r.outcomes[1]).toEqual({
      ruleId: "core.peaks",
      packId: null,
      status: "not-applicable",
      missing: ["rpm", "speed", "ect"],
    });
  });

  it("turns a rule's notApplicable result into an outcome with its reason", () => {
    const noUnitRpm = derived(csv("Time (sec), Engine RPM", ["0.1, 800", "0.2, 900"]));
    expect(noUnitRpm.outcomes.find((o) => o.ruleId === "core.peaks")).toMatchObject({
      status: "not-applicable",
      missing: [],
      reason: expect.stringContaining("rpm"),
    });
  });

  it("runs enabled Rule Pack rules with the pack id and category", () => {
    const rule: Rule = {
      id: "demo.always",
      needs: ["rpm"],
      run: () => [{ kind: "span", t0: 0.1, t1: 0.3, title: "Demo", text: "demo" }],
    };
    const lookalike: Rule = {
      id: "demo.look",
      needs: [],
      needsReferenceReport: true,
      run: () => [],
    };
    const r = derived(SMALL, {
      ...generic,
      packs: [{ id: "demo", name: "Demo", rules: [rule, lookalike] }],
    });
    expect(r.events.find((e) => e.ruleId === "demo.always")).toMatchObject({
      packId: "demo",
      category: "pack",
      kind: "span",
    });
    expect(r.outcomes.at(-1)).toEqual({
      ruleId: "demo.look",
      packId: "demo",
      status: "skipped",
      reason: "no-reference-report",
    });
  });

  it("runs a rule needing a Reference Report when one is supplied", () => {
    const look: Rule = {
      id: "demo.look",
      needs: [],
      needsReferenceReport: true,
      run: (_l, c) =>
        c.reference ? [{ kind: "point", t0: 0.1, t1: 0.1, title: "x", text: "y" }] : [],
    };
    const r = derived(SMALL, {
      ...generic,
      packs: [{ id: "d", name: "D", rules: [look] }],
      referenceReport: { header: { vin: "1FT7W2BT5CE000001", date: "2026-10-02T21:32:14" } },
    });
    expect(r.outcomes.at(-1)).toMatchObject({ status: "ran", events: 1 });
  });

  it("applies Profile catalogue aliases and decode fixes, collecting their notices", () => {
    const profile: Profile = {
      catalogue: createCatalogue({ aliases: { rpm: ["Crank Speed"] } }),
      decodeFixes: [(log) => ({ channels: log.channels, notices: ["rescaled"] })],
    };
    const r = derived(
      csv("Time (sec), Crank Speed (RPM), Vehicle speed (MPH)", ["0.1, 0, 3", "0.2, 800, 3"]),
      {
        ...generic,
        profile,
      },
    );
    expect(Object.keys(r.channels)).toEqual(["rpm", "speed"]);
    expect(r.notices).toEqual(["rescaled"]);
    expect(r.events[0]?.ruleId).toBe("core.engine-start");
  });

  it("hands a rule the Profile's parameter overrides, with the context's own params winning", () => {
    let seen: unknown;
    const spy: Rule = {
      id: "test.spy",
      needs: [],
      run: (_log, ctx) => {
        seen = ctx.params;
        return [];
      },
    };
    const run = (ctxParams: Record<string, unknown>) =>
      derived(SMALL, {
        profile: { params: { a: 1, b: 2 } },
        packs: [{ id: "spy", name: "Spy", rules: [spy] }],
        params: ctxParams,
      });
    run({ b: 3 });
    expect(seen).toEqual({ a: 1, b: 3 });
  });

  it("is pure: the same input twice gives deep-equal output", () => {
    expect(derive(SMALL, generic)).toEqual(derive(SMALL, generic));
  });

  it("passes through other files and unreadable Drive Logs", () => {
    expect(derive("hello", generic)).toEqual({ kind: "not-drive-log" });
    expect(derive(`${BOM}# StartTime = nope\r\n`, generic).kind).toBe("failed");
  });
});

describe("derive on the fixture Drive Logs", () => {
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".csv"))) {
    it(`snapshots Events and outcomes for ${name}`, () => {
      const r = derived(readFileSync(new URL(name, dir)));
      expect({ events: r.events, outcomes: r.outcomes, notices: r.notices }).toMatchSnapshot();
    });
  }
});
