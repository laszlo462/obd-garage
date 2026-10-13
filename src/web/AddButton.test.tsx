// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppState } from "./AppState.tsx";
import { AddButton } from "./TabBar.tsx";
import { pickFiles, renderWithApp } from "./test-render.tsx";
import { vehicleRow } from "./test-support.ts";
import type { UploadResult } from "./upload-batch.ts";

afterEach(cleanup);

describe("AddButton", () => {
  it("opens the file picker from a multiple-file input, and does not navigate", () => {
    renderWithApp(<AddButton label="Add" />);
    const input = screen.getByLabelText("Choose files") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(true);
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(click).toHaveBeenCalledOnce();
  });
});

const html = (name: string) => new File(["<html><body>"], name);
const csv = (name: string) => new File(["Time,RPM\n0,800\n"], name);

describe("AddButton: a batch", () => {
  it("with no Vehicles uploads Reports before logs, skips the question and shows the result", async () => {
    const uploadCalls: unknown[] = [];
    renderWithApp(<AddButton label="Add" />, { uploadCalls });
    pickFiles(csv("log.csv"), html("report.html"));
    await screen.findByRole("dialog", { name: "2 files added" });
    expect(uploadCalls.map((c) => (c as { query: { filename: string } }).query)).toEqual([
      { filename: "report.html", vehicle: "unassigned" },
      { filename: "log.csv", vehicle: "unassigned" },
    ]);
    expect(screen.queryByRole("dialog", { name: /which Vehicle/ })).toBeNull();
  });
});

