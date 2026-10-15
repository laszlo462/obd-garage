import { useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import { Sheet } from "./Sheet.tsx";

/**
 * The Assign to… sheet: Vehicle radio rows and Assign. It sends the request itself. `current` is the
 * Vehicle the log is on now (null when Unassigned or for a bulk pick); with `allowUnassign` an
 * Unassigned row can send `vehicleId: null`.
 */
export function AssignSheet(props: {
  logIds: number[];
  current: number | null;
  allowUnassign?: boolean;
  onClose: () => void;
  /** Called after the server assigned and app state refreshed, before the sheet closes. */
  onAssigned?: () => void;
}) {
  const api = useApi();
  const state = useAppState();
  const vehicles = state.vehicles.value;
  // Until the owner picks, the row follows the log's Vehicle, else the Current Vehicle (which may still be loading).
  const [picked, setPick] = useState<number | null | undefined>(undefined);
  const pick =
    picked !== undefined
      ? picked
      : (props.current ?? (props.allowUnassign ? null : (state.currentVehicle.value?.id ?? null)));
  const canAssign = pick !== props.current && (pick !== null || props.allowUnassign === true);
  async function assign() {
    const ok = await api.api["drive-logs"].assign
      .$post({ json: { logIds: props.logIds, vehicleId: pick } })
      .then((res) => res.ok)
      .catch(() => false);
    if (!ok) {
      props.onClose();
      return state.toast("Couldn't assign the drive logs.");
    }
    await state.refresh();
    state.invalidate();
    props.onAssigned?.();
    props.onClose();
  }
  return (
    <Sheet title={`Assign to${"…"}`} actionLabel="Cancel" onClose={props.onClose}>
      <div class="sheet-body">
        {vehicles.length === 0 && <p class="sheet-note">There are no Vehicles yet.</p>}
        {vehicles.map((v) => (
          <label key={v.id} class="radio-row">
            <input
              type="radio"
              name="assign-vehicle"
              checked={pick === v.id}
              onChange={() => setPick(v.id)}
            />
            <span class="main">
              <span>{v.label}</span>
            </span>
          </label>
        ))}
        {props.allowUnassign && (
          <label class="radio-row">
            <input
              type="radio"
              name="assign-vehicle"
              checked={pick === null}
              onChange={() => setPick(null)}
            />
            <span class="main">
              <span>Unassigned</span>
            </span>
          </label>
        )}
        <p class="sheet-note">
          Events are regenerated with the Vehicle's Profile and Rule Packs. Notes are kept.
        </p>
      </div>
      <button type="button" class="btn-primary" disabled={!canAssign} onClick={assign}>
        Assign
      </button>
    </Sheet>
  );
}
