import { useEffect, useRef, useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { AssignSheet } from "./AssignSheet.tsx";
import { useApi } from "./api.tsx";
import type { DriveLogRow } from "./api-types.ts";
import { ConfirmSheet } from "./ConfirmSheet.tsx";
import { ExportSheet } from "./ExportSheet.tsx";
import { count } from "./format.ts";
import { UnassignedRow } from "./UnassignedRow.tsx";
import { okJson } from "./use-vehicle-load.ts";

/** The Unassigned screen: the Drive Logs that belong to no Vehicle yet. */
export function Unassigned() {
  const api = useApi();
  const state = useAppState();
  const [rows, setRows] = useState<DriveLogRow[] | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState(false);
  const owner = useRef({});
  // Reloads on `revision`. A failure goes to the shell banner and the old rows stay.
  const revision = state.revision.value;
  useEffect(() => {
    let stale = false;
    api.api["drive-logs"]
      .$get({ query: { unassigned: "1" } })
      .then(okJson)
      .then(
        (loaded) => {
          if (stale) return;
          state.reportLoad(owner.current, false);
          setRows(loaded);
        },
        () => !stale && state.reportLoad(owner.current, true),
      );
    return () => {
      stale = true;
    };
  }, [revision]);
  useEffect(() => () => state.reportLoad(owner.current, false), [state]);
  if (rows === null) return null;
  const toggle = (id: number) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  /** One delete per ticked log (there is no bulk route). Rows that fail stay, ticked. */
  async function removeTicked() {
    setConfirming(false);
    const ids = [...ticked];
    const results = await Promise.all(
      ids.map((id) =>
        api.api.uploads[":id"]
          .$delete({ param: { id: String(id) } })
          .then((res) => res.ok)
          .catch(() => false),
      ),
    );
    const failed = ids.filter((_, i) => !results[i]);
    setTicked(new Set(failed));
    if (failed.length > 0) state.toast(`Couldn't delete ${count(failed.length, "drive log")}.`);
    await state.refresh();
    state.invalidate();
  }
  const explanation = (
    <p class="list-note">
      These Drive Logs are not assigned to a Vehicle. Tick the ones to assign or delete.
    </p>
  );
  if (rows.length === 0)
    return (
      <>
        {explanation}
        <p class="list-note">No unassigned drive logs.</p>
      </>
    );
  return (
    <>
      {explanation}
      <ul class="unassigned-list">
        {rows.map((r) => (
          <UnassignedRow
            key={r.id}
            row={r}
            ticked={ticked.has(r.id)}
            onToggle={() => toggle(r.id)}
          />
        ))}
      </ul>
      <div class="unassigned-actions">
        <button
          type="button"
          class="btn-primary"
          disabled={ticked.size === 0}
          onClick={() => setAssigning(true)}
        >
          Assign to{"…"}
        </button>
        <button
          type="button"
          class="btn-default"
          disabled={ticked.size === 0}
          onClick={() => setExporting(true)}
        >
          Export
        </button>
        <button
          type="button"
          class="btn-danger"
          disabled={ticked.size === 0}
          onClick={() => setConfirming(true)}
        >
          Delete
        </button>
      </div>
      {confirming && (
        <ConfirmSheet
          title={`Delete ${count(ticked.size, "Drive Log")}?`}
          goes={[
            ticked.size === 1
              ? "The original file and its parsed data."
              : "The original files and their parsed data.",
            ticked.size === 1 ? "Any Notes on it." : "Any Notes on them.",
          ]}
          confirmLabel="Delete"
          onConfirm={removeTicked}
          onCancel={() => setConfirming(false)}
        />
      )}
      {exporting && (
        <ExportSheet
          scope={{
            kind: "unassigned",
            logIds: rows.filter((r) => ticked.has(r.id)).map((r) => r.id),
          }}
          onClose={() => setExporting(false)}
        />
      )}
      {assigning && (
        <AssignSheet
          logIds={rows.filter((r) => ticked.has(r.id)).map((r) => r.id)}
          current={null}
          onClose={() => setAssigning(false)}
          onAssigned={() => setTicked(new Set())}
        />
      )}
    </>
  );
}
