import { useAppState } from "./AppState.tsx";
import { NoVehicles } from "./NoVehicles.tsx";
import { Sheet } from "./Sheet.tsx";

export function VehicleSwitcherSheet(props: { onClose: () => void }) {
  const state = useAppState();
  return (
    <Sheet title="Current Vehicle" actionLabel="Done" onClose={props.onClose}>
      <div class="sheet-body">
        {state.loaded.value && state.vehicles.value.length === 0 && <NoVehicles />}
        {state.vehicles.value.map((v) => (
          <label key={v.id} class="radio-row">
            <input
              type="radio"
              name="vehicle"
              checked={state.currentVehicle.value?.id === v.id}
              onChange={() => state.selectVehicle(v.id)}
            />
            <span class="main">
              <span>{v.label}</span>
              <span class="sub">
                VIN …{v.vin.slice(-4)} · {v.reportCount} reports · {v.driveLogCount} drive logs
              </span>
            </span>
          </label>
        ))}
        <a class="menu-row link-row" href="/vehicles" onClick={props.onClose}>
          Manage vehicles…
        </a>
      </div>
    </Sheet>
  );
}
