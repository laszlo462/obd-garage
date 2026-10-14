import { useState } from "preact/hooks";
import { useLocation, useRoute } from "preact-iso";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import { DeleteVehicleSheet } from "./DeleteVehicleSheet.tsx";
import { useCatalogue } from "./use-catalogue.ts";

/** Vehicle settings: the Profile, the Rule Packs and delete, for one Vehicle. */
export function VehicleSettings() {
  const state = useAppState();
  const api = useApi();
  const catalogue = useCatalogue();
  const location = useLocation();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const id = Number(useRoute().params.id);
  const vehicle = state.vehicles.value.find((v) => v.id === id);
  if (!vehicle || !catalogue) return null;
  async function save(json: { profileId?: string; packIds?: string[] }) {
    setSaving(true);
    try {
      const res = await api.api.vehicles[":id"]
        .$patch({ param: { id: String(id) }, json })
        .catch(() => null);
      if (res?.ok) state.updateVehicle(await res.json());
      else state.toast("Couldn't save the change.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <h2 class="section-label">Profile</h2>
      {catalogue.profiles.map((p) => (
        <label key={p.id} class="radio-row">
          <input
            type="radio"
            disabled={saving}
            name="profile"
            checked={vehicle.profileId === p.id}
            onChange={() => save({ profileId: p.id })}
          />
          <span class="main">{p.name}</span>
        </label>
      ))}
      <h2 class="section-label">Rule Packs</h2>
      {catalogue.rulePacks.map((p) => (
        <label key={p.id} class="radio-row switch-row">
          <input
            type="checkbox"
            role="switch"
            aria-checked={vehicle.packIds.includes(p.id)}
            disabled={saving}
            checked={vehicle.packIds.includes(p.id)}
            onChange={(e) =>
              save({
                packIds: e.currentTarget.checked
                  ? [...vehicle.packIds, p.id]
                  : vehicle.packIds.filter((x) => x !== p.id),
              })
            }
          />
          <span class="main">
            <span>{p.name}</span>
            <span class="sub">{p.description}</span>
          </span>
        </label>
      ))}
      <p class="list-note">
        Changing the Profile or a Rule Pack regenerates this Vehicle's Events. Notes are kept.
      </p>
      <button type="button" class="btn-default btn-danger" onClick={() => setDeleting(true)}>
        Delete vehicle…
      </button>
      {deleting && (
        <DeleteVehicleSheet
          vehicle={vehicle}
          onClose={() => setDeleting(false)}
          onDeleted={() => location.route("/vehicles")}
        />
      )}
    </>
  );
}
