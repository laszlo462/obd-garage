import type { ParsedReport } from "../../core/report.ts";

/**
 * The Vehicle info rows as [key, value]: the Vehicle named in the header, then the Calibration IDs and CVNs.
 * The VIN entry of the table is dropped (the header has it) and so is any row with no value.
 * The list and its count badge both use this, so they cannot disagree.
 */
export function vehicleInfoRows(report: ParsedReport): [string, string][] {
  const { header, vehicleInfo } = report;
  const rows: [string, string][] = [
    ["Year", header.year === undefined ? "" : String(header.year)],
    ["Make", header.make ?? ""],
    ["Model", header.model ?? ""],
    ["Option", header.option ?? ""],
    ["VIN", header.vin],
    ...(vehicleInfo ?? [])
      .filter((r) => !/^Vehicle Identification/i.test(r.description))
      .map((r): [string, string] => [
        r.description.replace(/Calibration Verification Number/i, "CVN"),
        r.value,
      ]),
  ];
  return rows.filter(([, value]) => value !== "");
}
