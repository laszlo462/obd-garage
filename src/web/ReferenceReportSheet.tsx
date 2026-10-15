import { useEffect, useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import type { DriveLogDetail, ReportRow } from "./api-types.ts";
import { reportTitle } from "./format.ts";
import { Sheet } from "./Sheet.tsx";
import { okJson } from "./use-vehicle-load.ts";

/**
 * The Reference Report picker: radio rows of the Vehicle's Reports (the closest one badged), then None.
 */
export function ReferenceReportSheet(props: {
  logId: number;
  vehicleId: number;
  referenceReport: DriveLogDetail["referenceReport"];
  onClose: () => void;
}) {
  const { referenceReport } = props;
  const api = useApi();
  const state = useAppState();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let stale = false;
    api.api.reports
      .$get({ query: { vehicle: String(props.vehicleId) } })
      .then(okJson)
      .then((rows) => {
        if (!stale) setReports(rows);
      })
      .catch(() => {
        if (!stale) setLoadFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [props.vehicleId]);

  /** Sends the change, closes the sheet, and on success reloads the Drive Log (it re-derives on the server). */
  async function change(request: () => Promise<Response>) {
    const ok = await request()
      .then((res) => res.ok)
      .catch(() => false);
    props.onClose();
    if (!ok) return state.toast("Couldn't change the Reference Report.");
    state.invalidate();
  }
  const param = { id: String(props.logId) };
  const route = api.api["drive-logs"][":id"].reference;
  return (
    <Sheet title="Reference Report" actionLabel="Cancel" onClose={props.onClose}>
      <div class="sheet-body">
        {loadFailed && <p class="sheet-note">Couldn't load the Reports.</p>}
        {reports.map((r) => (
          <label key={r.id} class="radio-row">
            <input
              type="radio"
              name="reference"
              checked={referenceReport.id === r.id}
              onChange={() => change(() => route.$put({ param, json: { reportId: r.id } }))}
            />
            <span class="main">
              <span>{reportTitle(r.recordedAt)}</span>
            </span>
            {r.id === referenceReport.defaultId && <span class="count-badge">Closest</span>}
          </label>
        ))}
        <label class="radio-row">
          <input
            type="radio"
            name="reference"
            checked={referenceReport.id === null}
            onChange={() => change(() => route.$put({ param, json: { reportId: null } }))}
          />
          <span class="main">
            <span>None</span>
          </span>
        </label>
        {referenceReport.state !== "default" && (
          <button
            type="button"
            class="menu-row"
            onClick={() => change(() => route.$delete({ param }))}
          >
            Use the closest
          </button>
        )}
      </div>
    </Sheet>
  );
}
