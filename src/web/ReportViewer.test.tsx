// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "./test-render.tsx";
import {
  parsedReport,
  reportDetail,
  reportRow,
  type StubData,
  vehicleRow,
} from "./test-support.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const vehicles = [vehicleRow({ id: 1, label: "2012 Ford F-250" })];

describe("Report viewer: header", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  it("titles the Report with its date and time, with the Vehicle label under it", async () => {
    renderApp({
      vehicles,
      reportDetails: { 2: reportDetail({ id: 2, recordedAt: "2026-10-02T21:32:14" }) },
      reports: { 1: [reportRow({ id: 2 })] },
    });
    const title = await screen.findByRole("heading", { name: "FRI 02 OCT \u00b7 21:32" });
    const meta = await screen.findByText("2012 Ford F-250");
    expect(title.parentElement?.contains(meta)).toBe(true);
    expect(
      within(screen.getByRole("banner")).getByRole("heading", { name: "Report" }),
    ).toBeTruthy();
  });
});

const dtcFor = (statuses: string[]) => [
  {
    ecu: "ECM",
    code: "P0401",
    type: "",
    description: "EGR flow insufficient",
    statuses,
    uds: [],
  },
];

/** Three Reports of Vehicle 1: Oct (id 2, the one on screen), Aug (id 1) and Jul (id 3). */
const trio = () => ({
  vehicles,
  reports: {
    1: [
      reportRow({ id: 2, recordedAt: "2026-10-02T21:32:14" }),
      reportRow({ id: 1, recordedAt: "2026-08-21T21:56:40" }),
      reportRow({ id: 3, recordedAt: "2026-07-04T08:00:00" }),
    ],
  },
  reportDetails: {
    2: reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({ dtcs: dtcFor(["Confirmed", "Pending"]) }),
    }),
    1: reportDetail({
      id: 1,
      recordedAt: "2026-08-21T21:56:40",
      report: parsedReport({ dtcs: dtcFor(["Confirmed"]) }),
    }),
    3: reportDetail({ id: 3, recordedAt: "2026-07-04T08:00:00" }),
  },
});

describe("Report viewer: compare bar", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  it("defaults to the newest earlier Report of the Vehicle and offers the others and No comparison", async () => {
    renderApp(trio());
    const select = (await screen.findByLabelText("Compared with")) as HTMLSelectElement;
    await waitFor(() =>
      expect(select.selectedOptions[0]?.textContent).toBe("Previous \u00b7 21 Aug"),
    );
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Previous \u00b7 21 Aug",
      "4 Jul",
      "No comparison",
    ]);
  });

  it("offers the later Reports and starts on No comparison when the Report is the Vehicle's first", async () => {
    history.replaceState(null, "", "/reports/3");
    renderApp(trio());
    const select = (await screen.findByLabelText("Compared with")) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3));
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "2 Oct",
      "21 Aug",
      "No comparison",
    ]);
    expect(select.selectedOptions[0]?.textContent).toBe("No comparison");
  });
});

describe("Report viewer: overview tiles", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  it("shows MIL, Codes, Monitors and Since clear with a change line against the compared Report", async () => {
    renderApp(trio());
    const tile = async (name: string) => within(await screen.findByRole("group", { name }));
    const mil = await tile("MIL");
    expect(mil.getByText("ON")).toBeTruthy();
    const codes = await tile("Codes");
    expect(codes.getByText("1")).toBeTruthy();
    expect(codes.getByText(/stored/)).toBeTruthy();
    const monitors = await tile("Monitors");
    expect(monitors.getByText("1/2")).toBeTruthy();
    const since = await tile("Since clear");
    expect(since.getByText("6,303.81")).toBeTruthy();
    await waitFor(() => expect(codes.getByText("+1 pending")).toBeTruthy());
    expect(mil.getByText("no change")).toBeTruthy();
    expect(monitors.getByText("no change")).toBeTruthy();
    expect(since.getByText("no change")).toBeTruthy();
  });

  it("drops the change lines on No comparison and fetches the Report picked instead", async () => {
    const reportDetailLoads: number[] = [];
    renderApp({ ...trio(), reportDetailLoads });
    const select = (await screen.findByLabelText("Compared with")) as HTMLSelectElement;
    await screen.findByText("+1 pending");
    fireEvent.change(select, { target: { value: "none" } });
    await waitFor(() => expect(screen.queryByText("+1 pending")).toBeNull());
    expect(screen.queryByText("no change")).toBeNull();
    fireEvent.change(select, { target: { value: "3" } });
    await waitFor(() => expect(reportDetailLoads).toContain(3));
    await waitFor(() => expect(screen.getAllByText("no change").length).toBeGreaterThan(0));
  });
});

