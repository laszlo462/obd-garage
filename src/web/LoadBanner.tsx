import { X } from "lucide-preact";
import { useAppState } from "./AppState.tsx";

/** The one banner for a failed load. Retry refreshes app state, then reloads every screen. */
export function LoadBanner() {
  const state = useAppState();
  if (!state.loadFailed.value) return null;
  async function retry() {
    await state.refresh();
    state.invalidate();
  }
  return (
    <div class="load-banner" role="alert">
      <X aria-hidden="true" size={20} strokeWidth={1.8} />
      <span class="message">Couldn't load.</span>
      <button type="button" class="btn-default" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
