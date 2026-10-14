// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderApp } from "./test-render.tsx";
import { vehicleRow } from "./test-support.ts";

afterEach(cleanup);

const vehicles = [
  vehicleRow({ id: 4, label: "2012 Ford F-250", profileId: "ford-6.7", packIds: ["p0401"] }),
  vehicleRow({ id: 9, label: "2018 Honda Civic", profileId: "generic", packIds: [] }),
];
const profiles = [
  { id: "generic", name: "Generic" },
  { id: "ford-6.7", name: "Ford 6.7" },
];
const rulePacks = [
  { id: "p0401", name: "6.7 P0401", description: "Marks the P0401 entry window." },
  { id: "other", name: "Other pack", description: "Does something else." },
];
const stub = { vehicles, profiles, rulePacks };

describe("Vehicle settings", () => {
  beforeEach(() => history.replaceState(null, "", "/vehicles/4/settings"));

  it("shows the Profile as radio rows, Rule Packs as switch rows with descriptions, and the regenerate note", async () => {
    renderApp(stub);
    expect(
      ((await screen.findByRole("radio", { name: "Ford 6.7" })) as HTMLInputElement).checked,
    ).toBe(true);
    expect((screen.getByRole("radio", { name: "Generic" }) as HTMLInputElement).checked).toBe(
      false,
    );
    const on = screen.getByRole("switch", { name: /6\.7 P0401/ }) as HTMLInputElement;
    expect(on.checked).toBe(true);
    expect(screen.getByText("Marks the P0401 entry window.")).toBeTruthy();
    expect((screen.getByRole("switch", { name: /Other pack/ }) as HTMLInputElement).checked).toBe(
      false,
    );
    expect(
      screen.getByText(
        "Changing the Profile or a Rule Pack regenerates this Vehicle's Events. Notes are kept.",
      ),
    ).toBeTruthy();
  });

  it("saves a Profile change with PATCH and shows the saved state", async () => {
    const vehiclePatches: unknown[] = [];
    renderApp({ ...stub, vehicles: vehicles.map((v) => ({ ...v })), vehiclePatches });
    fireEvent.click(await screen.findByRole("radio", { name: "Generic" }));
    await waitFor(() =>
      expect((screen.getByRole("radio", { name: "Generic" }) as HTMLInputElement).checked).toBe(
        true,
      ),
    );
    expect(vehiclePatches).toEqual([{ param: { id: "4" }, json: { profileId: "generic" } }]);
    expect((screen.getByRole("radio", { name: "Ford 6.7" }) as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it("saves a Rule Pack toggle as the full list of pack ids, and only packIds", async () => {
    const vehiclePatches: unknown[] = [];
    renderApp({ ...stub, vehicles: vehicles.map((v) => ({ ...v })), vehiclePatches });
    fireEvent.click(await screen.findByRole("switch", { name: /Other pack/ }));
    await waitFor(() => expect(vehiclePatches).toHaveLength(1));
    fireEvent.click(screen.getByRole("switch", { name: /6.7 P0401/ }));
    await waitFor(() => expect(vehiclePatches).toHaveLength(2));
    expect(vehiclePatches).toEqual([
      { param: { id: "4" }, json: { packIds: ["p0401", "other"] } },
      { param: { id: "4" }, json: { packIds: ["other"] } },
    ]);
  });

  it("disables the controls while a PATCH is pending", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderApp({ ...stub, vehicles: vehicles.map((v) => ({ ...v })), vehiclePatchGate: gate });
    fireEvent.click(await screen.findByRole("radio", { name: "Generic" }));
    const inputs = () => screen.getAllByRole(/radio|switch/) as HTMLInputElement[];
    await waitFor(() => expect(inputs().every((i) => i.disabled)).toBe(true));
    release();
    await waitFor(() => expect(inputs().every((i) => !i.disabled)).toBe(true));
  });

  it.each(["status", "throw"] as const)(
    "toasts and keeps the saved state when a save fails (%s)",
    async (mode) => {
      renderApp({
        ...stub,
        vehicles: vehicles.map((v) => ({ ...v })),
        fail: { patchVehicle: mode },
      });
      fireEvent.click(await screen.findByRole("radio", { name: "Generic" }));
      expect((await screen.findByRole("status")).textContent).toBe("Couldn't save the change.");
      await waitFor(() =>
        expect((screen.getByRole("radio", { name: "Ford 6.7" }) as HTMLInputElement).checked).toBe(
          true,
        ),
      );
      expect((screen.getByRole("radio", { name: "Generic" }) as HTMLInputElement).checked).toBe(
        false,
      );
      expect((screen.getByRole("radio", { name: "Generic" }) as HTMLInputElement).disabled).toBe(
        false,
      );
    },
  );

  it("deletes the Vehicle with the Drive Logs box off by default, then returns to Vehicles", async () => {
    const vehicleDeletes: unknown[] = [];
    renderApp({
      ...stub,
      vehicles: vehicles.map((v) => ({ ...v, driveLogCount: 3 })),
      vehicleDeletes,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Delete vehicle…" }));
    const dialog = screen.getByRole("dialog");
    expect(
      (
        within(dialog).getByRole("checkbox", {
          name: "Also delete its 3 Drive Logs",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete vehicle" }));
    await waitFor(() => expect(location.pathname).toBe("/vehicles"));
    expect(vehicleDeletes).toEqual([{ param: { id: "4" }, query: {} }]);
  });
});
