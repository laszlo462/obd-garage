// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/preact";
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
