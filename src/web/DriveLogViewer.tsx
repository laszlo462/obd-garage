import { useMemo, useRef, useState } from "preact/hooks";
import { useLocation, useRoute } from "preact-iso";
import { useAppState } from "./AppState.tsx";
import { AssignSheet } from "./AssignSheet.tsx";
import { useApi } from "./api.tsx";
import type { DriveLogDetail, NoteView } from "./api-types.ts";
import { AllChannelsSheet } from "./chart/AllChannelsSheet.tsx";
import { ChannelChips } from "./chart/ChannelChips.tsx";
import { clockAt, startSecondOfDay } from "./chart/clock.ts";
import { DataTable } from "./chart/DataTable.tsx";
import { DriveChart } from "./chart/DriveChart.tsx";
import { freezeLines } from "./chart/freeze-lines.ts";
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
import { NoteBar } from "./notes/NoteBar.tsx";
import { NotesPanel } from "./notes/NotesPanel.tsx";
import { PinHeads } from "./notes/PinHeads.tsx";
import { pinPositions } from "./notes/pin-positions.ts";
import { pinnedRows } from "./notes/pinned-rows.ts";
import { useNoteDialogs } from "./notes/use-note-dialogs.tsx";
import { useNotes } from "./notes/use-notes.ts";
import { ReferenceReportSheet } from "./ReferenceReportSheet.tsx";
import { referenceChipText } from "./reference-chip.ts";
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
  const [referenceSheet, setReferenceSheet] = useState(false);
  // "assign" is the chip on an Unassigned log; "change" is Change Vehicle… and may send it back to Unassigned.
  const [assignSheet, setAssignSheet] = useState<"assign" | "change" | null>(null);
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
  // The switch is per Drive Log (the body is keyed by id) and never saved. An Unassigned log has none.
  const [lookAlikes, setLookAlikes] = useState(false);
  const unassigned = detail.vehicleId === null;
  const shownEvents = useMemo(
    () => (lookAlikes ? detail.events : detail.events.filter((e) => e.category !== "look-alike")),
    [detail.events, lookAlikes],
  );
  const noteList = useNotes(detail.id);
  const {
    openAdd,
    openView,
    dialogs: noteDialogs,
  } = useNoteDialogs(noteList, (n) =>
    n.snappedTimeSec === null ? null : clockAt(startSec, n.snappedTimeSec),
  );
  const pins = useMemo(() => pinnedRows(noteList.notes, t), [noteList.notes, t]);
  const here = pins.get(row);
  const pinTimes = useMemo(() => [...pins.keys()].map((r) => t[r] ?? 0), [pins, t]);
  const pinList = useMemo(
    () =>
      noteList.notes.flatMap((note) =>
        note.snappedTimeSec === null ? [] : [{ note, startSec: note.snappedTimeSec }],
      ),
    [noteList.notes],
  );
  /** Snap the cursor to a pinned Note's row and open it. */
  const showPin = (note: NoteView) => {
    if (note.snappedTimeSec !== null) setRow(Math.max(0, nearestRow(t, note.snappedTimeSec)));
    openView(note);
  };
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
        <button
          type="button"
          class="reference-chip"
          onClick={() => (unassigned ? setAssignSheet("assign") : setReferenceSheet(true))}
        >
          {referenceChipText(detail.referenceReport, { unassigned: detail.vehicleId === null })}
        </button>
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
            noted={here !== undefined}
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
            <PinHeads
              pins={pinPositions([...pins.keys()], t, range).map((p) => ({
                ...p,
                notes: pins.get(p.row) ?? [],
                label: `Note at ${clockAt(startSec, t[p.row] ?? 0)}`,
              }))}
              onOpen={showPin}
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
              freezeFrame={detail.referenceReport.freezeFrame}
              pinTimes={pinTimes}
              cursorRow={row}
              onCursorRow={setRow}
              onRange={zoomTo}
            />
            <Legend
              events={shownEvents}
              note={pinList.length > 0}
              freezeFrame={panels.some(
                (p) => freezeLines(p, detail.referenceReport.freezeFrame).length > 0,
              )}
            />
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
            notRun={outcomeLines(detail.ruleOutcomes, { unassigned })}
            lookAlikes={unassigned ? null : { on: lookAlikes, onChange: setLookAlikes }}
            pins={pinList}
            onOpenPin={showPin}
            onSeek={(e) => {
              setRow(Math.max(0, nearestRow(t, e.startSec ?? 0)));
              chartCard.current?.scrollIntoView({ block: "nearest" });
            }}
          />
          <section class="notes-panel" aria-label="Notes">
            <h3 class="events-head">Notes</h3>
            <NotesPanel
              notes={noteList.notes}
              addLabel="Add"
              onAdd={() => openAdd(null)}
              onOpen={openView}
            />
          </section>
        </div>
      </div>
      <NoteBar
        clock={clockAt(startSec, t[row] ?? 0)}
        onStep={(delta) => setRow((r) => Math.min(Math.max(r + delta, 0), t.length - 1))}
        pinned={here !== undefined}
        onNote={() =>
          here?.[0]
            ? openView(here[0])
            : openAdd(t[row] ?? 0, `Note at ${clockAt(startSec, t[row] ?? 0)}`)
        }
      />
      {noteDialogs}
      {allChannels && (
        <AllChannelsSheet
          channels={payload.channels}
          hidden={payload.hidden}
          charted={charted}
          onToggle={toggle}
          onClose={() => setAllChannels(false)}
        />
      )}
      {referenceSheet && detail.vehicleId !== null && (
        <ReferenceReportSheet
          logId={detail.id}
          vehicleId={detail.vehicleId}
          referenceReport={detail.referenceReport}
          onClose={() => setReferenceSheet(false)}
        />
      )}
      {assignSheet && (
        <AssignSheet
          logIds={[detail.id]}
          current={detail.vehicleId}
          allowUnassign={assignSheet === "change"}
          onClose={() => setAssignSheet(null)}
        />
      )}
      {menu && (
        <DriveLogMenuSheet
          detail={detail}
          onClose={() => setMenu(false)}
          onDeleted={props.onDeleted}
          onChangeVehicle={() => {
            setMenu(false);
            setAssignSheet("change");
          }}
        />
      )}
    </>
  );
}
