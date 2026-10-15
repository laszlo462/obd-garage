// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BatchResultSheet,
  NewVehicleSheet,
  UploadProgressSheet,
  WhichVehicleSheet,
} from "./UploadSheets.tsx";
import type { FileResult, UploadResult } from "./upload-batch.ts";

afterEach(cleanup);

describe("UploadProgressSheet", () => {
  it("shows '3 of 8 · filename' and a progress bar at the same fraction", () => {
    render(<UploadProgressSheet index={3} total={8} name="drive.csv" onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Uploading" })).toBeTruthy();
    expect(screen.getByText("3 of 8 · drive.csv")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "Upload progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("8");
  });

  it("lets the owner hide the sheet", () => {
    const onClose = vi.fn();
    render(<UploadProgressSheet index={1} total={2} name="a" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

const vehicles = [
  { id: 3, label: "2018 Honda Civic" },
  { id: 8, label: "2012 Ford F-250" },
];

describe("WhichVehicleSheet", () => {
  it("names the log count, marks New and Current, and starts on the default", () => {
    render(
      <WhichVehicleSheet
        logCount={3}
        vehicles={vehicles}
        defaultId={8}
        newIds={[8]}
        currentId={3}
        onChoose={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: "3 Drive Logs: which Vehicle?" })).toBeTruthy();
    const ford = screen.getByRole("radio", { name: /2012 Ford F-250/ }) as HTMLInputElement;
    expect(ford.checked).toBe(true);
    expect(screen.getByRole("radio", { name: /2012 Ford F-250.*New/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /2018 Honda Civic.*Current/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Unassigned.*Not one of my vehicles/ })).toBeTruthy();
  });

  it("answers with the picked Vehicle", () => {
    const onChoose = vi.fn();
    render(
      <WhichVehicleSheet
        logCount={1}
        vehicles={vehicles}
        defaultId={3}
        newIds={[]}
        currentId={3}
        onChoose={onChoose}
      />,
    );
    expect(screen.getByRole("dialog", { name: "1 Drive Log: which Vehicle?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /2012 Ford F-250/ }));
    fireEvent.click(screen.getByRole("button", { name: "Upload Drive Logs" }));
    expect(onChoose).toHaveBeenCalledWith(8);
  });

  it("answers unassigned for the Unassigned row, and for Cancel", () => {
    const onChoose = vi.fn();
    render(
      <WhichVehicleSheet
        logCount={2}
        vehicles={vehicles}
        defaultId={3}
        newIds={[]}
        currentId={3}
        onChoose={onChoose}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Unassigned/ }));
    fireEvent.click(screen.getByRole("button", { name: "Upload Drive Logs" }));
    expect(onChoose).toHaveBeenLastCalledWith("unassigned");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChoose).toHaveBeenLastCalledWith("unassigned");
  });
});

const line = (name: string, over: Partial<UploadResult>): FileResult => ({
  name,
  result: { outcome: "added", kind: "drive-log", warnings: [], ...over },
});

describe("BatchResultSheet", () => {
  it("titles an all-added batch '4 files added'", () => {
    const results = ["a", "b", "c"].map((n) => line(n, {}));
    results.push(line("d", { outcome: "warned", warnings: ["Overlap."] }));
    render(<BatchResultSheet results={results} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "4 files added" })).toBeTruthy();
  });

  it("titles a mixed batch '2 added, 3 not'", () => {
    const results = [
      line("a", {}),
      line("b", {}),
      line("c", { outcome: "failed", reason: "x" }),
      line("d", { outcome: "refused", reason: "y" }),
      line("e", { outcome: "refused", reason: "z" }),
    ];
    render(<BatchResultSheet results={results} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "2 added, 3 not" })).toBeTruthy();
  });

  it("renders each outcome with its icon, tone, word and reason", () => {
    const results = [
      line("ok.csv", {}),
      line("warn.csv", { outcome: "warned", warnings: ["Overlaps an earlier log."] }),
      line("bad.csv", { outcome: "failed", reason: "No data rows." }),
      line("dup.html", {
        outcome: "refused",
        kind: "report",
        uploadId: 12,
        reason: "Already uploaded.",
      }),
      line("odd.txt", { outcome: "refused", kind: "unknown", reason: "Not an OBDLink file." }),
    ];
    render(<BatchResultSheet results={results} onClose={() => {}} />);
    const row = (name: string) => screen.getByRole("listitem", { name });
    const expectRow = (name: string, tone: string, word: string, reason?: string) => {
      const li = row(name);
      expect(li.className).toContain(`tone-${tone}`);
      expect(li.querySelector("svg")).toBeTruthy();
      expect(within(li).getByText(word)).toBeTruthy();
      if (reason) expect(within(li).getByText(reason)).toBeTruthy();
      expect(within(li).getByText(name)).toBeTruthy();
    };
    expectRow("ok.csv", "ok", "Added");
    expectRow("warn.csv", "warn", "Added with warning", "Overlaps an earlier log.");
    expectRow("bad.csv", "bad", "Failed", "No data rows.");
    expectRow("dup.html", "muted", "Already added", "Already uploaded.");
    expectRow("odd.txt", "muted", "Refused", "Not an OBDLink file.");
    expect(
      within(row("bad.csv")).getByRole("link", { name: "Failed Uploads" }).getAttribute("href"),
    ).toBe("/failed-uploads");
    expect(within(row("dup.html")).getByRole("link", { name: "Open" }).getAttribute("href")).toBe(
      "/reports/12",
    );
  });

  it("inserts filenames and reasons as text, never markup", () => {
    const results = [
      line("<b>x</b>.csv", { outcome: "failed", reason: "<img src=x onerror=alert(1)>" }),
    ];
    const { container } = render(<BatchResultSheet results={results} onClose={() => {}} />);
    expect(container.ownerDocument.querySelector("img, b")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});

const created: NonNullable<UploadResult["vehicleCreated"]> = {
  id: 8,
  label: "2012 Ford F-250",
  vin: "TEST-VIN-00001234",
  profile: "ford-6.7",
  packs: ["egr", "dpf"],
  sameDayUnassigned: [
    { uploadId: 21, filename: "a.csv", recordedAt: "2026-10-04T17:22:05" },
    { uploadId: 22, filename: "b.csv", recordedAt: null },
  ],
};

describe("NewVehicleSheet", () => {
  it("shows the label, VIN, Profile and Rule Packs, with Change linking to settings", () => {
    render(
      <NewVehicleSheet vehicle={created} catalogue={null} onAssign={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole("dialog", { name: "New vehicle added" })).toBeTruthy();
    expect(screen.getByText("2012 Ford F-250")).toBeTruthy();
    expect(screen.getByText("TEST-VIN-00001234")).toBeTruthy();
    expect(screen.getByText("ford-6.7")).toBeTruthy();
    expect(screen.getByText("egr, dpf")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change" }).getAttribute("href")).toBe(
      "/vehicles/8/settings",
    );
  });

  it("names the Profile and Rule Packs from the catalogue, and shows the id of one it doesn't know", () => {
    const catalogue = {
      profiles: [{ id: "ford-6.7", name: "Ford 6.7" }],
      rulePacks: [{ id: "egr", name: "EGR health", description: "" }],
    };
    render(
      <NewVehicleSheet
        vehicle={created}
        catalogue={catalogue}
        onAssign={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Ford 6.7")).toBeTruthy();
    expect(screen.queryByText("ford-6.7")).toBeNull();
    expect(screen.getByText("EGR health, dpf")).toBeTruthy();
  });

  it("reads None when the Vehicle has no Rule Packs", () => {
    render(
      <NewVehicleSheet
        vehicle={{ ...created, packs: [] }}
        catalogue={null}
        onAssign={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("None")).toBeTruthy();
  });

  it("closes the sheet when Change opens the Vehicle settings", () => {
    const onClose = vi.fn();
    render(
      <NewVehicleSheet vehicle={created} catalogue={null} onAssign={() => {}} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Change" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reports the current ticks, and does not close, when Change is tapped with logs on offer", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <NewVehicleSheet
        vehicle={created}
        catalogue={null}
        onAssign={() => {}}
        onClose={onClose}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /a\.csv/ }));
    fireEvent.click(screen.getByRole("link", { name: "Change" }));
    expect(onChange).toHaveBeenCalledWith([22]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still closes on Change when no Unassigned log shares the day", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <NewVehicleSheet
        vehicle={{ ...created, sameDayUnassigned: [] }}
        catalogue={null}
        onAssign={() => {}}
        onClose={onClose}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Change" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("starts from the given ticks instead of ticking everything", () => {
    render(
      <NewVehicleSheet
        vehicle={created}
        catalogue={null}
        initialTicked={[22]}
        onAssign={() => {}}
        onClose={() => {}}
      />,
    );
    const a = screen.getByRole("checkbox", { name: /a\.csv/ }) as HTMLInputElement;
    const b = screen.getByRole("checkbox", { name: /b\.csv/ }) as HTMLInputElement;
    expect([a.checked, b.checked]).toEqual([false, true]);
  });

  it("ticks every same-day Unassigned log and assigns exactly the ticked ids", () => {
    const onAssign = vi.fn();
    render(
      <NewVehicleSheet vehicle={created} catalogue={null} onAssign={onAssign} onClose={() => {}} />,
    );
    const a = screen.getByRole("checkbox", { name: /a\.csv/ }) as HTMLInputElement;
    const b = screen.getByRole("checkbox", { name: /b\.csv/ }) as HTMLInputElement;
    expect([a.checked, b.checked]).toEqual([true, true]);
    fireEvent.click(a);
    fireEvent.click(screen.getByRole("button", { name: "Assign to this vehicle" }));
    expect(onAssign).toHaveBeenCalledWith([22]);
  });

  it("disables Assign with nothing ticked, and Not now closes without assigning", () => {
    const onAssign = vi.fn();
    const onClose = vi.fn();
    render(
      <NewVehicleSheet vehicle={created} catalogue={null} onAssign={onAssign} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /a\.csv/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /b\.csv/ }));
    expect(
      (screen.getByRole("button", { name: "Assign to this vehicle" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onAssign).not.toHaveBeenCalled();
  });

  it("offers no assignment when no Unassigned log shares the day", () => {
    render(
      <NewVehicleSheet
        vehicle={{ ...created, sameDayUnassigned: [] }}
        catalogue={null}
        onAssign={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Assign to this vehicle" })).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });
});