const panel = (title: string) =>
  screen.getByText(title, { selector: ".section-title" }).closest("details") as HTMLDetailsElement;

describe("Report viewer: sections", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  it("opens Trouble codes, Readiness monitors, Mode $06 and Notes, and closes the rest", async () => {
    renderApp(trio());
    await screen.findByText("Trouble codes", { selector: ".section-title" });
    for (const title of ["Trouble codes", "Readiness monitors", "Mode $06", "Notes"])
      expect(panel(title).open, title).toBe(true);
    for (const title of ["Freeze frame", "Live data", "IUMPR", "Vehicle info"])
      expect(panel(title).open, title).toBe(false);
  });

  it("badges each section with its count", async () => {
    renderApp(trio());
    await screen.findByText("Trouble codes", { selector: ".section-title" });
    expect(panel("Trouble codes").querySelector(".count")?.textContent).toBe("1");
    expect(panel("Readiness monitors").querySelector(".count")?.textContent).toBe("2");
    expect(panel("Mode $06").querySelector(".count")?.textContent).toBe("2");
    expect(panel("Notes").querySelector(".count")).toBeNull();
  });
});

describe("Report viewer: trouble codes", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  const withCodes = () => {
    const data = trio();
    data.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({
        dtcs: [
          ...dtcFor(["Confirmed", "Pending"]),
          {
            ecu: "TCM",
            code: "P0299",
            type: "",
            description: "Turbo underboost",
            statuses: ["Pending"],
            uds: [],
          },
        ],
      }),
    });
    return data;
  };

  it("lists each code with its description and status badges", async () => {
    renderApp(withCodes());
    const row = (await screen.findByText("P0401")).closest("li") as HTMLElement;
    expect(within(row).getByText("EGR flow insufficient")).toBeTruthy();
    expect(within(row).getByText("Stored")).toBeTruthy();
    expect(within(row).getByText("Pending")).toBeTruthy();
    expect(row.querySelector(".tone-bad")?.textContent).toBe("P0401");
    const pendingOnly = screen.getByText("P0299").closest("li") as HTMLElement;
    expect(pendingOnly.querySelector(".tone-warn")?.textContent).toBe("P0299");
  });

  it("marks a code New, or Also in the compared Report's date, and neither without a comparison", async () => {
    renderApp(withCodes());
    const old = (await screen.findByText("P0401")).closest("li") as HTMLElement;
    await waitFor(() => expect(within(old).getByText("Also in 21 Aug")).toBeTruthy());
    const fresh = screen.getByText("P0299").closest("li") as HTMLElement;
    expect(within(fresh).getByText("New")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Compared with"), { target: { value: "none" } });
    await waitFor(() => expect(screen.queryByText("New")).toBeNull());
    expect(screen.queryByText(/Also in/)).toBeNull();
  });

  /** Aug (the compared Report) also had P1111, which Oct lacks; P0401 gained Pending since. */
  const withGone = (description = "Intake air leak") => {
    const data = withCodes();
    data.reportDetails[1] = reportDetail({
      id: 1,
      recordedAt: "2026-08-21T21:56:40",
      report: parsedReport({
        dtcs: [
          ...dtcFor(["Confirmed"]),
          { ecu: "ECM", code: "P1111", type: "", description, statuses: ["Pending"], uds: [] },
        ],
      }),
    });
    return data;
  };

  it("lists a code the compared Report had and this one lacks as a muted row after the list", async () => {
    renderApp(withGone());
    const gone = (await screen.findByText("P1111")).closest("li") as HTMLElement;
    expect(within(gone).getByText("Gone since 21 Aug")).toBeTruthy();
    expect(within(gone).getByText("Intake air leak")).toBeTruthy();
    expect(gone.className).toContain("dtc-gone");
    const rows = [...panel("Trouble codes").querySelectorAll("li")];
    expect(rows.at(-1)).toBe(gone);
    expect(panel("Trouble codes").querySelector(".count")?.textContent).toBe("2");
  });

  it("shows no gone row with No comparison", async () => {
    renderApp(withGone());
    await screen.findByText("P1111");
    fireEvent.change(screen.getByLabelText("Compared with"), { target: { value: "none" } });
    await waitFor(() => expect(screen.queryByText("P1111")).toBeNull());
    expect(screen.queryByText(/Gone since/)).toBeNull();
  });

  it("keeps the No trouble codes note above the gone rows when this Report has no codes", async () => {
    const data = withGone();
    data.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({ dtcs: [] }),
    });
    renderApp(data);
    expect(await screen.findByText("P1111")).toBeTruthy();
    expect(screen.getByText("No trouble codes in this Report.")).toBeTruthy();
    expect(screen.getByText("P0401").closest("li")?.textContent).toContain("Gone since 21 Aug");
  });

  it("shows a gone code's description as text, never as markup", async () => {
    const markup = "<img src=x onerror=alert(1)>";
    renderApp(withGone(markup));
    await screen.findByText("P1111");
    expect(within(panel("Trouble codes")).getByText(markup)).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("gives a code whose statuses changed one badge listing the changes, and none to an unchanged code", async () => {
    renderApp(withCodes());
    const changed = (await screen.findByText("P0401")).closest("li") as HTMLElement;
    await waitFor(() => expect(within(changed).getByText("+Pending")).toBeTruthy());
    const fresh = screen.getByText("P0299").closest("li") as HTMLElement;
    expect(within(fresh).queryByText(/^[+−]/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Compared with"), { target: { value: "none" } });
    await waitFor(() => expect(screen.queryByText("+Pending")).toBeNull());
  });
});

describe("Report viewer: readiness monitors", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  const monitors = (boost: "complete" | "incomplete") => [
    {
      ecu: "ECM",
      tests: [
        { name: "Catalyst", continuous: false, status: "Complete", state: "complete" as const },
        {
          name: "Boost Pressure",
          continuous: false,
          status: boost === "complete" ? "Complete" : "Incomplete",
          state: boost,
        },
        { name: "Evap System", continuous: false, status: "N/A", state: "na" as const },
      ],
    },
  ];

  it("shows each monitor with a status badge, and what it was when the status changed", async () => {
    const data = trio();
    data.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({ monitors: monitors("incomplete") }),
    });
    data.reportDetails[1] = reportDetail({
      id: 1,
      recordedAt: "2026-08-21T21:56:40",
      report: parsedReport({ monitors: monitors("complete") }),
    });
    renderApp(data);
    const row = (await screen.findByText("Boost Pressure")).closest("li") as HTMLElement;
    expect(within(row).getByText("Incomplete")).toBeTruthy();
    await waitFor(() => expect(within(row).getByText("was Complete")).toBeTruthy());
    const same = screen.getByText("Catalyst").closest("li") as HTMLElement;
    expect(within(same).getByText("Complete")).toBeTruthy();
    expect(within(same).queryByText(/^was/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "1 not supported" }));
    const na = screen.getByText("Evap System").closest("li") as HTMLElement;
    expect(within(na).getByText("Not supported")).toBeTruthy();
  });

  const withNotSupported = () => {
    const data = trio();
    data.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({ monitors: monitors("incomplete") }),
    });
    return data;
  };

  it("counts each ECU's monitors in a line under its heading", async () => {
    renderApp(withNotSupported());
    const ecu = (await screen.findByRole("heading", { name: "ECM" })).closest(
      ".monitor-ecu",
    ) as HTMLElement;
    expect(ecu.querySelector(".monitor-counts")?.textContent).toBe(
      "1 complete · 1 incomplete · 1 not supported",
    );
  });

  it("hides Not supported monitors until the n not supported toggle shows them", async () => {
    renderApp(withNotSupported());
    const toggle = await screen.findByRole("button", { name: "1 not supported" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("Evap System")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Evap System")).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText("Evap System")).toBeNull();
  });

  it("keeps the toggle open state per ECU, and leaves 0 not supported as plain text", async () => {
    const data = trio();
    const t = (name: string, state: "complete" | "na") => ({
      name,
      continuous: false,
      status: state === "na" ? "N/A" : "Complete",
      state,
    });
    data.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({
        monitors: [
          { ecu: "ECM", tests: [t("Catalyst", "complete"), t("Evap System", "na")] },
          { ecu: "TCM", tests: [t("Shift", "complete"), t("Clutch", "na")] },
          { ecu: "ABS", tests: [t("Pump", "complete")] },
        ],
      }),
    });
    renderApp(data);
    const toggles = await screen.findAllByRole("button", { name: "1 not supported" });
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[0] as HTMLElement);
    expect(screen.getByText("Evap System")).toBeTruthy();
    expect(screen.queryByText("Clutch")).toBeNull();
    expect(screen.getByText("0 not supported")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /not supported/ })).toHaveLength(2);
  });

  it("still says what a monitor was when Not supported ones above it are hidden", async () => {
    const data = trio();
    const t = (name: string, state: "complete" | "incomplete" | "na") => ({
      name,
      continuous: false,
      status: state === "na" ? "N/A" : state === "complete" ? "Complete" : "Incomplete",
      state,
    });
    const build = (last: "complete" | "incomplete") => [
      { ecu: "ECM", tests: [t("Reserved", "na"), t("Reserved", last)] },
    ];
    data.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({ monitors: build("incomplete") }),
    });
    data.reportDetails[1] = reportDetail({
      id: 1,
      recordedAt: "2026-08-21T21:56:40",
      report: parsedReport({ monitors: build("complete") }),
    });
    renderApp(data);
    const row = (await screen.findByText("Reserved")).closest("li") as HTMLElement;
    await waitFor(() => expect(within(row).getByText("was Complete")).toBeTruthy());
  });

  it("groups the monitors under their ECU", async () => {
    renderApp(trio());
    expect(await screen.findByRole("heading", { name: "ECM" })).toBeTruthy();
  });
});

