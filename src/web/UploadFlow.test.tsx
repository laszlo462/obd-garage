// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pickFiles, renderApp } from "./test-render.tsx";
import { type StubData, vehicleRow } from "./test-support.ts";
import type { UploadResult } from "./upload-batch.ts";

beforeEach(() => history.replaceState(null, "", "/"));
afterEach(cleanup);

const html = (name: string) => new File(["<html><body>"], name);
const csv = (name: string) => new File(["Time,RPM\n0,800\n"], name);

const newVinReport: UploadResult = {
  outcome: "added",
  kind: "report",
  warnings: [],
  vehicleCreated: {
    id: 5,
    label: "2012 Ford F-250",
    vin: "TEST-VIN-00001234",
    profile: "generic",
    packs: [],
    sameDayUnassigned: [],
  },
};

describe("Upload flow: navigation", () => {
  it("keeps the queued New vehicle sheet when a Batch result link navigates away", async () => {
    renderApp({
      vehicles: [vehicleRow({ id: 1 })],
      uploadResults: {
        "r.html": newVinReport,
        "bad.html": { outcome: "failed", kind: "report", warnings: [], reason: "Unreadable." },
      },
    });
    await screen.findByRole("button", { name: /Add/ });
    pickFiles(html("r.html"), html("bad.html"));
    await screen.findByRole("dialog", { name: "1 added, 1 not" });
    fireEvent.click(screen.getByRole("link", { name: "Failed Uploads" }));
    await screen.findByRole("dialog", { name: "New vehicle added" });
    expect(screen.queryByRole("dialog", { name: "1 added, 1 not" })).toBeNull();
    expect(location.pathname).toBe("/failed-uploads");
  });
});

describe("Upload flow: a second pick", () => {
  it("is blocked mid-batch: Add reopens the progress sheet and no second batch starts", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const uploadCalls: unknown[] = [];
    renderApp({ vehicles: [vehicleRow({ id: 1 })], uploadCalls, uploadGates: { "a.csv": gate } });
    await screen.findByRole("button", { name: /Add/ });
    const input = pickFiles(csv("a.csv"));
    fireEvent.click(await screen.findByRole("button", { name: "Upload Drive Logs" }));
    await screen.findByRole("dialog", { name: "Uploading" });
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("dialog", { name: "Uploading" })).toBeNull();
    let opened = 0;
    input.click = () => {
      opened++;
    };
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    await screen.findByRole("dialog", { name: "Uploading" });
    expect(opened).toBe(0);
    pickFiles(csv("b.csv"));
    release();
    await screen.findByRole("dialog", { name: "1 file added" });
    expect(uploadCalls).toHaveLength(1);
  });
});

describe("Upload flow: a failing refresh", () => {
  it("still shows the Batch result, under the banner", async () => {
    const fail: StubData["fail"] = {};
    renderApp({ vehicles: [vehicleRow({ id: 1 })], fail });
    await screen.findByRole("button", { name: /Add/ });
    await screen.findByText("2012 Ford F-250");
    fail.health = "throw"; // the first load worked; break the refresh that ends the batch
    pickFiles(html("r.html"));
    await screen.findByRole("dialog", { name: "1 file added" });
    await screen.findByRole("alert");
  });
});

