import { describe, expect, it } from "vitest";
import { referenceChipText } from "./reference-chip.ts";

const ref = (over: Partial<Parameters<typeof referenceChipText>[0]> = {}) => ({
  id: 5,
  defaultId: 5,
  state: "default" as const,
  recordedAt: "2026-10-02T21:32:14" as string | null,
  freezeFrame: [],
  ...over,
});

describe("referenceChipText", () => {
  it("asks an Unassigned log to be assigned", () => {
    expect(referenceChipText(ref({ id: null }), { unassigned: true })).toBe("Assign to a Vehicle…");
  });

  it("names the Report in use by its date", () => {
    expect(referenceChipText(ref(), { unassigned: false })).toBe("Reference: 2 Oct report");
  });

  it("says None once cleared, and when the Vehicle has no Report to default to", () => {
    const none = { id: null, recordedAt: null };
    expect(referenceChipText(ref({ ...none, state: "cleared" }), { unassigned: false })).toBe(
      "Reference: None",
    );
    expect(referenceChipText(ref({ ...none, defaultId: null }), { unassigned: false })).toBe(
      "Reference: None",
    );
  });
});
