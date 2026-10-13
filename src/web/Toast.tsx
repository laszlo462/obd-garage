import { useAppState } from "./AppState.tsx";

/** The one shared toast for a failed action. App state sets and clears it. */
export function Toast() {
  const message = useAppState().toastMessage.value;
  if (message === null) return null;
  return (
    <div class="toast" role="status">
      {message}
    </div>
  );
}
