import { useMemo, useRef, useState } from "preact/hooks";
import { useLocation, useRoute } from "preact-iso";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import type { DriveLogDetail } from "./api-types.ts";
import { AllChannelsSheet } from "./chart/AllChannelsSheet.tsx";
import { ChannelChips } from "./chart/ChannelChips.tsx";
import { startSecondOfDay } from "./chart/clock.ts";
import { DataTable } from "./chart/DataTable.tsx";
import { DriveChart } from "./chart/DriveChart.tsx";
import { Notices } from "./chart/Notices.tsx";
import { nearestRow } from "./chart/nearest-row.ts";
import { Overview } from "./chart/Overview.tsx";
import { Readout } from "./chart/Readout.tsx";
import { clampRange, type Range } from "./chart/range.ts";
import { channelOrder, pickerPanels, presetKeys } from "./chart/series.ts";
import { seriesColors } from "./chart/series-colors.ts";
import { useSchemeChanges } from "./chart/use-scheme.ts";
import { DriveLogMenuSheet } from "./DriveLogMenuSheet.tsx";
import { EventsPanel } from "./events/EventsPanel.tsx";
import { inPackSpan } from "./events/in-pack-span.ts";
import { Legend } from "./events/Legend.tsx";
import { outcomeLines } from "./events/outcome-lines.ts";
import { count, duration, reportTitle } from "./format.ts";
import { useBarMenu } from "./use-bar-menu.ts";
import { useDetailLoad } from "./use-detail-load.ts";
import { useIsDesktop } from "./viewport.ts";

/** The Drive Log viewer: header, chart and readout of one Drive Log. */
export function DriveLogViewer() {
  const id = Number(useRoute().params.id);
  const state = useAppState();
  const location = useLocation();
  // Once deleted, the Drive Log must not reload when app state is invalidated: it is gone.
  const gone = useRef(false);
  const api = useApi();
  const load = useDetailLoad<DriveLogDetail>(
    id,
    !gone.current,
    (logId) => api.api["drive-logs"][":id"].$get({ param: { id: String(logId) } }),
    "This Drive Log has no data.",
  );
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
  const { channels: payload } = detail;
  // The charted Channel keys in picker order; it starts as the preset and resets with the Drive Log.
  const [charted, setCharted] = useState(() => presetKeys(detail.chartPreset));
  const toggle = (key: string) =>
    setCharted((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const [allChannels, setAllChannels] = useState(false);
  const panels = useMemo(
    () => pickerPanels(detail.chartPreset, charted, payload.channels),
    [detail.chartPreset, charted, payload.channels],
  );
  // The readout lists the Channels in picker order, whatever panel each one is in.
  const series = useMemo(
    () => panels.flatMap((p) => p.series).sort((a, b) => a.index - b.index),
    [panels],
  );
  const order = channelOrder(charted, payload.channels, payload.hidden);
  const scheme = useSchemeChanges();
  const colors = useMemo(() => seriesColors(charted.length), [charted.length, scheme]);
  const desktop = useIsDesktop();
  const t = detail.channels.t;
  const [row, setRow] = useState(0);
  const chartCard = useRef<HTMLDivElement>(null);
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
  // Look-alikes wait for their switch (#61).
  const shownEvents = useMemo(
    () => detail.events.filter((e) => e.category !== "look-alike"),
    [detail.events],
  );
  const packNames = useMemo(
    () =>
      new Map(
        detail.ruleOutcomes.flatMap((o) =>
          o.packId && o.packName ? [[o.packId, o.packName]] : [],
        ),
      ),
    [detail.ruleOutcomes],
  );
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
      <div class="viewer-grid">
        <div class="viewer-main">
          <Notices messages={[...detail.decodeNotices, ...detail.warnings]} />
          <ChannelChips
            channels={payload.channels}
            charted={order.charted}
            others={order.others}
            colors={colors}
            onToggle={toggle}
            onAll={() => setAllChannels(true)}
          />
          <Readout
            series={series}
            colors={colors}
            row={row}
            elapsed={t[row] ?? 0}
            startSec={startSec}
            inWindow={inPackSpan(detail.events, t[row] ?? Number.NaN)}
          />
          <div class="chart-card" ref={chartCard}>
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
              events={shownEvents}
              cursorRow={row}
              onCursorRow={setRow}
              onRange={zoomTo}
            />
            <Legend events={shownEvents} />
          </div>
          <DataTable
            t={t}
            channels={payload.channels}
            keys={[...order.charted, ...order.others]}
            row={row}
            startSec={startSec}
          />
        </div>
        <div class="viewer-side">
          <EventsPanel
            events={shownEvents}
            packNames={packNames}
            notRun={outcomeLines(detail.ruleOutcomes, {
              unassigned: detail.vehicleId === null,
            })}
            onSeek={(e) => {
              setRow(Math.max(0, nearestRow(t, e.startSec ?? 0)));
              chartCard.current?.scrollIntoView({ block: "nearest" });
            }}
          />
        </div>
      </div>
      {allChannels && (
        <AllChannelsSheet
          channels={payload.channels}
          hidden={payload.hidden}
          charted={charted}
          onToggle={toggle}
          onClose={() => setAllChannels(false)}
        />
      )}
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
