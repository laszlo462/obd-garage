import { useEffect, useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import type { ExportSummary } from "./api-types.ts";
import {
  type ExportLog,
  frameError,
  goneNote,
  lastThirtyDays,
  summaryLine,
} from "./export-range.ts";
import { count } from "./format.ts";
import { Sheet } from "./Sheet.tsx";
import { okJson } from "./use-vehicle-load.ts";

export type ExportScope =
  | { kind: "vehicle"; vehicleId: number; day?: string }
  | { kind: "unassigned"; logs: ExportLog[] };

/** A range wide enough to hold any recorded day: All time asks the summary for the real span. */
const EVERYTHING = { from: "0001-01-01", to: "9999-12-31" };

type Range = { preset: "day" | "thirty" | "all" | "custom"; from: string; to: string };

/**
 * The Export sheet. Vehicle scope picks a range of recorded days and shows what the Bundle will hold;
 * Unassigned scope exports the ticked selection. Either way the browser streams the zip and the page
 * never holds it.
 */
export function ExportSheet(props: {
  scope: ExportScope;
  onRefused?: () => void;
  onClose: () => void;
}) {
  return props.scope.kind === "unassigned" ? (
    <UnassignedExport logs={props.scope.logs} onRefused={props.onRefused} onClose={props.onClose} />
  ) : (
    <VehicleExport
      vehicleId={props.scope.vehicleId}
      day={props.scope.day}
      onClose={props.onClose}
    />
  );
}

/** The hidden frame the Unassigned download posts into. */
const FRAME = "export-frame";

/**
 * Download .zip as a form post into a hidden frame: the browser saves the streamed answer, and a
 * refusal (a JSON error) lands in the frame instead of replacing the page.
 */
function UnassignedExport(props: {
  logs: ExportLog[];
  onRefused?: () => void;
  onClose: () => void;
}) {
  const api = useApi();
  // The server's message and the logs the sheet held when it came, to tell which have dropped out since.
  const [refused, setRefused] = useState<{ message: string; before: ExportLog[] } | null>(null);
  const error = refused && (goneNote(refused.before, props.logs) ?? refused.message);
  return (
    <Sheet
      title={`Export ${count(props.logs.length, "Drive Log")}`}
      actionLabel="Close"
      onClose={props.onClose}
    >
      <form
        method="post"
        action={api.api.export.unassigned.$path()}
        target={FRAME}
        onSubmit={() => setRefused(null)}
      >
        {props.logs.map(({ id }) => (
          <input key={id} type="hidden" name="logIds" value={id} />
        ))}
        <button type="submit" class="btn-primary" disabled={props.logs.length === 0}>
          Download .zip
        </button>
      </form>
      {error !== null && <p class="sheet-note tone-bad">{error}</p>}
      <iframe
        name={FRAME}
        title="Export download"
        hidden
        onLoad={(e) => {
          let doc: Document | null = null;
          try {
            doc = e.currentTarget.contentDocument;
          } catch {
            // An unreadable (cross-origin) document counts as empty.
          }
          const message = frameError(doc);
          setRefused(message === null ? null : { message, before: props.logs });
          if (message !== null) props.onRefused?.();
        }}
      />
    </Sheet>
  );
}

/** Download .zip is a plain link, disabled until the summary says the Bundle can be made. */
function VehicleExport(props: { vehicleId: number; day?: string; onClose: () => void }) {
  const { vehicleId, day } = props;
  const api = useApi();
  const state = useAppState();
  // Last 30 days is fixed when tapped, so a sheet left open past midnight keeps its range.
  const [range, setRange] = useState<Range>(
    day === undefined ? { preset: "all", from: "", to: "" } : { preset: "day", from: day, to: day },
  );
  // The latest answer, with the range it answers. An answer for another range counts as still loading.
  const [loaded, setLoaded] = useState<{ key: string; summary: ExportSummary | "failed" } | null>(
    null,
  );
  const { preset } = range;
  const asked = preset === "all" ? EVERYTHING : range;
  const key = `${asked.from}/${asked.to}`;
  // A cleared date, or From after To, has nothing to ask the server.
  const valid = asked.from !== "" && asked.to !== "" && asked.from <= asked.to;
  const answer = valid && loaded?.key === key ? loaded.summary : null;
  const failed = answer === "failed";
  const summary = answer === "failed" ? null : answer;
  useEffect(() => {
    if (!valid) return;
    let stale = false;
    api.api.export.summary
      .$get({ query: { vehicle: String(vehicleId), from: asked.from, to: asked.to } })
      .then(okJson)
      .catch(() => "failed" as const)
      .then((result) => !stale && setLoaded({ key, summary: result }));
    return () => {
      stale = true;
    };
  }, [api, vehicleId, asked.from, asked.to, key, valid]);
  const empty =
    summary !== null && summary.driveLogs + summary.reports + summary.referenceOnly === 0;
  const missing = summary?.missing ?? [];
  const vehicle = state.vehicles.value.find((v) => v.id === vehicleId);
  const from = preset === "all" ? (summary?.firstDay ?? "") : range.from;
  const to = preset === "all" ? (summary?.lastDay ?? "") : range.to;
  const type = (change: Partial<Pick<Range, "from" | "to">>) =>
    setRange({ preset: "custom", from, to, ...change });
  return (
    <Sheet title="Export" actionLabel="Close" onClose={props.onClose}>
      <div class="sheet-body">
        <div class="preset-row">
          {day !== undefined && (
            <button
              type="button"
              aria-pressed={preset === "day"}
              onClick={() => setRange({ preset: "day", from: day, to: day })}
            >
              This day
            </button>
          )}
          <button
            type="button"
            aria-pressed={preset === "thirty"}
            onClick={() => setRange({ preset: "thirty", ...lastThirtyDays(new Date()) })}
          >
            Last 30 days
          </button>
          <button
            type="button"
            aria-pressed={preset === "all"}
            onClick={() => setRange({ preset: "all", from: "", to: "" })}
          >
            All time
          </button>
        </div>
        <label class="field-row">
          From
          <input type="date" value={from} onInput={(e) => type({ from: e.currentTarget.value })} />
        </label>
        <label class="field-row">
          To
          <input type="date" value={to} onInput={(e) => type({ to: e.currentTarget.value })} />
        </label>
        {summary && <p class="sheet-note">{summaryLine(summary)}</p>}
        {failed && <p class="sheet-note tone-bad">Couldn't load the summary.</p>}
        {missing.length > 0 && (
          <p class="sheet-note tone-bad">An Original is missing on disk: {missing.join(", ")}</p>
        )}
        {vehicle && <p class="sheet-note">This Bundle contains the VIN ({vehicle.vin}).</p>}
      </div>
      {summary && !empty && missing.length === 0 ? (
        <a
          class="btn-primary"
          href={api.api.export.$path({ query: { vehicle: String(vehicleId), from, to } })}
          download
        >
          Download .zip
        </a>
      ) : (
        // biome-ignore lint/a11y/useValidAnchor: a disabled link has no href by design; aria-disabled says why.
        <a class="btn-primary" aria-disabled="true">
          {empty ? "Nothing in this range" : "Download .zip"}
        </a>
      )}
    </Sheet>
  );
}
