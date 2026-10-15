import { type OverlayPattern, overlayPattern } from "./overlay-style.ts";

const LABELS: Record<OverlayPattern, string> = {
  fill: "Event",
  "dashed-line": "Point event",
  hatch: "Rule Pack",
};
const ORDER: OverlayPattern[] = ["fill", "dashed-line", "hatch"];

/** A swatch for each kind of overlay the log has, drawn in the same pattern as the chart. */
export function Legend(props: { events: readonly { kind: string; category: string }[] }) {
  const present = new Set(props.events.map(overlayPattern));
  const kinds = ORDER.filter((k) => present.has(k));
  if (kinds.length === 0) return null;
  return (
    <ul class="legend" aria-label="Legend">
      {kinds.map((k) => (
        <li key={k}>
          <i class={`legend-swatch event-marker-${k}`} aria-hidden="true" />
          {LABELS[k]}
        </li>
      ))}
    </ul>
  );
}
