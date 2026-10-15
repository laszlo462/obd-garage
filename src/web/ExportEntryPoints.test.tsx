// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubCanvas } from "./test-canvas.ts";
import { renderApp } from "./test-render.tsx";
import {
  driveLogDetail,
  driveLogRow,
  reportDetail,
  reportRow,
  type StubData,
  vehicleRow,
} from "./test-support.ts";

afterEach(cleanup);

const vehicles = [
  vehicleRow({ id: 4, label: "2012 Ford F-250", vin: "TEST-VIN-00001234" }),
  vehicleRow({ id: 9, label: "2018 Honda Civic", vin: "TEST-VIN-00005678" }),
];

type Calls = NonNullable<StubData["summaryCalls"]>;
const wide = { from: "0001-01-01", to: "9999-12-31" };

describe("Export entry point: Vehicles", () => {
  beforeEach(() => history.replaceState(null, "", "/vehicles"));

  it("opens the Vehicle scope for the panel's Vehicle, not the Current Vehicle", async () => {
    const summaryCalls: Calls = [];
    renderApp({ vehicles, summaryCalls });
    const panel = (await screen.findByRole("heading", { name: /2018 Honda Civic/ })).closest(
      "article",
    ) as HTMLElement;
    fireEvent.click(within(panel).getByRole("button", { name: "Export…" }));

    expect(await screen.findByRole("dialog", { name: "Export" })).toBeTruthy();
    await waitFor(() => expect(summaryCalls).toEqual([{ vehicle: "9", ...wide }]));
  });
});

describe("Export entry point: Report viewer", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  it("opens the Report's Vehicle on This day, the Report's recorded day", async () => {
    const summaryCalls: Calls = [];
    renderApp({
      vehicles,
      summaryCalls,
      reportDetails: {
        2: reportDetail({ id: 2, vehicleId: 9, recordedAt: "2026-10-02T21:32:14" }),
      },
      reports: { 9: [reportRow({ id: 2, vehicleId: 9 })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    fireEvent.click(await screen.findByRole("button", { name: "Export this day…" }));

    expect(await screen.findByRole("dialog", { name: "Export" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Report" })).toBeNull();
    await waitFor(() =>
      expect(summaryCalls).toEqual([{ vehicle: "9", from: "2026-10-02", to: "2026-10-02" }]),
    );
    expect(screen.getByRole("button", { name: "This day" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("Export entry point: Drive Log viewer", () => {
  beforeEach(() => {
    stubCanvas();
    history.replaceState(null, "", "/drive-logs/1");
  });

  it("opens an assigned log's Vehicle on This day, the log's recorded day", async () => {
    const summaryCalls: Calls = [];
    renderApp({
      vehicles,
      summaryCalls,
      driveLogDetails: {
        1: driveLogDetail({ id: 1, vehicleId: 9, recordedAt: "2026-10-02T17:58:45" }),
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    fireEvent.click(await screen.findByRole("button", { name: "Export this day…" }));

    expect(await screen.findByRole("dialog", { name: "Export" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Drive Log" })).toBeNull();
    await waitFor(() =>
      expect(summaryCalls).toEqual([{ vehicle: "9", from: "2026-10-02", to: "2026-10-02" }]),
    );
    expect(screen.getByRole("button", { name: "This day" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("opens the Unassigned scope with just this log when the log is Unassigned", async () => {
    renderApp({
      vehicles,
      driveLogDetails: { 1: driveLogDetail({ id: 1, vehicleId: null }) },
    });
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    fireEvent.click(await screen.findByRole("button", { name: "Export this day…" }));

    const sheet = await screen.findByRole("dialog", { name: "Export 1 Drive Log" });
    const ids = [...sheet.querySelectorAll<HTMLInputElement>('input[name="logIds"]')];
    expect(ids.map((i) => i.value)).toEqual(["1"]);
  });
});

describe("Export entry point: Unassigned", () => {
  beforeEach(() => history.replaceState(null, "", "/unassigned"));

  it("enables Export once a log is ticked and opens the Unassigned scope with the ticked ids", async () => {
    renderApp({
      vehicles,
      unassigned: [driveLogRow({ id: 5 }), driveLogRow({ id: 6 }), driveLogRow({ id: 7 })],
    });
    const boxes = await screen.findAllByRole("checkbox");
    const exportButton = screen.getByRole("button", { name: "Export" }) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);

    fireEvent.click(boxes[0] as HTMLElement);
    fireEvent.click(boxes[2] as HTMLElement);
    expect(exportButton.disabled).toBe(false);
    fireEvent.click(exportButton);

    const sheet = await screen.findByRole("dialog", { name: "Export 2 Drive Logs" });
    const ids = [...sheet.querySelectorAll<HTMLInputElement>('input[name="logIds"]')];
    expect(ids.map((i) => i.value)).toEqual(["5", "7"]);
  });
});

describe("Export entry point: Menu", () => {
  beforeEach(() => history.replaceState(null, "", "/"));

  it("closes the Menu and opens the Vehicle scope for the Current Vehicle on All time", async () => {
    const summaryCalls: Calls = [];
    renderApp({ vehicles, summaryCalls });
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(await screen.findByRole("button", { name: "Export 2012 Ford F-250…" }));

    expect(await screen.findByRole("dialog", { name: "Export" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    await waitFor(() => expect(summaryCalls).toEqual([{ vehicle: "4", ...wide }]));
    expect(screen.getByRole("button", { name: "All time" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.queryByRole("button", { name: "This day" })).toBeNull();
  });

  it("has no Export row when there is no Current Vehicle", async () => {
    renderApp({ vehicles: [] });
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = await screen.findByRole("dialog", { name: "Menu" });
    expect(within(menu).queryByRole("button", { name: /^Export/ })).toBeNull();
  });
});