describe("Report viewer: Mode $06", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  const test06 = (
    mid: string,
    tid: string,
    midName: string,
    value: number,
    min: number,
    max: number,
  ) => ({
    mid,
    midName,
    tid,
    tidName: "Manufacturer Defined",
    valueText: String(value),
    minText: String(min),
    maxText: String(max),
    value,
    min,
    max,
    units: "sec",
    result: "Pass",
  });
  const rowOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
  const names = () => [...document.querySelectorAll(".m06-name")].map((n) => n.textContent);

  /** $A is roomy (50 %), $B is tight (3 %), $C has a 20 % margin edge. */
  const data = () => {
    const d = trio();
    d.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({
        mode06: [
          test06("$01", "$90", "Roomy test", 50, 0, 100),
          test06("$02", "$91", "Tight test", 97, 0, 100),
          test06("$03", "$92", "Middling test", 80, 0, 100),
        ],
      }),
    });
    d.reportDetails[1] = reportDetail({
      id: 1,
      recordedAt: "2026-08-21T21:56:40",
      report: parsedReport({ mode06: [test06("$02", "$91", "Tight test", 90, 0, 100)] }),
    });
    return d;
  };

  it("lists the least headroom first, with the value, its limits and the headroom coloured by band", async () => {
    renderApp(data());
    await screen.findByText("Tight test");
    expect(names()).toEqual(["Tight test", "Middling test", "Roomy test"]);
    const tight = rowOf("Tight test");
    expect(within(tight).getByText("TID $91 \u00b7 CID $02")).toBeTruthy();
    expect(within(tight).getByText("97")).toBeTruthy();
    expect(within(tight).getByText("sec")).toBeTruthy();
    expect(within(tight).getByText("3 % headroom").className).toContain("tone-bad");
    expect(within(rowOf("Middling test")).getByText("20 % headroom").className).toContain(
      "tone-ok",
    );
    expect(within(rowOf("Roomy test")).getByText("50 % headroom").className).toContain("tone-ok");
    expect(within(tight).getByRole("img").getAttribute("aria-label")).toBe(
      "97 sec, limits 0 to 100",
    );
    expect(within(tight).getByText("min 0")).toBeTruthy();
    expect(within(tight).getByText("max 100")).toBeTruthy();
  });

  it("switches to report order", async () => {
    renderApp(data());
    await screen.findByText("Tight test");
    expect(
      (screen.getByRole("radio", { name: "Least headroom" }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Report order" }));
    expect(names()).toEqual(["Roomy test", "Tight test", "Middling test"]);
  });

  it("shows what the compared Report had, only for tests both list", async () => {
    renderApp(data());
    await waitFor(() => expect(within(rowOf("Tight test")).getByText("was 90")).toBeTruthy());
    expect(within(rowOf("Roomy test")).queryByText(/^was/)).toBeNull();
  });

  /** Oct's Tight test is 0 to 100; Aug's was `min` to `max`. Roomy test (Oct only) has no Aug twin. */
  const withAugLimits = (min: number, max: number) => {
    const d = data();
    d.reportDetails[1] = reportDetail({
      id: 1,
      recordedAt: "2026-08-21T21:56:40",
      report: parsedReport({ mode06: [test06("$02", "$91", "Tight test", 90, min, max)] }),
    });
    return d;
  };

  it("shows the compared Report's limits beside 'was' where a limit changed", async () => {
    renderApp(withAugLimits(0, 80));
    await screen.findByText("Tight test");
    const tight = rowOf("Tight test");
    await waitFor(() => expect(within(tight).getByText("limits were 0 – 80")).toBeTruthy());
    expect(within(tight).getByText("was 90")).toBeTruthy();
    expect(within(rowOf("Roomy test")).queryByText(/limits were/)).toBeNull();
  });

  it("shows 'none', not a number, for a limit the compared Report left open", async () => {
    renderApp(withAugLimits(0, 65535));
    await screen.findByText("Tight test");
    await waitFor(() =>
      expect(within(rowOf("Tight test")).getByText("limits were 0 – none")).toBeTruthy(),
    );
  });

  it("shows no 'limits were' where the limits match, or with No comparison", async () => {
    renderApp(withAugLimits(0, 100));
    await waitFor(() => expect(within(rowOf("Tight test")).getByText("was 90")).toBeTruthy());
    expect(screen.queryByText(/limits were/)).toBeNull();
    cleanup();
    renderApp(withAugLimits(0, 80));
    const select = (await screen.findByLabelText("Compared with")) as HTMLSelectElement;
    await waitFor(() => expect(screen.getByText(/limits were/)).toBeTruthy());
    fireEvent.change(select, { target: { value: "none" } });
    await waitFor(() => expect(screen.queryByText(/limits were/)).toBeNull());
  });

  const OPERATING_POINT =
    "Limits move with operating point. Compare values only where the limits match.";

  it("says limits move with operating point above the list when comparing, in either order", async () => {
    renderApp(data());
    const line = await screen.findByText(OPERATING_POINT);
    const list = document.querySelector(".m06-list") as HTMLElement;
    expect(line.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Report order" }));
    expect(screen.getByText(OPERATING_POINT)).toBeTruthy();
  });

  it("has no operating-point line with No comparison", async () => {
    renderApp(data());
    await screen.findByText(OPERATING_POINT);
    fireEvent.change(await screen.findByLabelText("Compared with"), { target: { value: "none" } });
    await waitFor(() => expect(screen.queryByText(OPERATING_POINT)).toBeNull());
  });

  it("shows 'none' for a limit the Report leaves open", async () => {
    const d = data();
    d.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({ mode06: [test06("$01", "$90", "One sided", 5, 3, 65535)] }),
    });
    renderApp(d);
    const row = (await screen.findByText("One sided")).closest("li") as HTMLElement;
    expect(within(row).getByText("max none")).toBeTruthy();
    expect(within(row).getByText("2 sec to min")).toBeTruthy();
  });

  it("puts misfire counts in one table, a row per TID and a column per cylinder", async () => {
    const d = data();
    const misfire = (cyl: number, tid: string, value: number) => ({
      ...test06(
        `$${(0xa1 + cyl).toString(16).toUpperCase()}`,
        tid,
        `Misfire Cylinder ${cyl} Data`,
        value,
        0,
        100,
      ),
      tidName: "Misfire counts for last 10 driving cycles",
    });
    d.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({
        mode06: [
          test06("$01", "$90", "Roomy test", 50, 0, 100),
          misfire(1, "$0B", 0),
          misfire(2, "$0B", 4),
        ],
      }),
    });
    renderApp(d);
    const table = (await screen.findByRole("table", { name: "Misfire counts" })) as HTMLElement;
    expect(within(table).getByText("Cyl 1")).toBeTruthy();
    expect(within(table).getByText("Cyl 2")).toBeTruthy();
    expect(within(table).getByText("4")).toBeTruthy();
    expect(names()).toEqual(["Roomy test"]);
  });
});

