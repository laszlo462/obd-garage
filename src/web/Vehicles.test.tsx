// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryStorage, renderApp } from "./test-render.tsx";
import { vehicleRow } from "./test-support.ts";

afterEach(cleanup);

const vehicles = [
  vehicleRow({
    id: 4,
    label: "2012 Ford F-250",
    vin: "TEST-VIN-00001234",
    profileId: "ford-6.7",
    packIds: ["p0401"],
    reportCount: 1,
    driveLogCount: 9,
    latestReportDate: "2026-10-02T21:32:14",
  }),
  vehicleRow({ id: 9, label: "2018 Honda Civic", vin: "TEST-VIN-00005678" }),
];

const panelOf = async (label: string) =>
  (await screen.findByRole("heading", { name: new RegExp(label) })).closest(
    "article",
  ) as HTMLElement;

const profiles = [
  { id: "generic", name: "Generic" },
  { id: "ford-6.7", name: "Ford 6.7" },
];
const rulePacks = [{ id: "p0401", name: "6.7 P0401", description: "Entry window for the test." }];

describe("Vehicles", () => {
  beforeEach(() => history.replaceState(null, "", "/vehicles"));

  it("shows one panel per Vehicle with label, Current badge, VIN, counts and latest Report date", async () => {
    renderApp({ vehicles, profiles, rulePacks });
    const first = await panelOf("2012 Ford F-250");
    expect(within(first).getByText("Current")).toBeTruthy();
    expect(within(first).getByText("TEST-VIN-00001234").classList.contains("mono")).toBe(true);
    expect(await within(first).findByText("Ford 6.7")).toBeTruthy();
    expect(within(first).getByText("6.7 P0401")).toBeTruthy();
    expect(within(first).getByText("1 report")).toBeTruthy();
    expect(within(first).getByText("9 drive logs")).toBeTruthy();
    expect(within(first).getByText("2 Oct")).toBeTruthy();
    const second = await panelOf("2018 Honda Civic");
    expect(within(second).queryByText("Current")).toBeNull();
    expect(within(second).getByText("Generic")).toBeTruthy();
    expect(within(second).getByText("No Rule Packs")).toBeTruthy();
    expect(within(second).getByText("0 reports")).toBeTruthy();
  });

  it("switches the Current Vehicle with Switch to, in the same store as the switcher", async () => {
    const storage = memoryStorage();
    renderApp({ vehicles }, storage);
    const first = await panelOf("2012 Ford F-250");
    const second = await panelOf("2018 Honda Civic");
    expect(
      (within(first).getByRole("button", { name: "Switch to" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(within(second).getByRole("button", { name: "Switch to" }));
    await waitFor(() => expect(within(second).getByText("Current")).toBeTruthy());
    expect(within(first).queryByText("Current")).toBeNull();
    expect(storage.getItem("obd-garage.current-vehicle")).toBe("9");
  });

  it("links each panel to its Vehicle settings", async () => {
    renderApp({ vehicles });
    const second = await panelOf("2018 Honda Civic");
    expect(within(second).getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/vehicles/9/settings",
    );
  });

  it("has an Export… button per panel and says how Vehicles are added", async () => {
    renderApp({ vehicles });
    const second = await panelOf("2018 Honda Civic");
    expect(within(second).getByRole("button", { name: "Export…" })).toBeTruthy();
    expect(
      screen.getByText("A Vehicle is added when a Diagnostic Report with a new VIN is uploaded."),
    ).toBeTruthy();
  });

  it("deletes a Vehicle after a confirm and sends no deleteLogs when the box is not ticked", async () => {
    const vehicleDeletes: unknown[] = [];
    renderApp({ vehicles: [...vehicles], vehicleDeletes });
    const first = await panelOf("2012 Ford F-250");
    fireEvent.click(within(first).getByRole("button", { name: "Delete…" }));
    const dialog = screen.getByRole("dialog");
    const box = within(dialog).getByRole("checkbox", {
      name: "Also delete its 9 Drive Logs",
    }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(vehicleDeletes).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete vehicle" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Ford F-250/ })).toBeNull());
    expect(vehicleDeletes).toEqual([{ param: { id: "4" }, query: {} }]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends deleteLogs=1 only when the Drive Logs box is ticked", async () => {
    const vehicleDeletes: unknown[] = [];
    renderApp({ vehicles: [...vehicles], vehicleDeletes });
    const first = await panelOf("2012 Ford F-250");
    fireEvent.click(within(first).getByRole("button", { name: "Delete…" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Also delete its 9 Drive Logs/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete vehicle" }));
    await waitFor(() => expect(vehicleDeletes).toHaveLength(1));
    expect(vehicleDeletes).toEqual([{ param: { id: "4" }, query: { deleteLogs: "1" } }]);
  });

  it("falls back to another Vehicle when the Current one is deleted, and refreshes the menu count", async () => {
    renderApp({ vehicles: [...vehicles] });
    const first = await panelOf("2012 Ford F-250");
    fireEvent.click(within(first).getByRole("button", { name: "Delete…" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete vehicle" }),
    );
    const second = await panelOf("2018 Honda Civic");
    await waitFor(() => expect(within(second).getByText("Current")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const row = screen.getByRole("link", { name: /Vehicles/ });
    expect(within(row).getByText("1")).toBeTruthy();
  });

  it("shows the no-Vehicle state after the last Vehicle is deleted", async () => {
    renderApp({ vehicles: [vehicles[0] as (typeof vehicles)[number]] });
    const only = await panelOf("2012 Ford F-250");
    fireEvent.click(within(only).getByRole("button", { name: "Delete…" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete vehicle" }),
    );
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Ford F-250/ })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(within(screen.getByRole("link", { name: /Vehicles/ })).getByText("0")).toBeTruthy();
  });

  it.each(["status", "throw"] as const)(
    "toasts and keeps the panel when a delete fails (%s)",
    async (mode) => {
      renderApp({ vehicles: [...vehicles], fail: { deleteVehicle: mode } });
      const first = await panelOf("2012 Ford F-250");
      fireEvent.click(within(first).getByRole("button", { name: "Delete…" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Delete vehicle" }),
      );
      expect((await screen.findByRole("status")).textContent).toBe("Couldn't delete the vehicle.");
      expect(screen.getByRole("heading", { name: /Ford F-250/ })).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("offers no Drive Logs box for a Vehicle without Drive Logs", async () => {
    renderApp({ vehicles: [...vehicles] });
    const second = await panelOf("2018 Honda Civic");
    fireEvent.click(within(second).getByRole("button", { name: "Delete…" }));
    expect(within(screen.getByRole("dialog")).queryByRole("checkbox")).toBeNull();
  });
});
