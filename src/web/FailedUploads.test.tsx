// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderApp } from "./test-render.tsx";
import { type FailedRow, type StubData, vehicleRow } from "./test-support.ts";

afterEach(cleanup);

const failedRow = (over: Partial<FailedRow> = {}): FailedRow => ({
  id: 7,
  kind: "report",
  filename: "broken.html",
  error: "Not an OBDLink report.",
  uploadedAt: new Date(2026, 9, 12, 10, 5).toISOString(),
  ...over,
});

describe("Failed Uploads", () => {
  beforeEach(() => history.replaceState(null, "", "/failed-uploads"));

  it("shows each Failed Upload as a panel with its filename, kind, time and error text", async () => {
    renderApp({ vehicles: [vehicleRow()], failed: [failedRow()] });
    const panel = (await screen.findByText("broken.html")).closest("article") as HTMLElement;
    expect(within(panel).getByText("REPORT")).toBeTruthy();
    expect(within(panel).getByText("12 Oct 10:05")).toBeTruthy();
    expect(within(panel).getByText("Not an OBDLink report.")).toBeTruthy();
  });

  it("inserts the error as text, never as markup", async () => {
    const error = "<img src=x> <b>bold</b>";
    renderApp({ vehicles: [vehicleRow()], failed: [failedRow({ error })] });
    const panel = (await screen.findByText("broken.html")).closest("article") as HTMLElement;
    expect(within(panel).getByText(error)).toBeTruthy();
    expect(panel.querySelector("img, b")).toBeNull();
  });

  it("says so when there are none", async () => {
    renderApp({ vehicles: [vehicleRow()] });
    expect(await screen.findByText("No failed uploads.")).toBeTruthy();
    expect(screen.getByText(/could not be read/)).toBeTruthy();
  });

  it("offers the Original as a download link", async () => {
    renderApp({ vehicles: [vehicleRow()], failed: [failedRow({ id: 7 })] });
    const link = await screen.findByRole("link", { name: "Download original" });
    expect(link.getAttribute("href")).toBe("/api/uploads/7/original");
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("deletes after a confirm, removes the panel and updates the menu badge", async () => {
    const deletedUploads: number[] = [];
    renderApp({
      vehicles: [vehicleRow()],
      failed: [failedRow({ id: 7 }), failedRow({ id: 8, filename: "other.html" })],
      deletedUploads,
    });
    const panel = (await screen.findByText("broken.html")).closest("article") as HTMLElement;
    fireEvent.click(within(panel).getByRole("button", { name: "Delete" }));
    expect(deletedUploads).toEqual([]);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("broken.html")).toBeNull());
    expect(deletedUploads).toEqual([7]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("other.html")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Menu/ }));
    const row = screen.getByRole("link", { name: /Failed Uploads/ });
    await waitFor(() => expect(within(row).getByText("1")).toBeTruthy());
  });
});

describe("Failed Uploads: errors", () => {
  beforeEach(() => history.replaceState(null, "", "/failed-uploads"));

  it("shows the banner when the list fails to load, and Retry loads it", async () => {
    const fail: StubData["fail"] = { failedUploads: "status" };
    renderApp({ vehicles: [vehicleRow()], failed: [failedRow()], fail });
    await screen.findByRole("alert");
    expect(screen.queryByText("broken.html")).toBeNull();
    delete fail.failedUploads;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("broken.html");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it.each(["status", "throw"] as const)(
    "toasts and keeps the panel when a delete fails (%s)",
    async (mode) => {
      renderApp({ vehicles: [vehicleRow()], failed: [failedRow()], fail: { deleteUpload: mode } });
      const panel = (await screen.findByText("broken.html")).closest("article") as HTMLElement;
      fireEvent.click(within(panel).getByRole("button", { name: "Delete" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
      const toast = await screen.findByRole("status");
      expect(toast.textContent).toBe("Couldn't delete the upload.");
      expect(screen.getByText("broken.html")).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
});
