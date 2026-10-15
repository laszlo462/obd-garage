// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDateTime } from "./format.ts";
import { renderApp } from "./test-render.tsx";
import { noteRow, reportDetail, reportRow, type StubData, vehicleRow } from "./test-support.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const reportData = (over: StubData = {}): StubData => ({
  vehicles: [vehicleRow({ id: 1 })],
  reportDetails: { 2: reportDetail({ id: 2 }) },
  reports: { 1: [reportRow({ id: 2 })] },
  ...over,
});

/** The Report viewer's Notes section. */
const notesSection = async () => {
  const title = await screen.findByText("Notes", { selector: ".section-title" });
  return within(title.closest("details") as HTMLElement);
};

describe("Report viewer: Notes section", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  it("lists the Notes of the Report, oldest first", async () => {
    renderApp(
      reportData({
        notes: {
          2: [
            noteRow({
              id: 2,
              uploadId: 2,
              text: "Added later",
              createdAt: "2026-10-05T09:00:00.000Z",
            }),
            noteRow({
              id: 1,
              uploadId: 2,
              text: "Added first",
              createdAt: "2026-10-04T09:00:00.000Z",
            }),
          ],
        },
      }),
    );
    const section = await notesSection();
    await waitFor(() => expect(section.getAllByRole("listitem").length).toBe(2));
    expect(section.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Added first"),
      expect.stringContaining("Added later"),
    ]);
  });

  it("opens a Note in Note view with its text and when it was added, inserting the text as text", async () => {
    const text = "<img src=x onerror=alert(1)><b>bold</b>";
    renderApp(
      reportData({
        notes: {
          2: [noteRow({ id: 1, uploadId: 2, text, createdAt: "2026-10-04T09:00:00.000Z" })],
        },
      }),
    );
    const section = await notesSection();
    fireEvent.click(await section.findByRole("button", { name: /img src=x/ }));
    const view = within(await screen.findByRole("dialog", { name: "Note" }));
    expect(view.getByText(text)).toBeTruthy();
    expect(view.getByText(`Added ${localDateTime("2026-10-04T09:00:00.000Z")}`)).toBeTruthy();
    expect(view.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(document.querySelector("img, b")).toBeNull();
  });

  it("edits a Note: Edit opens the Note sheet filled with its text, and Save changes it", async () => {
    const noteCalls: NonNullable<StubData["noteCalls"]> = [];
    renderApp(
      reportData({ notes: { 2: [noteRow({ id: 7, uploadId: 2, text: "Old text" })] }, noteCalls }),
    );
    const section = await notesSection();
    fireEvent.click(await section.findByRole("button", { name: /Old text/ }));
    const view = within(await screen.findByRole("dialog", { name: "Note" }));
    fireEvent.click(view.getByRole("button", { name: "Edit" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Note" }));
    const field = sheet.getByRole("textbox") as HTMLTextAreaElement;
    expect(field.value).toBe("Old text");
    fireEvent.input(field, { target: { value: "New text" } });
    fireEvent.click(sheet.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(section.getByText("New text")).toBeTruthy());
    expect(section.queryByText("Old text")).toBeNull();
    expect(noteCalls.filter((c) => c.method === "PATCH")).toEqual([
      { method: "PATCH", id: 7, text: "New text" },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("deletes a Note after the confirmation sheet", async () => {
    const noteCalls: NonNullable<StubData["noteCalls"]> = [];
    renderApp(
      reportData({ notes: { 2: [noteRow({ id: 7, uploadId: 2, text: "Doomed" })] }, noteCalls }),
    );
    const section = await notesSection();
    fireEvent.click(await section.findByRole("button", { name: /Doomed/ }));
    const view = within(await screen.findByRole("dialog", { name: "Note" }));
    fireEvent.click(view.getByRole("button", { name: "Delete" }));
    const confirm = within(await screen.findByRole("dialog", { name: "Delete this Note?" }));
    expect(noteCalls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(section.queryByText("Doomed")).toBeNull());
    expect(noteCalls.filter((c) => c.method === "DELETE")).toEqual([{ method: "DELETE", id: 7 }]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toasts a failed save and keeps the sheet open with the text", async () => {
    const data = reportData({ notes: {}, fail: {} });
    renderApp(data);
    const section = await notesSection();
    fireEvent.click(await section.findByRole("button", { name: "Add Note" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Note" }));
    fireEvent.input(sheet.getByRole("textbox"), { target: { value: "Keep me" } });
    (data.fail as NonNullable<StubData["fail"]>).notes = "status";
    fireEvent.click(sheet.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("status")).textContent).toBe("Couldn't save the Note.");
    expect((sheet.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep me");
  });

  it("invalidates app state after a change, so the screens that show Note counts reload", async () => {
    const reportDetailLoads: number[] = [];
    renderApp(reportData({ notes: {}, reportDetailLoads }));
    const section = await notesSection();
    await waitFor(() => expect(reportDetailLoads.length).toBe(1));
    fireEvent.click(await section.findByRole("button", { name: "Add Note" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Note" }));
    fireEvent.input(sheet.getByRole("textbox"), { target: { value: "Counted" } });
    fireEvent.click(sheet.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(reportDetailLoads.length).toBe(2));
  });

  it("shows the one load banner when the Notes list fails to load, and clears it once a Retry works", async () => {
    const data = reportData({ notes: {}, fail: { notes: "status" } });
    renderApp(data);
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("Couldn't load.");
    (data.fail as NonNullable<StubData["fail"]>).notes = undefined;
    fireEvent.click(within(banner).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("keeps Save disabled while the text is blank", async () => {
    renderApp(reportData({ notes: {} }));
    const section = await notesSection();
    fireEvent.click(await section.findByRole("button", { name: "Add Note" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Note" }));
    const save = sheet.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.input(sheet.getByRole("textbox"), { target: { value: "   " } });
    expect(save.disabled).toBe(true);
    fireEvent.input(sheet.getByRole("textbox"), { target: { value: "x" } });
    expect(save.disabled).toBe(false);
  });

  it("adds a Note through the Note sheet and reloads the list", async () => {
    const noteCalls: NonNullable<StubData["noteCalls"]> = [];
    renderApp(reportData({ notes: {}, noteCalls }));
    const section = await notesSection();
    await waitFor(() => expect(noteCalls.length).toBe(1));
    fireEvent.click(section.getByRole("button", { name: "Add Note" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Note" }));
    fireEvent.input(sheet.getByRole("textbox"), { target: { value: "Idle was rough" } });
    fireEvent.click(sheet.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(section.getByText("Idle was rough")).toBeTruthy());
    expect(noteCalls.filter((c) => c.method === "POST")).toEqual([
      { method: "POST", uploadId: 2, text: "Idle was rough", pinnedAt: null },
    ]);
    expect(noteCalls.filter((c) => c.method === "GET").length).toBe(2);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
