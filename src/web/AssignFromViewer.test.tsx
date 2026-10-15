// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubCanvas } from "./test-canvas.ts";
import { renderApp } from "./test-render.tsx";
import { driveLogDetail, reportRow, type StubData, vehicleRow } from "./test-support.ts";

beforeEach(() => {
  stubCanvas();
  history.replaceState(null, "", "/drive-logs/1");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const noReference = {
  id: null,
  defaultId: null,
  state: "default" as const,
  recordedAt: null,
  freezeFrame: [],
};
const data = (over: StubData = {}): StubData => ({
  vehicles: [vehicleRow({ id: 1, label: "2012 Ford F-250" }), vehicleRow({ id: 2, label: "Van" })],
  reports: { 1: [reportRow({ id: 2, recordedAt: "2026-10-02T21:32:14" })] },
  ...over,
});

describe("Drive Log viewer: assigning", () => {
  it("assigns from the Assign to a Vehicle… chip, then shows the Vehicle's Events and default Reference Report", async () => {
    const assignCalls: unknown[] = [];
    renderApp(
      data({
        assignCalls,
        driveLogDetails: {
          1: driveLogDetail({
            vehicleId: null,
            events: [],
            ruleOutcomes: [],
            referenceReport: noReference,
          }),
        },
        // What the server re-derives once the log has a Vehicle.
        assignedDetails: { 1: driveLogDetail({ vehicleId: 1 }) },
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Assign to a Vehicle…" }));
    const sheet = await screen.findByRole("dialog", { name: "Assign to…" });
    // The Current Vehicle is picked once the Vehicles have loaded.
    const ford = await within(sheet).findByRole("radio", { name: "2012 Ford F-250" });
    await waitFor(() => expect((ford as HTMLInputElement).checked).toBe(true));
    fireEvent.click(within(sheet).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(assignCalls).toEqual([{ logIds: [1], vehicleId: 1 }]));
    expect(await screen.findByRole("button", { name: "Reference: 2 Oct report" })).toBeTruthy();
    expect(screen.getByText("Idle")).toBeTruthy();
    expect(screen.getByText(/2012 Ford F-250/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /** Opens the … sheet, then Change Vehicle…, and returns the Assign to… sheet. */
  const openChangeVehicle = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    const menu = await screen.findByRole("dialog", { name: "Drive Log" });
    fireEvent.click(within(menu).getByRole("button", { name: "Change Vehicle…" }));
    return screen.findByRole("dialog", { name: "Assign to…" });
  };

  it("moves a log to another Vehicle with Change Vehicle…, which starts on its own Vehicle", async () => {
    const assignCalls: unknown[] = [];
    renderApp(data({ assignCalls, driveLogDetails: { 1: driveLogDetail({ vehicleId: 1 }) } }));
    const sheet = await openChangeVehicle();
    const ford = within(sheet).getByRole("radio", { name: "2012 Ford F-250" });
    expect((ford as HTMLInputElement).checked).toBe(true);
    expect(
      (within(sheet).getByRole("button", { name: "Assign" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(within(sheet).getByRole("radio", { name: "Van" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(assignCalls).toEqual([{ logIds: [1], vehicleId: 2 }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText(/^Van · /)).toBeTruthy();
  });

  it("moves a log back to Unassigned with vehicleId null", async () => {
    const assignCalls: unknown[] = [];
    renderApp(data({ assignCalls, driveLogDetails: { 1: driveLogDetail({ vehicleId: 1 }) } }));
    const sheet = await openChangeVehicle();
    fireEvent.click(within(sheet).getByRole("radio", { name: "Unassigned" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(assignCalls).toEqual([{ logIds: [1], vehicleId: null }]));
    expect(await screen.findByRole("button", { name: "Assign to a Vehicle…" })).toBeTruthy();
  });
});
