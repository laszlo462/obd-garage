import { Sheet } from "../Sheet.tsx";
import type { ChannelData } from "./series.ts";

/** The full Channel picker: a checkbox per Channel, the Profile's hidden ones apart under their own heading. */
export function AllChannelsSheet(props: {
  channels: Readonly<Record<string, ChannelData>>;
  hidden: readonly string[];
  charted: readonly string[];
  onToggle(key: string): void;
  onClose(): void;
}) {
  const { channels, hidden, charted } = props;
  const keys = Object.keys(channels);
  const group = (list: string[]) => (
    <div class="sheet-body">
      {list.map((key) => (
        <label key={key} class="radio-row">
          <input
            type="checkbox"
            aria-label={channels[key]?.label ?? key}
            checked={charted.includes(key)}
            onChange={() => props.onToggle(key)}
          />
          <span class="main">
            <span>{channels[key]?.label ?? key}</span>
            {channels[key]?.unit && <span class="sub">{channels[key]?.unit}</span>}
          </span>
        </label>
      ))}
    </div>
  );
  const apart = keys.filter((key) => hidden.includes(key));
  return (
    <Sheet title="All Channels" actionLabel="Done" onClose={props.onClose}>
      {group(keys.filter((key) => !hidden.includes(key)))}
      {apart.length > 0 && (
        <>
          <h3 class="section-label sheet-heading">Hidden by the Profile</h3>
          {group(apart)}
        </>
      )}
    </Sheet>
  );
}
