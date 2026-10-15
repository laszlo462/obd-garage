import type { NoteView } from "../api-types.ts";
import { PAD_RIGHT, Y_AXIS_WIDTH } from "../chart/panel-options.ts";

/**
 * The tappable heads of the pinned Notes, above the first panel. Each sits at its `fraction` of the plot's
 * width, which starts after the y axis and stops short of the right edge. A head opens the first Note on its row.
 */
export function PinHeads(props: {
  pins: readonly { row: number; fraction: number; notes: readonly NoteView[]; label: string }[];
  onOpen(note: NoteView): void;
}) {
  return (
    <div class="pin-heads">
      {props.pins.map((pin) => (
        <button
          key={pin.row}
          type="button"
          class="pin-head"
          aria-label={pin.label}
          style={{
            left: `calc(${Y_AXIS_WIDTH}px + (100% - ${Y_AXIS_WIDTH + PAD_RIGHT}px) * ${pin.fraction})`,
          }}
          onClick={() => pin.notes[0] && props.onOpen(pin.notes[0])}
        >
          <i aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
