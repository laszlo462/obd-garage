import { useRef, useState } from "preact/hooks";
import { useLocation, useRoute } from "preact-iso";
import type { ParsedReport } from "../core/report.ts";
import { useAppState } from "./AppState.tsx";
import type { ReportDetail, ReportRow } from "./api-types.ts";
import { ExportSheet } from "./ExportSheet.tsx";
import { reportTitle, shortDate } from "./format.ts";
import { ReportMenuSheet } from "./ReportMenuSheet.tsx";
import { compareReports } from "./report/compare.ts";
import { OverviewTiles } from "./report/OverviewTiles.tsx";
import { ReportSections } from "./report/ReportSections.tsx";
import { useBarMenu } from "./use-bar-menu.ts";
import { useReportLoad, useVehicleReports } from "./use-report-load.ts";

/** The Diagnostic Report viewer: one parsed Report, optionally compared with another of its Vehicle. */
export function ReportViewer() {
  const id = Number(useRoute().params.id);
  const state = useAppState();
  const location = useLocation();
  // Once deleted, the Report must not reload when app state is invalidated: it is gone.
  const gone = useRef(false);
  const load = useReportLoad(id, !gone.current);
  if (load.state === "conflict") return <p class="list-note">{load.message}</p>;
  if (load.state !== "ready") return null;
  const back = () => {
    gone.current = true;
    // Like Back: one step in history when the owner came from another screen, else the Reports tab.
    if (state.previousPath.value !== null) history.back();
    else location.route("/reports");
  };
  return <ReportBody key={id} detail={load.detail} onDeleted={back} />;
}

/** "default" is the newest Report recorded before this one; "none" is No comparison; a number is a Report id. */
type Choice = "default" | "none" | number;

/** The Reports other than this one, newest first, and the newest one recorded before it. */
function compareOptions(detail: ReportDetail, rows: ReportRow[]) {
  const others = rows.filter((r) => r.id !== detail.id);
  const previous = others.find(
    (r) => r.recordedAt !== null && detail.recordedAt !== null && r.recordedAt < detail.recordedAt,
  );
  return { previous, others: others.filter((r) => r !== previous) };
}

function ReportBody(props: { detail: ReportDetail; onDeleted: () => void }) {
  const { detail } = props;
  const state = useAppState();
  const vehicle = state.vehicles.value.find((v) => v.id === detail.vehicleId);
  const [menu, setMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  useBarMenu(() => setMenu(true));
  const rows = useVehicleReports(detail.vehicleId);
  const [choice, setChoice] = useState<Choice>("default");
  const { previous, others } = compareOptions(detail, rows ?? []);
  const otherId = choice === "none" ? null : choice === "default" ? (previous?.id ?? null) : choice;
  const selected = otherId === null ? "none" : choice === "default" ? "default" : String(otherId);
  const other = useReportLoad(otherId ?? 0, otherId !== null);
  const report = detail.report as ParsedReport;
  const compared = otherId !== null && other.state === "ready" ? other.detail : null;
  const comparison = compareReports(report, compared ? (compared.report as ParsedReport) : null);
  return (
    <>
      <div class="report-header">
        <h2 class="report-title">{reportTitle(detail.recordedAt)}</h2>
        <p class="report-meta">{vehicle?.label}</p>
      </div>
      <label class="compare-bar">
        <span>Compared with</span>
        <select
          value={selected}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setChoice(v === "default" || v === "none" ? v : Number(v));
          }}
        >
          {previous && (
            <option value="default">{`Previous · ${shortDate(previous.recordedAt)}`}</option>
          )}
          {others.map((r) => (
            <option key={r.id} value={String(r.id)}>
              {shortDate(r.recordedAt)}
            </option>
          ))}
          <option value="none">No comparison</option>
        </select>
      </label>
      <OverviewTiles report={detail.report as ParsedReport} comparison={comparison} />
      {menu && (
        <ReportMenuSheet
          detail={detail}
          onClose={() => setMenu(false)}
          onDeleted={props.onDeleted}
          onExport={() => {
            setMenu(false);
            setExporting(true);
          }}
        />
      )}
      {exporting && detail.vehicleId !== null && (
        <ExportSheet
          scope={{
            kind: "vehicle",
            vehicleId: detail.vehicleId,
            day: detail.recordedAt?.slice(0, 10),
          }}
          onClose={() => setExporting(false)}
        />
      )}
      <ReportSections
        uploadId={detail.id}
        report={report}
        comparison={comparison}
        comparedDate={compared ? shortDate(compared.recordedAt) : null}
        other={compared ? (compared.report as ParsedReport) : null}
      />
    </>
  );
}
