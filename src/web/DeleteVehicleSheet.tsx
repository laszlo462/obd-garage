import { useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import type { VehicleRow } from "./api-types.ts";
import { ConfirmSheet } from "./ConfirmSheet.tsx";
import { count } from "./format.ts";

/** The Delete vehicle confirm. Drive Logs are kept (as Unassigned) unless the box is ticked. */
export function DeleteVehicleSheet(props: {
  vehicle: VehicleRow;
  onClose: () => void;
  /** Called after the server deleted the Vehicle and the app state refreshed. */
  onDeleted?: () => void;
}) {
  const { vehicle } = props;
  const state = useAppState();
  const api = useApi();
  const [deleteLogs, setDeleteLogs] = useState(false);
  async function remove() {
    props.onClose();
    const deleted = await api.api.vehicles[":id"]
      .$delete({
        param: { id: String(vehicle.id) },
        query: deleteLogs ? { deleteLogs: "1" } : {},
      })
      .then((res) => res.ok)
      .catch(() => false);
    if (!deleted) return state.toast("Couldn't delete the vehicle.");
    await state.refresh();
    state.invalidate();
    props.onDeleted?.();
  }
  return (
    <ConfirmSheet
      title="Delete this vehicle?"
      goes={[vehicle.label, count(vehicle.reportCount, "Report")]}
      confirmLabel="Delete vehicle"
      onConfirm={remove}
      onCancel={props.onClose}
    >
      {vehicle.driveLogCount > 0 && (
        <>
          <label class="radio-row">
            <input
              type="checkbox"
              checked={deleteLogs}
              onChange={(e) => setDeleteLogs(e.currentTarget.checked)}
            />
            <span class="main">{`Also delete its ${count(vehicle.driveLogCount, "Drive Log")}`}</span>
          </label>
          <p class="sheet-note">Kept logs become Unassigned.</p>
        </>
      )}
    </ConfirmSheet>
  );
}
