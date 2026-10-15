import type { ChannelData } from "./series.ts";

/**
 * The Channel picker's chip row: the charted Channels first in picker order, each in its series colour, then
 * the other visible ones, then **All Channels…**. A tap toggles the Channel.
 */
export function ChannelChips(props: {
  channels: Readonly<Record<string, ChannelData>>;
  /** Charted keys in picker order. */
  charted: readonly string[];
  /** Visible keys that are not charted, in log order. */
  others: readonly string[];
  /** Series colours by place in `charted`. */
  colors: readonly string[];
  onToggle(key: string): void;
  onAll(): void;
}) {
  const { channels, charted, colors } = props;
  const chip = (key: string, colour?: string) => (
    <button
      key={key}
      type="button"
      class="chip"
      aria-pressed={colour !== undefined}
      style={colour === undefined ? undefined : `--chip: ${colour}`}
      onClick={() => props.onToggle(key)}
    >
      <i class="chip-dot" aria-hidden="true" />
      {channels[key]?.label ?? key}
    </button>
  );
  return (
    <fieldset class="chips" aria-label="Channels">
      {charted.map((key, i) => chip(key, colors[i] ?? "var(--ink)"))}
      {props.others.map((key) => chip(key))}
      <button type="button" class="chip chip-all" onClick={props.onAll}>
        All Channels…
      </button>
    </fieldset>
  );
}
