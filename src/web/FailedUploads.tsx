import { useEffect, useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import type { FailedUploadRow as FailedRow } from "./api-types.ts";
import { ConfirmSheet } from "./ConfirmSheet.tsx";
import { localDateTime } from "./format.ts";
import { okJson } from "./use-vehicle-load.ts";

/** The Failed Uploads screen: one panel per file the server could not derive. */
export function FailedUploads() {
  const api = useApi();
  const state = useAppState();
  const [confirming, setConfirming] = useState<FailedRow | null>(null);
  const [rows, setRows] = useState<FailedRow[] | null>(null);
  useEffect(() => {
    api.api["failed-uploads"].$get().then(okJson).then(setRows);
  }, []);
  if (rows === null) return null;
  async function remove(row: FailedRow) {
    setConfirming(null);
    const res = await api.api.uploads[":id"].$delete({ param: { id: String(row.id) } });
    if (!res.ok) return;
    setRows((current) => current?.filter((r) => r.id !== row.id) ?? null);
    await state.refresh();
    state.invalidate();
  }
  return (
    <>
      <p class="list-note">
        These files were uploaded but could not be read. Download the original or delete it.
      </p>
      {rows.length === 0 && <p class="list-note">No failed uploads.</p>}
      {rows.map((r) => (
        <article key={r.id} class="failed-panel">
          <p class="failed-name">{r.filename}</p>
          <p class="failed-meta">
            <span>{r.kind === "report" ? "REPORT" : "LOG"}</span>
            <span>{localDateTime(r.uploadedAt)}</span>
          </p>
          <p class="failed-error">{r.error}</p>
          <div class="failed-actions">
            <a
              class="btn-default"
              href={api.api.uploads[":id"].original.$path({ param: { id: String(r.id) } })}
              download
            >
              Download original
            </a>
            <button type="button" class="btn-danger" onClick={() => setConfirming(r)}>
              Delete
            </button>
          </div>
        </article>
      ))}
      {confirming && (
        <ConfirmSheet
          title="Delete this upload?"
          goes={[confirming.filename, "The original file and its error."]}
          confirmLabel="Delete"
          onConfirm={() => remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}