const pidRow = (description: string, value: string, units = "", pid = "SAE 0x00") => ({
  pid,
  description,
  value,
  number: Number.isFinite(Number(value)) ? Number(value) : null,
  units,
});

describe("Report viewer: live data and freeze frame", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  const live = [
    pidRow("Engine RPM", "800", "RPM"),
    pidRow("Commanded EGR A duty cycle", "20", "%"),
    pidRow("Actual EGR A duty cycle", "35", "%"),
    pidRow("Supported PIDs 01-20", "BE1FA813"),
  ];
  const withLive = () => {
    const d = trio();
    d.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({
        liveData: live,
        freezeFrames: [
          {
            title: "P0401 - First Occurrence",
            dtc: "P0401",
            rows: [pidRow("Vehicle speed", "62", "mph", "")],
          },
        ],
      }),
    });
    return d;
  };

  it("groups live data under headings with a two-column row each, and hides support rows", async () => {
    renderApp(withLive());
    await screen.findByText("Engine RPM");
    const group = within(panel("Live data"))
      .getByRole("heading", { name: "Engine & driver" })
      .closest("div") as HTMLElement;
    const row = within(group).getByText("Engine RPM").closest("li") as HTMLElement;
    expect(within(row).getByText("800")).toBeTruthy();
    expect(within(row).getByText("RPM")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "EGR" })).toBeTruthy();
    expect(screen.queryByText("Supported PIDs 01-20")).toBeNull();
    expect(panel("Live data").querySelector(".count")?.textContent).toBe("4");
  });

  it("charts a commanded and actual pair with the gap between them", async () => {
    renderApp(withLive());
    const card = (await screen.findByText("EGR A")).closest("div")?.parentElement as HTMLElement;
    expect(within(card).getByText("20 \u2192 35 %")).toBeTruthy();
    expect(within(card).getByText("actual \u2212 commanded: +15 %")).toBeTruthy();
  });

  it("lists each freeze frame under its title", async () => {
    renderApp(withLive());
    const title = await screen.findByRole("heading", { name: "P0401 - First Occurrence" });
    const frame = title.closest("div") as HTMLElement;
    const row = within(frame).getByText("Vehicle speed").closest("li") as HTMLElement;
    expect(within(row).getByText("62")).toBeTruthy();
    expect(within(row).getByText("mph")).toBeTruthy();
  });

  /** Aug (the compared Report) read a different RPM and speed; its timer 1 was 0, timer 2 was 7. */
  const withAug = () => {
    const d = withLive();
    d.reportDetails[1] = reportDetail({
      id: 1,
      recordedAt: "2026-08-21T21:56:40",
      report: parsedReport({
        liveData: [
          pidRow("Engine RPM", "750", "RPM"),
          pidRow("Commanded EGR A duty cycle", "20", "%"),
        ],
        freezeFrames: [
          {
            title: "P0401 - First Occurrence",
            dtc: "P0401",
            rows: [pidRow("Vehicle speed", "40", "mph", "")],
          },
        ],
      }),
    });
    return d;
  };

  it("shows was on changed live data and freeze frame values, only where they changed", async () => {
    renderApp(withAug());
    const rpm = (await screen.findByText("Engine RPM")).closest("li") as HTMLElement;
    await waitFor(() => expect(within(rpm).getByText("was 750")).toBeTruthy());
    const egr = screen.getByText("Commanded EGR A duty cycle").closest("li") as HTMLElement;
    expect(within(egr).queryByText(/^was/)).toBeNull();
    const speed = screen.getByText("Vehicle speed").closest("li") as HTMLElement;
    expect(within(speed).getByText("was 40")).toBeTruthy();
  });

  it("shows no was with No comparison", async () => {
    renderApp(withAug());
    await waitFor(() => expect(screen.getByText("was 750")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Compared with"), { target: { value: "none" } });
    await waitFor(() => expect(screen.queryByText(/^was /)).toBeNull());
  });

  const filterBox = () => screen.getByRole("searchbox", { name: "Filter PIDs…" });
  const typeFilter = (v: string) => fireEvent.input(filterBox(), { target: { value: v } });

  it("filters live data rows by name and hides a group left empty", async () => {
    renderApp(withLive());
    await screen.findByText("Engine RPM");
    typeFilter("rpm");
    expect(screen.getByText("Engine RPM")).toBeTruthy();
    expect(screen.queryByText("Commanded EGR A duty cycle")).toBeNull();
    expect(screen.queryByRole("heading", { name: "EGR" })).toBeNull();
    expect(screen.queryByText("EGR A")).toBeNull();
    typeFilter("");
    expect(screen.getByRole("heading", { name: "EGR" })).toBeTruthy();
    expect(screen.getByText("EGR A")).toBeTruthy();
  });

  it("says No PIDs match when the filter finds nothing, and has no filter on freeze frames", async () => {
    renderApp(withLive());
    await screen.findByText("Engine RPM");
    typeFilter("zzz");
    expect(screen.getByText("No PIDs match.")).toBeTruthy();
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
  });

  const timer = (n: number, v: string) =>
    pidRow(`Total run time with EI-AECD #${n} Timer 1 active`, v, "s");
  const withTimers = () => {
    const d = withLive();
    d.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({
        liveData: [
          pidRow("Engine RPM", "800", "RPM"),
          timer(1, "0"),
          timer(2, "0"),
          timer(3, "12"),
        ],
      }),
    });
    d.reportDetails[1] = reportDetail({
      id: 1,
      recordedAt: "2026-08-21T21:56:40",
      report: parsedReport({ liveData: [timer(1, "0"), timer(2, "7")] }),
    });
    return d;
  };

  it("hides EI-AECD timers at 0 in both Reports with a count, and shows a timer above 0 in either", async () => {
    renderApp(withTimers());
    expect(await screen.findByText("1 EI-AECD timers at 0 not shown.")).toBeTruthy();
    expect(screen.queryByText("Total run time with EI-AECD #1 Timer 1 active")).toBeNull();
    expect(screen.getByText("Total run time with EI-AECD #2 Timer 1 active")).toBeTruthy();
    expect(screen.getByText("Total run time with EI-AECD #3 Timer 1 active")).toBeTruthy();
  });

  it("has no timer count line when no timer is hidden", async () => {
    renderApp(withLive());
    await screen.findByText("Engine RPM");
    expect(screen.queryByText(/EI-AECD timers at 0/)).toBeNull();
  });
});

