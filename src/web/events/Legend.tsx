import { type OverlayPattern, overlayPattern } from "./overlay-style.ts";

const LABELS: Record<OverlayPattern, string> = {
  fill: "Event",
  "dashed-line": "Point event",
  hatch: "Rule Pack",
  outline: "Look-alike",
};
const ORDER: OverlayPattern[] = ["fill", "dashed-line", "hatch", "outline"];

/** A swatch for each kind of overlay the log has, drawn in the same pattern as the chart. */
export function Legend(props: {
  events: readonly { kind: string; category: string }[];
  /** True when a freeze-frame line is charted. */
  freezeFrame: boolean;
  /** True when a Note is pinned. */
  note?: boolean;
}) {
  const present = new Set(props.events.map(overlayPattern));
  const kinds = ORDER.filter((k) => present.has(k));
  if (kinds.length === 0 && !props.freezeFrame && !props.note) return null;
  return (
    <ul class="legend" aria-label="Legend">
      {kinds.map((k) => (
        <li key={k}>
          <i class={`legend-swatch event-marker-${k}`} aria-hidden="true" />
          {LABELS[k]}
        </li>
      ))}
      {props.freezeFrame && (
        <li>
          <i class="legend-swatch legend-swatch-freeze" aria-hidden="true" />
          Freeze frame
        </li>
      )}
      {props.note && (
        <li>
          <i class="legend-swatch legend-swatch-note" aria-hidden="true" />
          Note
        </li>
      )}
    </ul>
  );
}