describe("Upload flow: a failed assign", () => {
  it.each(["status", "throw"] as const)("toasts when assigning fails (%s)", async (mode) => {
    const withLogs: UploadResult = {
      ...newVinReport,
      vehicleCreated: {
        ...(newVinReport.vehicleCreated as NonNullable<UploadResult["vehicleCreated"]>),
        sameDayUnassigned: [
          { uploadId: 11, filename: "same-a.csv", recordedAt: "2026-10-04T17:22:05" },
        ],
      },
    };
    renderApp({ uploadResults: { "r.html": withLogs }, fail: { assign: mode } });
    await screen.findByRole("button", { name: /Add/ });
    pickFiles(html("r.html"));
    await screen.findByRole("dialog", { name: "1 file added" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByRole("dialog", { name: "New vehicle added" });
    fireEvent.click(screen.getByRole("button", { name: "Assign to this vehicle" }));
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toBe("Couldn't assign the drive logs.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Upload flow: the first Vehicles load failed", () => {
  it("uploads nothing and toasts, then works once the route is mended", async () => {
    const fail: StubData["fail"] = { vehicles: "status" };
    const uploadCalls: unknown[] = [];
    renderApp({ vehicles: [vehicleRow({ id: 1 })], uploadCalls, fail });
    await screen.findByRole("alert");
    pickFiles(csv("a.csv"));
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toBe("Couldn't load your vehicles.");
    expect(uploadCalls).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
    delete fail.vehicles;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("2012 Ford F-250");
    pickFiles(csv("a.csv"));
    fireEvent.click(await screen.findByRole("button", { name: "Upload Drive Logs" }));
    await screen.findByRole("dialog", { name: "1 file added" });
    expect(uploadCalls).toHaveLength(1);
  });
});

const withLogs: UploadResult = {
  ...newVinReport,
  vehicleCreated: {
    ...(newVinReport.vehicleCreated as NonNullable<UploadResult["vehicleCreated"]>),
    sameDayUnassigned: [
      { uploadId: 11, filename: "same-a.csv", recordedAt: "2026-10-04T17:22:05" },
      { uploadId: 12, filename: "same-b.csv", recordedAt: "2026-10-04T18:02:41" },
    ],
  },
};

const profiles = [
  { id: "generic", name: "Generic" },
  { id: "ford-6.7", name: "Ford 6.7" },
];

/** Picks a report that creates Vehicle 5 with two same-day logs, and opens its New vehicle sheet. */
async function openNewVehicleSheet(data: StubData) {
  renderApp({
    vehicles: [vehicleRow({ id: 1 })],
    profiles,
    uploadResults: { "r.html": withLogs },
    ...data,
  });
  await screen.findByRole("button", { name: /Add/ });
  pickFiles(html("r.html"));
  await screen.findByRole("dialog", { name: "1 file added" });
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  return screen.findByRole("dialog", { name: "New vehicle added" });
}

const tickedState = (name: RegExp) =>
  (screen.getByRole("checkbox", { name }) as HTMLInputElement).checked;
const barBack = () => document.querySelector(".app-bar a.bar-control") as HTMLElement;

describe("Upload flow: Change on the New vehicle sheet", () => {
  it("reopens the sheet with the same ticks after Back, and Assign posts the ticked logs", async () => {
    const assignCalls: unknown[] = [];
    await openNewVehicleSheet({ assignCalls });
    fireEvent.click(screen.getByRole("checkbox", { name: /same-a\.csv/ }));
    fireEvent.click(screen.getByRole("link", { name: "Change" }));
    await screen.findByRole("radio", { name: "Ford 6.7" });
    expect(screen.queryByRole("dialog", { name: "New vehicle added" })).toBeNull();
    expect(location.pathname).toBe("/vehicles/5/settings");
    fireEvent.click(barBack());
    await screen.findByRole("dialog", { name: "New vehicle added" });
    expect(tickedState(/same-a\.csv/)).toBe(false);
    expect(tickedState(/same-b\.csv/)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Assign to this vehicle" }));
    await waitFor(() => expect(assignCalls).toEqual([{ logIds: [12], vehicleId: 5 }]));
  });

  it("shows the Profile saved in settings on the reopened sheet", async () => {
    const vehiclePatches: unknown[] = [];
    await openNewVehicleSheet({ vehiclePatches });
    const before = screen.getByRole("dialog", { name: "New vehicle added" });
    expect(within(before).getByText("generic")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Change" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Ford 6.7" }));
    await waitFor(() => expect(vehiclePatches).toHaveLength(1));
    await waitFor(() =>
      expect((screen.getByRole("radio", { name: "Ford 6.7" }) as HTMLInputElement).checked).toBe(
        true,
      ),
    );
    fireEvent.click(barBack());
    const after = await screen.findByRole("dialog", { name: "New vehicle added" });
    expect(within(after).getByText("ford-6.7")).toBeTruthy();
    expect(within(after).queryByText("generic")).toBeNull();
  });

  it("closes for good, as before, when no Unassigned log shares the day", async () => {
    renderApp({
      vehicles: [vehicleRow({ id: 1 })],
      profiles,
      uploadResults: { "r.html": newVinReport },
    });
    await screen.findByRole("button", { name: /Add/ });
    pickFiles(html("r.html"));
    await screen.findByRole("dialog", { name: "1 file added" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByRole("dialog", { name: "New vehicle added" });
    fireEvent.click(screen.getByRole("link", { name: "Change" }));
    await screen.findByRole("radio", { name: "Ford 6.7" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(barBack());
    await waitFor(() => expect(location.pathname).not.toBe("/vehicles/5/settings"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not reopen the sheet when the Vehicle is deleted in settings, and the next one comes up", async () => {
    const vehicleDeletes: unknown[] = [];
    const second: UploadResult = {
      ...newVinReport,
      vehicleCreated: {
        id: 6,
        label: "2018 Honda Civic",
        vin: "TEST-VIN-00005678",
        profile: "generic",
        packs: [],
        sameDayUnassigned: [],
      },
    };
    renderApp({
      vehicles: [vehicleRow({ id: 1 })],
      profiles,
      vehicleDeletes,
      uploadResults: { "r.html": withLogs, "s.html": second },
    });
    await screen.findByRole("button", { name: /Add/ });
    pickFiles(html("r.html"), html("s.html"));
    await screen.findByRole("dialog", { name: "2 files added" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByRole("dialog", { name: "New vehicle added" });
    fireEvent.click(screen.getByRole("link", { name: "Change" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete vehicle…" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete vehicle" }),
    );
    await waitFor(() => expect(location.pathname).toBe("/vehicles"));
    expect(vehicleDeletes).toHaveLength(1);
    const next = await screen.findByRole("dialog", { name: "New vehicle added" });
    expect(within(next).getByText("2018 Honda Civic")).toBeTruthy();
    expect(within(next).queryByText("2012 Ford F-250")).toBeNull();
  });
});
