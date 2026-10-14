import { describe, expect, it } from "vitest";
import { outcomeLines } from "./outcome-lines.ts";

const na = { status: "not-applicable", packId: null, missing: [] as string[] } as const;

describe("outcomeLines", () => {
  it("says a not-applicable rule is not applicable, with its reason", () => {
    const lines = outcomeLines(
      [{ ...na, ruleId: "core.regen", name: "Regen", reason: "no DPF regen status in this log" }],
      { unassigned: false },
    );
    expect(lines).toEqual(["Regen: not applicable, no DPF regen status in this log"]);
  });

  it("says a skipped rule was skipped for lack of a Reference Report, and leaves ran rules out, in rule order", () => {
    const lines = outcomeLines(
      [
        { ...na, ruleId: "core.regen", name: "Regen", reason: "no regen" },
        { status: "ran", events: 2, packId: null, ruleId: "core.idle", name: "Idle" },
        {
          status: "skipped",
          reason: "no-reference-report",
          packId: null,
          ruleId: "core.look-alike",
          name: "Look-alikes",
        },
      ],
      { unassigned: false },
    );
    expect(lines).toEqual([
      "Regen: not applicable, no regen",
      "Look-alikes: skipped, no Reference Report",
    ]);
  });

  it("prefixes a pack outcome with the pack name", () => {
    const lines = outcomeLines(
      [
        {
          ...na,
          ruleId: "p0401.entry-window",
          packId: "p0401",
          name: "P0401 entry window",
          packName: "6.7 P0401",
          reason: "no Actual EGR A in this log",
        },
      ],
      { unassigned: false },
    );
    expect(lines).toEqual([
      "6.7 P0401: P0401 entry window: not applicable, no Actual EGR A in this log",
    ]);
  });

  it("ends an Unassigned log with the line that no Rule Packs ran", () => {
    const lines = outcomeLines(
      [{ ...na, ruleId: "core.regen", name: "Regen", reason: "no regen" }],
      { unassigned: true },
    );
    expect(lines).toEqual([
      "Regen: not applicable, no regen",
      "Rule Packs: not run, Unassigned logs get no Rule Packs",
    ]);
    expect(outcomeLines([], { unassigned: true })).toEqual([
      "Rule Packs: not run, Unassigned logs get no Rule Packs",
    ]);
  });

  it("names missing Channels by the outcome's labels", () => {
    const lines = outcomeLines(
      [
        {
          ...na,
          ruleId: "core.regen",
          name: "Regen",
          missing: ["dpfRegen", "rpm", "egrActual"],
          missingLabels: ["DPF regen status", "Engine speed", "EGR position, actual"],
        },
      ],
      { unassigned: false },
    );
    expect(lines).toEqual([
      "Regen: not applicable, no DPF regen status, Engine speed, EGR position, actual in this log",
    ]);
  });

  it("names the missing Channels when the outcome has no reason", () => {
    const lines = outcomeLines(
      [{ ...na, ruleId: "core.peaks", name: "Peaks", missing: ["rpm", "ect"] }],
      { unassigned: false },
    );
    expect(lines).toEqual(["Peaks: not applicable, no rpm, ect in this log"]);
  });
});
