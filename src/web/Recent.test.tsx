// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderApp } from "./test-render.tsx";
import { feedLog, feedReport, type StubData, statusReport, vehicleRow } from "./test-support.ts";

beforeEach(() => history.replaceState(null, "", "/"));
afterEach(cleanup);

const vehicles = [vehicleRow({ id: 4, label: "Truck" }), vehicleRow({ id: 9, label: "Civic" })];

describe("Recent", () => {
  it("shows the stat strip and the uploads of the Current Vehicle, newest first", async () => {
    renderApp({
      vehicles,
      status: { 4: { report: statusReport({ id: 2, mil: "on" }), previous: null } },
      uploads: {
        4: [
          feedReport({ id: 2, recordedAt: "2026-10-02T21:32:14" }),
          feedLog({ id: 1, recordedAt: "2026-10-02T17:58:45" }),
        ],
      },
    });
    expect(await screen.findByText("Recent uploads")).toBeTruthy();
    const links = await screen.findAllByRole("link", { name: /REPORT|LOG/ });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/reports/2", "/drive-logs/1"]);
    expect(screen.getByText("ON")).toBeTruthy();
  });

  it("reads No diagnostic report yet when the Vehicle has no Report", async () => {
    renderApp({ vehicles });
    expect(await screen.findByText("No diagnostic report yet")).toBeTruthy();
  });

  it("never shows Unassigned Drive Logs", async () => {
    renderApp({
      vehicles,
      unassigned: [
        {
          id: 50,
          filename: "loose.csv",
          recordedAt: "2026-01-01T01:01:01",
          durationSec: 60,
          noteCount: 0,
          eventCount: 0,
          skippedRows: 0,
        },
      ],
      uploads: { 4: [feedLog({ id: 1 })] },
    });
    await screen.findByRole("link", { name: /LOG/ });
    expect(screen.queryByText(/01 Jan 01:01/)).toBeNull();
    expect(document.querySelector('a[href="/drive-logs/50"]')).toBeNull();
  });

  it("pages older uploads with before, without duplicating rows", async () => {
    const rows = [3, 2, 1].map((id) => feedLog({ id, recordedAt: `2026-10-0${id}T10:00:00` }));
    renderApp({ vehicles, uploads: { 4: rows }, pageSize: 2 });
    await screen.findAllByRole("link", { name: /LOG/ });
    expect(screen.getAllByRole("link", { name: /LOG/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Show older" }));
    await waitFor(() => expect(screen.getAllByRole("link", { name: /LOG/ })).toHaveLength(3));
    expect(screen.getAllByRole("link", { name: /LOG/ }).map((l) => l.getAttribute("href"))).toEqual(
      ["/drive-logs/3", "/drive-logs/2", "/drive-logs/1"],
    );
    expect(screen.queryByRole("button", { name: "Show older" })).toBeNull();
  });

  it("toasts and re-enables Show older when paging fails, and works on a second try", async () => {
    const rows = [3, 2, 1].map((id) => feedLog({ id, recordedAt: `2026-10-0${id}T10:00:00` }));
    const fail: StubData["fail"] = { olderUploads: "status" };
    renderApp({ vehicles, uploads: { 4: rows }, pageSize: 2, fail });
    await screen.findAllByRole("link", { name: /LOG/ });
    fireEvent.click(screen.getByRole("button", { name: "Show older" }));
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toBe("Couldn't load older uploads.");
    const button = screen.getByRole("button", { name: "Show older" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    delete fail.olderUploads;
    fireEvent.click(button);
    await waitFor(() => expect(screen.getAllByRole("link", { name: /LOG/ })).toHaveLength(3));
  });

  it("shows another Vehicle's uploads after the Current Vehicle changes", async () => {
    renderApp({
      vehicles,
      uploads: {
        4: [feedLog({ id: 1, recordedAt: "2026-10-01T10:00:00" })],
        9: [feedLog({ id: 7, recordedAt: "2026-09-09T09:09:00" })],
      },
    });
    await screen.findByText("01 Oct 10:00");
    fireEvent.click(screen.getByRole("button", { name: /Truck/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("radio", { name: /Civic/ }));
    expect(await screen.findByText("09 Sep 09:09")).toBeTruthy();
    expect(screen.queryByText("01 Oct 10:00")).toBeNull();
  });
});
