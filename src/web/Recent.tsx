import { useEffect, useState } from "preact/hooks";
import { useApi } from "./api.tsx";
import type { FeedRow, StatusData } from "./api-types.ts";
import { appendPage } from "./paging.ts";
import { StatStrip } from "./StatStrip.tsx";
import { UploadRow } from "./UploadRow.tsx";
import { okJson, useVehicleLoad } from "./use-vehicle-load.ts";

type Feed = { rows: FeedRow[]; nextBefore: number | null };

/** The Recent tab: the status strip, then both kinds of upload, newest first, paged with `before`. */
export function Recent() {
  const api = useApi();
  const { vehicleId, result } = useVehicleLoad(async (id) => {
    const [status, page] = await Promise.all([
      api.api.vehicles[":id"].status.$get({ param: { id: String(id) } }).then(okJson),
      api.api.uploads.$get({ query: { vehicle: String(id) } }).then(okJson),
    ]);
    return { status, page };
  });
  const [feed, setFeed] = useState<Feed>({ rows: [], nextBefore: null });
  const [paging, setPaging] = useState(false);
  const loaded = result.state === "ready" ? result.data : null;
  useEffect(() => {
    if (loaded) setFeed({ rows: loaded.page.items, nextBefore: loaded.page.nextBefore });
  }, [loaded]);

  if (vehicleId === undefined) return null;
  if (result.state === "error") return <p class="list-note">Could not load. Try again later.</p>;
  if (!loaded) return null;
  const status: StatusData = loaded.status;

  async function older() {
    if (feed.nextBefore === null || vehicleId === undefined) return;
    setPaging(true);
    try {
      const page = await api.api.uploads
        .$get({ query: { vehicle: String(vehicleId), before: String(feed.nextBefore) } })
        .then(okJson);
      setFeed((f) => ({ rows: appendPage(f.rows, page.items), nextBefore: page.nextBefore }));
    } finally {
      setPaging(false);
    }
  }

  return (
    <>
      <StatStrip status={status} />
      <h2 class="section-label">Recent uploads</h2>
      {feed.rows.length === 0 && <p class="list-note">No uploads yet.</p>}
      {feed.rows.map((row) => (
        <UploadRow key={row.id} row={row} />
      ))}
      {feed.nextBefore !== null && (
        <button type="button" class="list-more" disabled={paging} onClick={older}>
          Show older
        </button>
      )}
    </>
  );
}
