import { useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import type { VehicleRow } from "./api-types.ts";
import { DeleteVehicleSheet } from "./DeleteVehicleSheet.tsx";
import { ExportSheet } from "./ExportSheet.tsx";
import { count, shortDate } from "./format.ts";
import { profileName, rulePackName, useCatalogue } from "./use-catalogue.ts";

/** The Vehicles screen: one panel per Vehicle. */
export function Vehicles() {
  const state = useAppState();
  const current = state.currentVehicle.value;
  const catalogue = useCatalogue();
  const [confirming, setConfirming] = useState<VehicleRow | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  return (
    <>
      {state.vehicles.value.map((v) => (
        <article key={v.id} class="failed-panel vehicle-panel">
          <h2 class="vehicle-name">
            {v.label}
            {current?.id === v.id && <span class="badge badge-accent">Current</span>}
          </h2>
          <p class="mono">{v.vin}</p>
          <dl class="panel-facts">
            <dt>Profile</dt>
            <dd>{profileName(catalogue, v.profileId)}</dd>
            <dt>Rule Packs</dt>
            <dd>
              {v.packIds.length === 0
                ? "No Rule Packs"
                : v.packIds.map((id) => rulePackName(catalogue, id)).join(", ")}
            </dd>
          </dl>
          <p class="failed-meta">
            <span>{count(v.reportCount, "report")}</span>
            <span>{count(v.driveLogCount, "drive log")}</span>
            <span>{shortDate(v.latestReportDate)}</span>
          </p>
          <div class="failed-actions">
            <button
              type="button"
              class="btn-default"
              disabled={current?.id === v.id}
              onClick={() => state.selectVehicle(v.id)}
            >
              Switch to
            </button>
            <a class="btn-default" href={`/vehicles/${v.id}/settings`}>
              Settings
            </a>
            <button type="button" class="btn-default" onClick={() => setExporting(v.id)}>
              Export…
            </button>
            <button
              type="button"
              class="btn-default btn-danger"
              onClick={() => {
                setConfirming(v);
              }}
            >
              Delete…
            </button>
          </div>
        </article>
      ))}
      <p class="list-note">
        A Vehicle is added when a Diagnostic Report with a new VIN is uploaded.
      </p>
      {confirming && (
        <DeleteVehicleSheet vehicle={confirming} onClose={() => setConfirming(null)} />
      )}
      {exporting !== null && (
        <ExportSheet
          scope={{ kind: "vehicle", vehicleId: exporting }}
          onClose={() => setExporting(null)}
        />
      )}
    </>
  );
}
