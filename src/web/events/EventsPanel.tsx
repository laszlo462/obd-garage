import type { DriveLogDetail, NoteView } from "../api-types.ts";
import { elapsedAt } from "../chart/clock.ts";
import { duration } from "../format.ts";
import { overlayPattern } from "./overlay-style.ts";

export type EventRow = DriveLogDetail["events"][number];

type Row = { startSec: number } & ({ event: EventRow } | { pin: NoteView });

/**
 * The Events of a Drive Log and its pinned Notes by time, then the rules that did not run. A tap on an Event
 * seeks the chart's cursor to its start; a tap on a pin row opens that Note. Titles and text go in as text,
 * never markup.
 */
export function EventsPanel(props: {
  events: readonly EventRow[];
  /** Pack label by pack id, for the line above a pack Event. */
  packNames: ReadonlyMap<string, string>;
  /** The muted lines for rules that did not run. */
  notRun: readonly string[];
  /** The Look-alikes switch; `null` hides it (an Unassigned log has no Reference Report). */
  lookAlikes: { on: boolean; onChange(on: boolean): void } | null;
  onSeek(event: EventRow): void;
  /** The pinned Notes, each at its snapped time; they join the list as pin rows. */
  pins?: readonly { note: NoteView; startSec: number }[];
  onOpenPin?(note: NoteView): void;
}) {
  const events = props.events.filter((e) => e.startSec !== null);
  const rows: Row[] = [
    ...events.map((event) => ({ event, startSec: event.startSec as number })),
    ...(props.pins ?? []).map(({ note, startSec }) => ({ pin: note, startSec })),
  ].sort((a, b) => a.startSec - b.startSec);
  return (
    <section class="events-panel" aria-label="Events">
      <div class="events-header">
        <h3 class="events-head">
          Events<span class="count">{events.length}</span>
        </h3>
        {props.lookAlikes && (
          <label class="switch-row look-switch">
            <input
              type="checkbox"
              role="switch"
              aria-checked={props.lookAlikes.on}
              checked={props.lookAlikes.on}
              onChange={(e) => props.lookAlikes?.onChange(e.currentTarget.checked)}
            />
            Look-alikes
          </label>
        )}
      </div>
      <ul class="events-list">
        {rows.map((row) =>
          "pin" in row ? (
            <li key={`note-${row.pin.id}`}>
              <button type="button" class="event-row" onClick={() => props.onOpenPin?.(row.pin)}>
                <i class="event-marker event-marker-pin" aria-hidden="true" />
                <span class="event-body">
                  <span class="event-title">Note</span>
                  <span class="event-detail">{row.pin.text}</span>
                </span>
                <span class="event-times">
                  <span class="event-start">{elapsedAt(row.startSec)}</span>
                </span>
              </button>
            </li>
          ) : (
            <li key={`${row.event.ruleId}@${row.event.startSec}`}>
              <button type="button" class="event-row" onClick={() => props.onSeek(row.event)}>
                <i
                  class={`event-marker event-marker-${overlayPattern(row.event)}`}
                  aria-hidden="true"
                />
                <span class="event-body">
                  {row.event.packId !== null && (
                    <span class="event-pack">
                      {props.packNames.get(row.event.packId) ?? row.event.packId}
                    </span>
                  )}
                  <span class="event-title">{row.event.title}</span>
                  <span class="event-detail">{row.event.text}</span>
                </span>
                <span class="event-times">
                  <span class="event-start">{elapsedAt(row.startSec)}</span>
                  {row.event.kind === "span" && (
                    <span class="event-duration">
                      {duration((row.event.endSec as number) - row.startSec)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ),
        )}
        {props.notRun.map((line) => (
          <li key={line} class="event-notrun">
            <i class="event-marker event-marker-notrun" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
