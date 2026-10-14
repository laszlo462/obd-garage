import { useMemo, useRef, useState } from "preact/hooks";
import { useLocation, useRoute } from "preact-iso";
import { useAppState } from "./AppState.tsx";
import type { DriveLogDetail } from "./api-types.ts";
import { startSecondOfDay } from "./chart/clock.ts";
import { DriveChart } from "./chart/DriveChart.tsx";
import { Overview } from "./chart/Overview.tsx";
import { Readout } from "./chart/Readout.tsx";
import { clampRange, type Range } from "./chart/range.ts";
import { chartPanels } from "./chart/series.ts";
import { seriesColors } from "./chart/series-colors.ts";
import { useSchemeChanges } from "./chart/use-scheme.ts";
import { DriveLogMenuSheet } from "./DriveLogMenuSheet.tsx";
import { count, duration, reportTitle } from "./format.ts";
import { useBarMenu } from "./use-bar-menu.ts";
import { useDriveLogLoad } from "./use-drive-log-load.ts";
import { useIsDesktop } from "./viewport.ts";

/** The Drive Log viewer: header, chart and readout of one Drive Log. */
export function DriveLogViewer() {
  const id = Number(useRoute().params.id);
  const state = useAppState();
  const location = useLocation();
  // Once deleted, the Drive Log must not reload when app state is invalidated: it is gone.
  const gone = useRef(false);
  const load = useDriveLogLoad(id, !gone.current);
  if (load.state === "conflict") return <p class="list-note">{load.message}</p>;
  if (load.state !== "ready") return null;
  const back = () => {
    gone.current = true;
    // Like Back: one step in history when the owner came from another screen, else the Drive Logs tab.
    if (state.previousPath.value !== null) history.back();
    else location.route("/drive-logs");
  };
  return <DriveLogBody key={id} detail={load.detail} onDeleted={back} />;
}

function DriveLogBody(props: { detail: DriveLogDetail; onDeleted: () => void }) {
  const { detail } = props;
  const state = useAppState();
  const [menu, setMenu] = useState(false);
  useBarMenu(() => setMenu(true));
  const vehicle = state.vehicles.value.find((v) => v.id === detail.vehicleId);
  const panels = useMemo(() => chartPanels(detail), [detail]);
  const series = panels.flatMap((p) => p.series);
  const scheme = useSchemeChanges();
  const colors = useMemo(() => seriesColors(series.length), [series.length, scheme]);
  const desktop = useIsDesktop();
  const t = detail.channels.t;
  const [row, setRow] = useState(0);
  // A log of one row has no span; give it a second so the scales and the zoom window have a width.
  const whole = useMemo<Range>(() => {
    const min = t[0] ?? 0;
    return { min, max: Math.max(t.at(-1) ?? 0, min + 1) };
  }, [t]);
  const [range, setRange] = useState<Range>(whole);
  // No narrower than a second, or 1/500 of the drive on a very long one.
  const minSpan = Math.min(whole.max - whole.min, Math.max(1, (whole.max - whole.min) / 500));
  const zoomTo = (next: Range | null) => setRange(next ? clampRange(next, whole, minSpan) : whole);
  const startSec = startSecondOfDay(detail.metadata.startTime);
  return (
    <>
      <div class="report-header">
        <h2 class="report-title">{reportTitle(detail.recordedAt)}</h2>
        <p class="report-meta">
          {[
            vehicle?.label ?? "Unassigned",
            duration(detail.metadata.duration),
            count(detail.channels.t.length, "row"),
          ].join(" · ")}
        </p>
      </div>
      <Readout
        series={series}
        colors={colors}
        row={row}
        elapsed={t[row] ?? 0}
        startSec={startSec}
      />
      <div class="chart-card">
        <Overview
          t={t}
          values={series[0]?.values ?? []}
          scheme={scheme}
          range={range}
          whole={whole}
          onRange={zoomTo}
        />
        <DriveChart
          t={t}
          panels={panels}
          colors={colors}
          scheme={scheme}
          startSec={startSec}
          desktop={desktop}
          range={range}
          cursorRow={row}
          onCursorRow={setRow}
          onRange={zoomTo}
        />
      </div>
      {menu && (
        <DriveLogMenuSheet
          detail={detail}
          onClose={() => setMenu(false)}
          onDeleted={props.onDeleted}
        />
      )}
    </>
  );
}
