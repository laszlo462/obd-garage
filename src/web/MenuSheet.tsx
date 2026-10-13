import { useAppState } from "./AppState.tsx";
import { Sheet } from "./Sheet.tsx";

export function MenuSheet(props: { onClose: () => void }) {
  const state = useAppState();
  return (
    <Sheet title="Menu" actionLabel="Close" onClose={props.onClose}>
      <div class="sheet-body">
        <a class="menu-row" href="/vehicles" onClick={props.onClose}>
          <span class="label">Vehicles</span>
          <span class="num">{state.vehicles.value.length}</span>
        </a>
        <a class="menu-row" href="/unassigned" onClick={props.onClose}>
          <span class="label">Unassigned</span>
          {state.unassignedCount.value > 0 && (
            <span class="count-badge">{state.unassignedCount.value}</span>
          )}
        </a>
        <a class="menu-row" href="/failed-uploads" onClick={props.onClose}>
          <span class="label">Failed Uploads</span>
          {state.failedCount.value > 0 && (
            <span class="count-badge">{state.failedCount.value}</span>
          )}
        </a>
        <button type="button" class="menu-row">
          Export {state.currentVehicle.value?.label ?? "Current Vehicle"}…
        </button>
        {state.version.value && <p class="version">Version {state.version.value}</p>}
      </div>
    </Sheet>
  );
}
