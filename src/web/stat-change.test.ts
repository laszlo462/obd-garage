import { describe, expect, it } from "vitest";
import { statChange } from "./stat-change.ts";

const report = (over: Partial<Parameters<typeof statChange>[0]> = {}) => ({
  mil: "off" as const,
  storedCodes: [] as string[],
  pendingCodes: [] as string[],
  incompleteMonitors: 0,
  totalMonitors: 11,
  ...over,
});

describe("statChange", () => {
  it("shows MIL as a word in its status colour, and what it was", () => {
    const [mil] = statChange(report({ mil: "off" }), report({ mil: "on" }));
    expect(mil).toMatchObject({ label: "MIL", value: "OFF", tone: "ok", change: "was ON" });
    const [on] = statChange(report({ mil: "on" }), report({ mil: "on" }));
    expect(on).toMatchObject({ value: "ON", tone: "bad", change: "no change" });
  });

  it("counts stored and pending codes against the previous Report", () => {
    const [, stored, pending] = statChange(
      report({ storedCodes: ["P0401", "P0402"], pendingCodes: ["P0401"] }),
      report({ storedCodes: ["P0401"], pendingCodes: ["P0401"] }),
    );
    expect(stored).toMatchObject({
      label: "Stored",
      value: "2",
      tone: "bad",
      change: "+1",
      changeTone: "warn",
    });
    expect(pending).toMatchObject({
      label: "Pending",
      value: "1",
      tone: "warn",
      change: "no change",
      changeTone: "muted",
    });
  });

  it("shows no codes as a green zero, and a drop as a minus", () => {
    const [, stored] = statChange(report(), report({ storedCodes: ["P0401"] }));
    expect(stored).toMatchObject({ value: "0", tone: "ok", change: "-1", changeTone: "muted" });
  });

  it("shows monitors as ready over total with the ready change", () => {
    const [, , , monitors] = statChange(
      report({ incompleteMonitors: 2 }),
      report({ incompleteMonitors: 3 }),
    );
    expect(monitors).toMatchObject({
      label: "Monitors",
      value: "9/11",
      tone: "warn",
      change: "+1 ready",
    });
    const [, , , done] = statChange(report(), report());
    expect(done).toMatchObject({ value: "11/11", tone: "ok", change: "no change" });
  });

  it("says first report when there is nothing to compare with", () => {
    expect(statChange(report(), null).map((t) => t.change)).toEqual(Array(4).fill("first report"));
  });
});
