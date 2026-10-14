import type { ParsedReport } from "../../core/report.ts";
import { vehicleInfoRows } from "./vehicle-info.ts";

/** The Vehicle named in the header, then the Calibration IDs and CVNs, as key and mono value rows. */
export function VehicleInfo(props: { report: ParsedReport }) {
  return (
    <ul class="kv-list">
      {vehicleInfoRows(props.report).map(([key, value], i) => (
        <li key={`${key}#${i}`} class="kv-row">
          <span class="kv-key">{key}</span>
          <span class="kv-value">
            <span class="mono-value">{value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
