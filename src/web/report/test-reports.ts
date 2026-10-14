import type { Dtc, MonitorTest, ParsedReport } from "../../core/report.ts";

/** Synthetic Report data for tests. No real VIN or vehicle. */
export const dtc = (code: string, statuses: string[], over: Partial<Dtc> = {}): Dtc => ({
  ecu: "ECM",
  code,
  type: "",
  description: `${code} description`,
  statuses,
  uds: [],
  ...over,
});

export const monitorTest = (
  name: string,
  state: MonitorTest["state"],
  status = state === "complete" ? "Complete" : state === "incomplete" ? "Incomplete" : "N/A",
): MonitorTest => ({ name, continuous: false, status, state });

export const report = (over: Partial<ParsedReport> = {}): ParsedReport => ({
  header: { vin: "TEST-VIN-00001234", date: "2026-10-02T21:32:14" },
  ...over,
});
