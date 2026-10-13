import { describe, expect, it } from "vitest";
import { createAppState } from "./app-state.ts";
import { stubApi, vehicleRow } from "./test-support.ts";

const memory = (seed: Record<string, string> = {}): Storage => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  } as Storage;
};

const two = [
  vehicleRow({ id: 4, label: "2012 Ford F-250" }),
  vehicleRow({ id: 9, label: "2018 Honda Civic" }),
];

describe("app state", () => {
  it("makes the first Vehicle current when none is remembered", async () => {
    const state = createAppState(stubApi({ vehicles: two }), memory());
    await state.refresh();
    expect(state.currentVehicle.value?.label).toBe("2012 Ford F-250");
  });

  it("switches the Current Vehicle and remembers it across a reload", async () => {
    const storage = memory();
    const state = createAppState(stubApi({ vehicles: two }), storage);
    await state.refresh();
    state.selectVehicle(9);
    expect(state.currentVehicle.value?.id).toBe(9);

    const reloaded = createAppState(stubApi({ vehicles: two }), storage);
    await reloaded.refresh();
    expect(reloaded.currentVehicle.value?.id).toBe(9);
  });

  it("falls back to the first Vehicle when the remembered one is gone", async () => {
    const storage = memory({ "obd-garage.current-vehicle": "77" });
    const state = createAppState(stubApi({ vehicles: two }), storage);
    await state.refresh();
    expect(state.currentVehicle.value?.id).toBe(4);
  });

  it("counts Unassigned logs and Failed Uploads for the menu", async () => {
    const state = createAppState(
      stubApi({
        vehicles: two,
        unassigned: [
          {
            id: 1,
            filename: "a.csv",
            recordedAt: null,
            durationSec: null,
            noteCount: 0,
            eventCount: 0,
            skippedRows: 0,
          },
        ],
        failed: [
          { id: 2, kind: "report", filename: "b.html", error: "bad", uploadedAt: "2026-10-01" },
          { id: 3, kind: "drive-log", filename: "c.csv", error: "bad", uploadedAt: "2026-10-02" },
        ],
      }),
      memory(),
    );
    await state.refresh();
    expect(state.unassignedCount.value).toBe(1);
    expect(state.failedCount.value).toBe(2);
    expect(state.needsAttention.value).toBe(true);
  });

  it("counts no Unassigned logs when the list is refused", async () => {
    const api = stubApi({ vehicles: two });
    const state = createAppState(api, memory());
    await state.refresh();
    expect(state.unassignedCount.value).toBe(0);
    expect(state.needsAttention.value).toBe(false);
  });

  it("reads the app version from the health route", async () => {
    const state = createAppState(stubApi({ version: "1.4.0" }), memory());
    await state.refresh();
    expect(state.version.value).toBe("1.4.0");
  });

  it("bumps the revision when data changes, so the list screens reload", () => {
    const state = createAppState(stubApi(), memory());
    const before = state.revision.value;
    state.invalidate();
    expect(state.revision.value).toBe(before + 1);
  });
});
