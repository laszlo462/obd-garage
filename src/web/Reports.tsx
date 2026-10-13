import { useApi } from "./api.tsx";
import { UploadRow } from "./UploadRow.tsx";
import { okJson, useVehicleLoad } from "./use-vehicle-load.ts";

/** The Reports tab: upload rows for the Current Vehicle's Diagnostic Reports. */
export function Reports() {
  const api = useApi();
  const { vehicleId, result } = useVehicleLoad((id) =>
    api.api.reports.$get({ query: { vehicle: String(id) } }).then(okJson),
  );
  if (vehicleId === undefined) return null;
  // A failed load shows in the shell banner; with no rows to keep, the body stays empty.
  if (result.state !== "ready") return null;
  if (result.data.length === 0) return <p class="list-note">No reports yet.</p>;
  return (
    <>
      {result.data.map((r) => (
        <UploadRow key={r.id} row={{ ...r, kind: "report", durationSec: null }} />
      ))}
    </>
  );
}
