import { useApi } from "./api.tsx";
import { count, monthKey, monthLabel } from "./format.ts";
import { UploadRow } from "./UploadRow.tsx";
import { okJson, useVehicleLoad } from "./use-vehicle-load.ts";

/** The Drive Logs tab: upload rows grouped under month labels. The server sends them newest first. */
export function DriveLogs() {
  const api = useApi();
  const { vehicleId, result } = useVehicleLoad((id) =>
    api.api["drive-logs"].$get({ query: { vehicle: String(id) } }).then(okJson),
  );
  if (vehicleId === undefined) return null;
  if (result.state === "error") return <p class="list-note">Could not load. Try again later.</p>;
  if (result.state === "loading") return null;
  if (result.data.length === 0) return <p class="list-note">No drive logs yet.</p>;
  const groups: { key: string; rows: typeof result.data }[] = [];
  for (const row of result.data) {
    const key = monthKey(row.recordedAt);
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, rows: [row] });
  }
  return (
    <>
      {groups.map((g) => (
        <section key={g.key}>
          <h2 class="section-label">
            {monthLabel(g.key)} · {count(g.rows.length, "drive log")}
          </h2>
          {g.rows.map((r) => (
            <UploadRow key={r.id} row={{ ...r, kind: "drive-log" }} />
          ))}
        </section>
      ))}
    </>
  );
}