describe("Report viewer: IUMPR and vehicle info", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  const counter = (description: string, value: string) => ({
    ecu: "ECM",
    counter: "0x00",
    description,
    value,
  });
  const withBoth = () => {
    const d = trio();
    d.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({
        header: {
          vin: "TEST-VIN-00001234",
          date: "2026-10-02T21:32:14",
          year: 2012,
          make: "Ford",
          model: "F-250",
        },
        iumpr: [
          counter("Ignition Cycle Counter", "7492"),
          counter("NMHC Catalyst Monitor Completion Condition Counts", "415"),
          counter("NMHC Catalyst Monitor Conditions Encountered Counts", "500"),
          counter("EGR Monitor Completion Condition Counts", "5"),
          counter("EGR Monitor Conditions Encountered Counts", "100"),
        ],
        vehicleInfo: [{ description: "Calibration ID", value: "ABC123" }],
      }),
    });
    return d;
  };

  it("labels the columns Monitor, Completed, Conditions met and Ratio, and puts each value under its label", async () => {
    renderApp(withBoth());
    const table = within(await screen.findByRole("table", { name: "ECM in-use performance" }));
    const headers = table.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers.slice(0, 4)).toEqual(["Monitor", "Completed", "Conditions met", "Ratio"]);
    const row = table.getByText("NMHC Catalyst").closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell");
    expect(cells[headers.indexOf("Monitor")]?.textContent).toBe("NMHC Catalyst");
    expect(cells[headers.indexOf("Completed")]?.textContent).toBe("415");
    expect(cells[headers.indexOf("Conditions met")]?.textContent).toBe("500");
    expect(cells[headers.indexOf("Ratio")]?.textContent).toContain("0.83");
  });

  it("shows each monitor's completions, conditions met and ratio, flagging a low ratio", async () => {
    renderApp(withBoth());
    const catalyst = (await screen.findByText("NMHC Catalyst")).closest("tr") as HTMLElement;
    expect(within(catalyst).getByText("415")).toBeTruthy();
    expect(within(catalyst).getByText("500")).toBeTruthy();
    expect(within(catalyst).getByText("0.83")).toBeTruthy();
    const egr = screen.getByText("EGR").closest("tr") as HTMLElement;
    expect(within(egr).getByText("0.05").className).toContain("tone-bad");
    expect(screen.getByText("Ignition cycles 7,492")).toBeTruthy();
    expect(panel("IUMPR").querySelector(".count")?.textContent).toBe("5");
  });

  it("shows the counts added since the compared Report", async () => {
    const d = withBoth();
    d.reportDetails[1] = reportDetail({
      id: 1,
      recordedAt: "2026-08-21T21:56:40",
      report: parsedReport({
        iumpr: [
          counter("Ignition Cycle Counter", "7000"),
          counter("NMHC Catalyst Monitor Completion Condition Counts", "400"),
          counter("NMHC Catalyst Monitor Conditions Encountered Counts", "480"),
        ],
      }),
    });
    renderApp(d);
    const since = await screen.findByText(
      (_, el) => el?.textContent === "+15 / +20 since 21 Aug" && el.children.length === 2,
    );
    // Two unbreakable parts, so a narrow column wraps between them and nowhere else.
    expect([...since.children].map((c) => c.textContent)).toEqual(["+15 / +20", "since 21 Aug"]);
    expect([...since.children].every((c) => c.classList.contains("nowrap"))).toBe(true);
    expect(screen.getByText("Ignition cycles 7,492 (+492)")).toBeTruthy();
  });

  it("badges Vehicle info with the number of rows it shows", async () => {
    renderApp(withBoth());
    await screen.findByText("Calibration ID");
    const shown = panel("Vehicle info").querySelectorAll("li").length;
    expect(shown).toBe(5);
    expect(panel("Vehicle info").querySelector(".count")?.textContent).toBe(String(shown));
  });

  it("lists the vehicle and its calibration IDs as key and value rows", async () => {
    renderApp(withBoth());
    const info = await screen.findByText("Calibration ID");
    expect(within(info.closest("li") as HTMLElement).getByText("ABC123")).toBeTruthy();
    const make = within(panel("Vehicle info")).getByText("Make").closest("li") as HTMLElement;
    expect(within(make).getByText("Ford")).toBeTruthy();
  });
});