describe("AddButton: the Vehicle question", () => {
  it("asks once, starts on the Current Vehicle and sends every log there", async () => {
    const uploadCalls: unknown[] = [];
    const vehicles = [
      vehicleRow({ id: 1, label: "2018 Honda Civic" }),
      vehicleRow({ id: 2, label: "2012 Ford F-250" }),
    ];
    renderWithApp(<AddButton label="Add" />, { uploadCalls, vehicles });
    pickFiles(csv("a.csv"), csv("b.csv"));
    await screen.findByRole("dialog", { name: "2 Drive Logs: which Vehicle?" });
    expect(
      (screen.getByRole("radio", { name: /2018 Honda Civic/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(uploadCalls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Upload Drive Logs" }));
    await screen.findByRole("dialog", { name: "2 files added" });
    expect(uploadCalls.map((c) => (c as { query: unknown }).query)).toEqual([
      { filename: "a.csv", vehicle: "1" },
      { filename: "b.csv", vehicle: "1" },
    ]);
    expect(screen.queryByRole("dialog", { name: /which Vehicle/ })).toBeNull();
  });
});

describe("AddButton: progress", () => {
  it("shows the progress sheet while a file uploads", async () => {
    let release = () => {};
    const uploadGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderWithApp(<AddButton label="Add" />, { uploadGates: { "a.csv": uploadGate } });
    pickFiles(csv("a.csv"));
    await screen.findByRole("dialog", { name: "Uploading" });
    expect(screen.getByText("1 of 1 · a.csv")).toBeTruthy();
    release();
    await screen.findByRole("dialog", { name: "1 file added" });
    expect(screen.queryByRole("dialog", { name: "Uploading" })).toBeNull();
  });

  it("keeps the progress sheet hidden once hidden, through the rest of the batch", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let releaseSecond = () => {};
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    renderWithApp(<AddButton label="Add" />, {
      uploadGates: { "a.csv": gate, "b.csv": secondGate },
    });
    pickFiles(csv("a.csv"), csv("b.csv"));
    await screen.findByText("1 of 2 · a.csv");
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("dialog", { name: "Uploading" })).toBeNull();
    release();
    await new Promise((r) => setTimeout(r, 20));
    // The second file is now uploading; its progress update must not reopen the sheet.
    expect(screen.queryByRole("dialog", { name: "Uploading" })).toBeNull();
    releaseSecond();
    await screen.findByRole("dialog", { name: "2 files added" });
  });
});

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
    sameDayUnassigned: [
      { uploadId: 11, filename: "same-a.csv", recordedAt: "2026-10-04T17:22:05" },
      { uploadId: 12, filename: "same-b.csv", recordedAt: "2026-10-04T18:00:00" },
    ],
  },
};

describe("AddButton: a new Vehicle", () => {
  it("shows the New vehicle sheet after the result, and assigns only the ticked logs", async () => {
    const assignCalls: unknown[] = [];
    renderWithApp(<AddButton label="Add" />, {
      assignCalls,
      uploadResults: { "r.html": newVinReport },
    });
    pickFiles(html("r.html"));
    await screen.findByRole("dialog", { name: "1 file added" });
    expect(screen.queryByRole("dialog", { name: "New vehicle added" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByRole("dialog", { name: "New vehicle added" });
    fireEvent.click(screen.getByRole("checkbox", { name: /same-b\.csv/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assign to this vehicle" }));
    await waitFor(() => expect(assignCalls).toEqual([{ logIds: [11], vehicleId: 5 }]));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "New vehicle added" })).toBeNull(),
    );
  });

  it("does not assign when the owner picks Not now", async () => {
    const assignCalls: unknown[] = [];
    renderWithApp(<AddButton label="Add" />, {
      assignCalls,
      uploadResults: { "r.html": newVinReport },
    });
    pickFiles(html("r.html"));
    await screen.findByRole("dialog", { name: "1 file added" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByRole("dialog", { name: "New vehicle added" });
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "New vehicle added" })).toBeNull(),
    );
    expect(assignCalls).toEqual([]);
  });
});

describe("AddButton: a failing file", () => {
  it("does not stop the batch and is listed as failed", async () => {
    const uploadCalls: unknown[] = [];
    renderWithApp(<AddButton label="Add" />, {
      uploadCalls,
      uploadResults: {
        "bad.csv": { outcome: "failed", kind: "drive-log", warnings: [], reason: "No data rows." },
      },
    });
    pickFiles(csv("bad.csv"), csv("good.csv"));
    await screen.findByRole("dialog", { name: "1 added, 1 not" });
    expect(uploadCalls).toHaveLength(2);
    const bad = screen.getByRole("listitem", { name: "bad.csv" });
    expect(within(bad).getByText("Failed")).toBeTruthy();
    expect(within(bad).getByText("No data rows.")).toBeTruthy();
    expect(within(bad).getByRole("link", { name: "Failed Uploads" }).getAttribute("href")).toBe(
      "/failed-uploads",
    );
  });

  it("lists a file as Not uploaded, with the reason and no link, when the request errors", async () => {
    renderWithApp(<AddButton label="Add" />, { uploadError: { status: 500, error: "Disk full." } });
    pickFiles(csv("a.csv"), csv("b.csv"));
    await screen.findByRole("dialog", { name: "0 added, 2 not" });
    expect(screen.getAllByText("Disk full.")).toHaveLength(2);
    const first = screen.getByRole("listitem", { name: "a.csv" });
    expect(within(first).getByText("Not uploaded")).toBeTruthy();
    expect(within(first).queryByRole("link")).toBeNull();
  });
});

/** Shows the app-state revision and whether the first load finished. */
function Probe() {
  const state = useAppState();
  return (
    <p>
      {state.loaded.value ? "loaded" : "loading"} revision {state.revision.value}
    </p>
  );
}

describe("AddButton: refresh", () => {
  it("invalidates and refreshes at the end of a batch", async () => {
    const vehicleLoads: unknown[] = [];
    renderWithApp(
      <>
        <Probe />
        <AddButton label="Add" />
      </>,
      { vehicleLoads },
    );
    await screen.findByText("loaded revision 0");
    const before = vehicleLoads.length;
    pickFiles(csv("a.csv"));
    await screen.findByText("loaded revision 1");
    await waitFor(() => expect(vehicleLoads.length).toBeGreaterThan(before));
  });

  it("invalidates and refreshes again after an assign", async () => {
    const vehicleLoads: unknown[] = [];
    renderWithApp(
      <>
        <Probe />
        <AddButton label="Add" />
      </>,
      { vehicleLoads, uploadResults: { "r.html": newVinReport } },
    );
    await screen.findByText("loaded revision 0");
    pickFiles(html("r.html"));
    await screen.findByRole("dialog", { name: "1 file added" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByRole("dialog", { name: "New vehicle added" });
    const before = vehicleLoads.length;
    fireEvent.click(screen.getByRole("button", { name: "Assign to this vehicle" }));
    await screen.findByText("loaded revision 2");
    await waitFor(() => expect(vehicleLoads.length).toBeGreaterThan(before));
  });
});

describe("AddButton: the input", () => {
  it("resets its value after a pick, so the same file can be picked again", async () => {
    renderWithApp(<AddButton label="Add" />);
    const input = screen.getByLabelText("Choose files") as HTMLInputElement;
    // A real picker leaves the chosen path in `value`; a plain property stands in for it.
    Object.defineProperty(input, "value", { value: "C:\fakepatha.csv", writable: true });
    pickFiles(csv("a.csv"));
    expect(input.value).toBe("");
    await screen.findByRole("dialog", { name: "1 file added" });
  });

  it("offers a Vehicle created earlier in the batch, as the default, in the question", async () => {
    renderWithApp(<AddButton label="Add" />, {
      vehicles: [vehicleRow({ id: 1, label: "2018 Honda Civic" })],
      uploadResults: { "r.html": newVinReport },
    });
    pickFiles(csv("l.csv"), html("r.html"));
    await screen.findByRole("dialog", { name: "1 Drive Log: which Vehicle?" });
    const ford = screen.getByRole("radio", { name: /2012 Ford F-250.*New/ }) as HTMLInputElement;
    expect(ford.checked).toBe(true);
  });
});
