import { useEffect, useMemo, useRef } from "preact/hooks";
import { createRepeater } from "./repeater.ts";

/**
 * A 52 x 44 stepper. A press steps at once and holding repeats (see `createRepeater`); a click with no
 * pointer press before it (the keyboard) steps once.
 */
function Stepper(props: { label: string; glyph: string; onStep(): void }) {
  const latest = useRef(props.onStep);
  latest.current = props.onStep;
  const repeater = useMemo(
    () => createRepeater(() => latest.current(), { delay: 420, interval: 70 }),
    [],
  );
  useEffect(() => repeater.release, [repeater]);
  return (
    <button
      type="button"
      class="note-step"
      aria-label={props.label}
      onPointerDown={repeater.press}
      onPointerUp={repeater.release}
      onPointerCancel={repeater.release}
      onPointerLeave={repeater.release}
      onClick={(e) => e.detail === 0 && props.onStep()}
    >
      <span aria-hidden="true">{props.glyph}</span>
      <small aria-hidden="true">row</small>
    </button>
  );
}

/** The bar at the foot of the Drive Log viewer: step the cursor a row either way, or add a Note at the cursor. */
export function NoteBar(props: {
  /** The wall-clock time of the cursor row, "17:44:44". */
  clock: string;
  /** Steps the cursor by one row. */
  onStep(delta: 1 | -1): void;
  /** The cursor sits on a pinned row: the centre button opens that Note instead of adding one. */
  pinned: boolean;
  onNote(): void;
}) {
  return (
    <div class="note-bar" role="toolbar" aria-label="Note bar">
      <Stepper label="Previous row" glyph="‹" onStep={() => props.onStep(-1)} />
      <button
        type="button"
        class={props.pinned ? "note-here note-here-pinned" : "note-here"}
        onClick={props.onNote}
      >
        {`${props.pinned ? "Open Note" : "Note here"} ${props.clock}`}
      </button>
      <Stepper label="Next row" glyph="›" onStep={() => props.onStep(1)} />
    </div>
  );
}
