/** A touch point in plot-local pixels (x from the plot's left edge). */
export type TouchPoint = { x: number; y: number };

/** The plot as it is on screen: its width in pixels and the time range it shows. */
export type View = { width: number; min: number; max: number };

/** What a touch event means for the chart. The caller acts on it; `none` leaves the page to scroll. */
export type Intent =
  | { type: "none" }
  | { type: "tap"; x: number }
  | { type: "scrub"; x: number }
  /** Two fingers moved apart or together: the new range, with the midpoint's time held under the midpoint. */
  | { type: "pinch"; min: number; max: number }
  /** Two fingers slid together: the new range, same width. */
  | { type: "pan"; min: number; max: number };

export type GestureTracker = {
  /** Call on every touchstart with all the touches now down. */
  start(touches: readonly TouchPoint[]): Intent;
  /** Call on touchmove with all the touches now down. */
  move(touches: readonly TouchPoint[]): Intent;
  /** Call on touchend with the touches that remain down. */
  end(remaining: readonly TouchPoint[]): Intent;
  cancel(): void;
};

/** Finger travel in pixels before a touch becomes a scrub or a page scroll, or two fingers a pinch or pan. */
export const SLOP = 8;
/** Two fingers closer than this count as this far apart, so a pinch that starts touching cannot explode. */
const MIN_SPREAD = 20;

const NONE: Intent = { type: "none" };

type State =
  | { kind: "idle" }
  | { kind: "one"; x0: number; y0: number; lock: "h" | "v" | null }
  | { kind: "two"; view: View; spread0: number; mid0: number; mode: "pinch" | "pan" | null }
  /** A pinch has ended but a finger is still down; it does nothing until it lifts. */
  | { kind: "spent" };

/**
 * The pure core of our uPlot touch plugin (ADR 0002): turns touch input into intents.
 * One finger dragged sideways scrubs the cursor, and a tap places it. A first move past the slop that is more
 * vertical than horizontal locks the touch to the page scroll for good. Two fingers pinch and pan around their
 * midpoint. `view` is read when a gesture starts, so a pinch begins from the range on screen at that moment.
 */
export function createGestureTracker(view: () => View): GestureTracker {
  let state: State = { kind: "idle" };

  function startTwo(touches: readonly TouchPoint[]) {
    const [a, b] = touches as [TouchPoint, TouchPoint];
    state = {
      kind: "two",
      view: view(),
      spread0: Math.max(MIN_SPREAD, Math.abs(a.x - b.x)),
      mid0: (a.x + b.x) / 2,
      mode: null,
    };
  }

  return {
    start(touches) {
      if (touches.length === 1) {
        const [t] = touches as [TouchPoint];
        state = { kind: "one", x0: t.x, y0: t.y, lock: null };
      } else if (touches.length === 2) startTwo(touches);
      else state = { kind: "spent" };
      return NONE;
    },

    move(touches) {
      if (state.kind === "one" && touches.length === 1) {
        const [t] = touches as [TouchPoint];
        if (!state.lock) {
          const dx = Math.abs(t.x - state.x0);
          const dy = Math.abs(t.y - state.y0);
          if (Math.max(dx, dy) > SLOP) state.lock = dx > dy ? "h" : "v";
        }
        return state.lock === "h" ? { type: "scrub", x: t.x } : NONE;
      }
      if (state.kind === "two" && touches.length === 2) {
        const [a, b] = touches as [TouchPoint, TouchPoint];
        const spread = Math.max(MIN_SPREAD, Math.abs(a.x - b.x));
        const mid = (a.x + b.x) / 2;
        if (state.mode === null) {
          if (Math.abs(spread - state.spread0) > SLOP) state.mode = "pinch";
          else if (Math.abs(mid - state.mid0) > SLOP) state.mode = "pan";
          else return NONE;
        }
        const { width, min, max } = state.view;
        const range0 = max - min;
        const range = state.mode === "pan" ? range0 : (range0 * state.spread0) / spread;
        const under = min + (state.mid0 / width) * range0;
        const lo = under - (mid / width) * range;
        return { type: state.mode, min: lo, max: lo + range };
      }
      return NONE;
    },

    end(remaining) {
      const was = state;
      if (was.kind === "one" && remaining.length === 0) {
        state = { kind: "idle" };
        return was.lock === null ? { type: "tap", x: was.x0 } : NONE;
      }
      state = remaining.length === 0 ? { kind: "idle" } : { kind: "spent" };
      return NONE;
    },

    cancel() {
      state = { kind: "idle" };
    },
  };
}
