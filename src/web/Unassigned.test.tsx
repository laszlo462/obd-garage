// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderApp } from "./test-render.tsx";
import { driveLogRow, type StubData, vehicleRow } from "./test-support.ts";

afterEach(cleanup);

describe("Unassigned", () => {
  beforeEach(() => history.replaceState(null, "", "/unassigned"));

  it("lists each log with its date-time, duration and badges, and a View link to the viewer", async () => {
    renderApp({
      vehicles: [vehicleRow()],
      unassigned: [
        driveLogRow({ id: 5, eventCount: 3, noteCount: 1, skippedRows: 2 }),
        driveLogRow({ id: 6, recordedAt: "2026-10-05T08:00:00", durationSec: 600 }),
      ],
    });
    const first = (await screen.findByText("04 Oct 17:22")).closest("li") as HTMLElement;
    expect(within(first).getByText("41 min")).toBeTruthy();
    expect(within(first).getByText("3 events")).toBeTruthy();
    expect(within(first).getByText("1 note")).toBeTruthy();
    expect(within(first).getByText("2 rows skipped")).toBeTruthy();
    expect(within(first).getByRole("link", { name: "View" }).getAttribute("href")).toBe(
      "/drive-logs/5",
    );
    expect(screen.getByText("05 Oct 08:00")).toBeTruthy();
    expect(
      screen.getByText(
        "These Drive Logs are not assigned to a Vehicle. Tick the ones to assign or delete.",
      ),
    ).toBeTruthy();
  });

  it("says so when there are none", async () => {
    renderApp({ vehicles: [vehicleRow()] });
    expect(await screen.findByText("No unassigned drive logs.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Assign to…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(document.querySelector("ul")).toBeNull();
  });

  it("says there are no Vehicles in the Assign to… sheet, and leaves Assign disabled", async () => {
    renderApp({ vehicles: [], unassigned: [driveLogRow({ id: 5 })] });
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Assign to…" }));
    const sheet = await screen.findByRole("dialog", { name: "Assign to…" });
    expect(within(sheet).getByText("There are no Vehicles yet.")).toBeTruthy();
    expect(
      (within(sheet).getByRole("button", { name: "Assign" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps Assign to… and Delete disabled until a log is ticked, and Export always", async () => {
    renderApp({
      vehicles: [vehicleRow()],
      unassigned: [driveLogRow({ id: 5 }), driveLogRow({ id: 6 })],
    });
    await screen.findAllByRole("checkbox");
    const actions = () => ({
      assign: screen.getByRole("button", { name: "Assign to…" }) as HTMLButtonElement,
      exportLogs: screen.getByRole("button", { name: "Export" }) as HTMLButtonElement,
      remove: screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement,
    });
    expect(actions().assign.disabled).toBe(true);
    expect(actions().remove.disabled).toBe(true);
    expect(actions().exportLogs.disabled).toBe(true);
    const [first] = screen.getAllByRole("checkbox");
    fireEvent.click(first as HTMLElement);
    expect(actions().assign.disabled).toBe(false);
    expect(actions().remove.disabled).toBe(false);
    expect(actions().exportLogs.disabled).toBe(true);
    fireEvent.click(first as HTMLElement);
    expect(actions().assign.disabled).toBe(true);
  });

  it("assigns exactly the ticked logs to the picked Vehicle, then drops them from the list", async () => {
    const assignCalls: unknown[] = [];
    renderApp({
      vehicles: [
        vehicleRow({ id: 1, label: "2012 Ford F-250" }),
        vehicleRow({ id: 2, label: "Van" }),
      ],
      unassigned: [driveLogRow({ id: 5 }), driveLogRow({ id: 6 }), driveLogRow({ id: 7 })],
      assignCalls,
    });
    const boxes = await screen.findAllByRole("checkbox");
    fireEvent.click(boxes[0] as HTMLElement);
    fireEvent.click(boxes[2] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Assign to…" }));
    const sheet = await screen.findByRole("dialog", { name: "Assign to…" });
    expect(
      within(sheet).getByText(
        "Events are regenerated with the Vehicle's Profile and Rule Packs. Notes are kept.",
      ),
    ).toBeTruthy();
    // The Current Vehicle is picked first.
    expect(
      (within(sheet).getByRole("radio", { name: "2012 Ford F-250" }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(within(sheet).getByRole("radio", { name: "Van" }));
    expect(assignCalls).toEqual([]);
    fireEvent.click(within(sheet).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(assignCalls).toEqual([{ logIds: [5, 7], vehicleId: 2 }]));
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("confirms with the count, then deletes each ticked log, clears the ticks and updates the menu badge", async () => {
    const deletedUploads: number[] = [];
    renderApp({
      vehicles: [vehicleRow()],
      unassigned: [driveLogRow({ id: 5 }), driveLogRow({ id: 6 }), driveLogRow({ id: 7 })],
      deletedUploads,
    });
    const boxes = await screen.findAllByRole("checkbox");
    fireEvent.click(boxes[0] as HTMLElement);
    fireEvent.click(boxes[2] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete 2 Drive Logs?" });
    expect(within(dialog).getByText("The original files and their parsed data.")).toBeTruthy();
    expect(within(dialog).getByText("Any Notes on them.")).toBeTruthy();
    expect(deletedUploads).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deletedUploads).toEqual([5, 7]));
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: /Menu/ }));
    const row = screen.getByRole("link", { name: /Unassigned/ });
    await waitFor(() => expect(within(row).getByText("1")).toBeTruthy());
  });

  it.each(["status", "throw"] as const)(
    "toasts how many failed and keeps the rows when a delete fails (%s)",
    async (mode) => {
      renderApp({
        vehicles: [vehicleRow()],
        unassigned: [driveLogRow({ id: 5 }), driveLogRow({ id: 6 })],
        fail: { deleteUpload: mode },
      });
      const boxes = await screen.findAllByRole("checkbox");
      fireEvent.click(boxes[0] as HTMLElement);
      fireEvent.click(boxes[1] as HTMLElement);
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      fireEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
      );
      const toast = await screen.findByRole("status");
      expect(toast.textContent).toBe("Couldn't delete 2 drive logs.");
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it.each(["status", "throw"] as const)(
    "toasts and keeps the rows and ticks when the assign fails (%s), so it can be retried",
    async (mode) => {
      const fail: StubData["fail"] = { assign: mode };
      const assignCalls: unknown[] = [];
      renderApp({
        vehicles: [vehicleRow({ id: 1 })],
        unassigned: [driveLogRow({ id: 5 }), driveLogRow({ id: 6 })],
        assignCalls,
        fail,
      });
      const boxes = await screen.findAllByRole("checkbox");
      fireEvent.click(boxes[1] as HTMLElement);
      fireEvent.click(screen.getByRole("button", { name: "Assign to…" }));
      fireEvent.click(await screen.findByRole("button", { name: "Assign" }));
      const toast = await screen.findByRole("status");
      expect(toast.textContent).toBe("Couldn't assign the drive logs.");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect((screen.getAllByRole("checkbox")[1] as HTMLInputElement).checked).toBe(true);
      delete fail.assign;
      fireEvent.click(screen.getByRole("button", { name: "Assign to…" }));
      fireEvent.click(await screen.findByRole("button", { name: "Assign" }));
      await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(1));
      // The stub records only the calls it answered: the retry, with the ticks the failure kept.
      expect(assignCalls).toEqual([{ logIds: [6], vehicleId: 1 }]);
    },
  );
});
