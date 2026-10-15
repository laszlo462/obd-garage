import type { DriveLogDetail } from "../api-types.ts";
import { elapsedAt } from "../chart/clock.ts";
import { duration } from "../format.ts";
import { overlayPattern } from "./overlay-style.ts";

export type EventRow = DriveLogDetail["events"][number];

/**
 * The Events of a Drive Log by time, then the rules that did not run. A tap on a row seeks the chart's
 * cursor to the Event's start. Titles and text go in as text, never markup.
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
}) {
  const rows = [...props.events]
    .filter((e) => e.startSec !== null)
    .sort((a, b) => (a.startSec as number) - (b.startSec as number));
  return (
    <section class="events-panel" aria-label="Events">
      <div class="events-header">
        <h3 class="events-head">
          Events<span class="count">{rows.length}</span>
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
        {rows.map((e) => (
          <li key={`${e.ruleId}@${e.startSec}`}>
            <button type="button" class="event-row" onClick={() => props.onSeek(e)}>
              <i class={`event-marker event-marker-${overlayPattern(e)}`} aria-hidden="true" />
              <span class="event-body">
                {e.packId !== null && (
                  <span class="event-pack">{props.packNames.get(e.packId) ?? e.packId}</span>
                )}
                <span class="event-title">{e.title}</span>
                <span class="event-detail">{e.text}</span>
              </span>
              <span class="event-times">
                <span class="event-start">{elapsedAt(e.startSec as number)}</span>
                {e.kind === "span" && (
                  <span class="event-duration">
                    {duration((e.endSec as number) - (e.startSec as number))}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
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
