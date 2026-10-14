import { useEffect, useRef } from "preact/hooks";
import { useAppState } from "./AppState.tsx";

/**
 * Offer the app bar's `…` button from a screen. `open` runs when the button is tapped.
 * The button shows while the screen is mounted and goes when it unmounts.
 */
export function useBarMenu(open: () => void) {
  const state = useAppState();
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    const handler = () => latest.current();
    state.barMenu.value = handler;
    return () => {
      if (state.barMenu.value === handler) state.barMenu.value = null;
    };
  }, [state]);
}