describe("Report viewer: report text is untrusted", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  it("shows markup in a code description and a live-data value as text, never as elements", async () => {
    const markup = "<img src=x onerror=alert(1)>";
    const d = trio();
    d.reportDetails[2] = reportDetail({
      id: 2,
      recordedAt: "2026-10-02T21:32:14",
      report: parsedReport({
        dtcs: [
          {
            ecu: "ECM",
            code: "P0401",
            type: "",
            description: markup,
            statuses: ["Confirmed"],
            uds: [],
          },
        ],
        liveData: [pidRow("Engine RPM", markup, "RPM")],
      }),
    });
    renderApp(d);
    const inCodes = await screen.findAllByText(markup);
    expect(inCodes).toHaveLength(2);
    expect(within(panel("Trouble codes")).getByText(markup)).toBeTruthy();
    expect(within(panel("Live data")).getByText(markup)).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("Report viewer: failed loads", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  it("shows the error inline for a Failed Upload (409)", async () => {
    renderApp({ ...trio(), reportConflicts: { 2: "Not an OBDLink report." } });
    expect(await screen.findByText("Not an OBDLink report.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["status", "throw"] as const)(
    "shows the shell banner when the Report fails to load (%s), and Retry loads it",
    async (mode) => {
      const fail: StubData["fail"] = { reportDetail: mode };
      renderApp({ ...trio(), fail });
      await screen.findByRole("alert");
      expect(screen.queryByText("Trouble codes", { selector: ".section-title" })).toBeNull();
      delete fail.reportDetail;
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await screen.findByText("Trouble codes", { selector: ".section-title" });
      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    },
  );

  it("shows the banner for an unknown Report (404)", async () => {
    history.replaceState(null, "", "/reports/99");
    renderApp(trio());
    await screen.findByRole("alert");
  });
});

describe("Report viewer: the More button", () => {
  it("shows in the app bar only while the viewer is on screen", async () => {
    history.replaceState(null, "", "/reports");
    renderApp(trio());
    await screen.findByRole("link", { name: /Oct/ });
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: /Oct/ }));
    await screen.findByRole("button", { name: "More" });
    fireEvent.click(screen.getByRole("link", { name: "Reports" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "More" })).toBeNull());
  });
});

describe("Report viewer: the … sheet", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  const openSheet = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    return screen.findByRole("dialog", { name: "Report" });
  };

  it("offers Download original as a download link to the stored file, and Delete…", async () => {
    renderApp(trio());
    const sheet = await openSheet();
    const link = within(sheet).getByRole("link", { name: "Download original" });
    expect(link.getAttribute("href")).toBe("/api/uploads/2/original");
    expect(link.hasAttribute("download")).toBe(true);
    expect(within(sheet).getByRole("button", { name: "Delete\u2026" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks before deleting, then deletes the upload and goes back in history", async () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    const deletedUploads: number[] = [];
    history.replaceState(null, "", "/reports");
    renderApp({ ...trio(), deletedUploads });
    fireEvent.click(await screen.findByRole("link", { name: /Oct/ }));
    fireEvent.click(within(await openSheet()).getByRole("button", { name: "Delete\u2026" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this Report?" });
    expect(deletedUploads).toEqual([]);
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deletedUploads).toEqual([2]));
    await waitFor(() => expect(back).toHaveBeenCalledOnce());
  });

  it("goes to the Reports tab after a delete when the app opened on this Report", async () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    renderApp(trio());
    fireEvent.click(within(await openSheet()).getByRole("button", { name: "Delete\u2026" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this Report?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(location.pathname).toBe("/reports"));
    expect(back).not.toHaveBeenCalled();
  });

  it("toasts and stays when the delete fails", async () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    renderApp({ ...trio(), fail: { deleteUpload: "status" } });
    fireEvent.click(within(await openSheet()).getByRole("button", { name: "Delete\u2026" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this Report?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Couldn't delete the Report.")).toBeTruthy();
    expect(location.pathname).toBe("/reports/2");
    expect(back).not.toHaveBeenCalled();
  });
});

describe("Report viewer: width", () => {
  it("puts the viewer container class on the page, and not on the lists", async () => {
    history.replaceState(null, "", "/reports");
    renderApp(trio());
    await screen.findByRole("link", { name: /Oct/ });
    expect(document.querySelector("main")?.classList.contains("viewer")).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: /Oct/ }));
    await screen.findByLabelText("Compared with");
    expect(document.querySelector("main")?.classList.contains("viewer")).toBe(true);
  });
});

describe("Report viewer: compare list fails", () => {
  beforeEach(() => history.replaceState(null, "", "/reports/2"));

  it("shows the load banner when the Vehicle's Report list fails to load", async () => {
    renderApp({ ...trio(), fail: { reports: "status" } });
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
