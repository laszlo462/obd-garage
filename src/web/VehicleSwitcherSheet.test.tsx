// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { memoryStorage, renderWithApp } from "./test-render.tsx";
import { vehicleRow } from "./test-support.ts";
import { VehicleSwitcherSheet } from "./VehicleSwitcherSheet.tsx";

afterEach(cleanup);

const vehicles = [
  vehicleRow({
    id: 4,
    label: "2012 Ford F-250",
    vin: "TEST-VIN-00001234",
    reportCount: 2,
    driveLogCount: 9,
  }),
  vehicleRow({
    id: 9,
    label: "2018 Honda Civic",
    vin: "TEST-VIN-00005678",
    reportCount: 1,
    driveLogCount: 3,
  }),
];

describe("VehicleSwitcherSheet", () => {
  it("lists each Vehicle as a radio with label, VIN last 4 and counts", async () => {
    renderWithApp(<VehicleSwitcherSheet onClose={() => {}} />, { vehicles });
    const first = (await screen.findByRole("radio", {
      name: /2012 Ford F-250/,
    })) as HTMLInputElement;
    expect(first.checked).toBe(true);
    const name = first.closest("label")?.textContent ?? "";
    expect(name).toContain("1234");
    expect(name).toContain("2 reports");
    expect(name).toContain("9 drive logs");
    expect(screen.getByRole("radio", { name: /2018 Honda Civic/ })).toBeTruthy();
  });

  it("switches the Current Vehicle and remembers it on this device", async () => {
    const storage = memoryStorage();
    renderWithApp(<VehicleSwitcherSheet onClose={() => {}} />, { vehicles }, storage);
    const civic = (await screen.findByRole("radio", {
      name: /2018 Honda Civic/,
    })) as HTMLInputElement;
    fireEvent.click(civic);
    await waitFor(() => expect(civic.checked).toBe(true));
    expect(
      (screen.getByRole("radio", { name: /2012 Ford F-250/ }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(storage.getItem("obd-garage.current-vehicle")).toBe("9");
  });

  it("links to the Vehicles route with Manage vehicles…", async () => {
    renderWithApp(<VehicleSwitcherSheet onClose={() => {}} />, { vehicles });
    const link = await screen.findByRole("link", { name: "Manage vehicles…" });
    expect(link.getAttribute("href")).toBe("/vehicles");
  });

  it("explains an empty garage instead of listing Vehicles", async () => {
    renderWithApp(<VehicleSwitcherSheet onClose={() => {}} />, { vehicles: [] });
    expect(await screen.findByText(/No vehicles yet/)).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("does not claim an empty garage before the first load", () => {
    renderWithApp(<VehicleSwitcherSheet onClose={() => {}} />, { pending: true });
    expect(screen.queryByText(/No vehicles yet/)).toBeNull();
  });
});
