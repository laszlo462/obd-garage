import { useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import type { DriveLogDetail } from "./api-types.ts";
import { ConfirmSheet } from "./ConfirmSheet.tsx";
import { reportTitle } from "./format.ts";
import { Sheet } from "./Sheet.tsx";

/** The viewer's `…` sheet: Change Vehicle…, Download original and Delete… (which asks first). */
export function DriveLogMenuSheet(props: {
  detail: DriveLogDetail;
  onClose: () => void;
  /** Called after the server deleted the Drive Log and app state refreshed. */
  onDeleted: () => void;
  /** Called when Change Vehicle… is tapped; the caller closes this sheet and opens Assign to…. */
  onChangeVehicle: () => void;
  /** Called when Export this day… is tapped; the caller closes this sheet and opens the Export sheet. */
  onExport: () => void;
}) {
  const { detail } = props;
  const api = useApi();
  const state = useAppState();
  const [confirming, setConfirming] = useState(false);
  async function remove() {
    const deleted = await api.api.uploads[":id"]
      .$delete({ param: { id: String(detail.id) } })
      .then((res) => res.ok)
      .catch(() => false);
    props.onClose();
    if (!deleted) return state.toast("Couldn't delete the Drive Log.");
    props.onDeleted();
    await state.refresh();
    state.invalidate();
  }
  if (confirming)
    return (
      <ConfirmSheet
        title="Delete this Drive Log?"
        goes={[
          reportTitle(detail.recordedAt),
          "The original file and its parsed data.",
          "Any Notes on it.",
        ]}
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={props.onClose}
      />
    );
  return (
    <Sheet title="Drive Log" actionLabel="Close" onClose={props.onClose}>
      <div class="sheet-body">
        <button type="button" class="menu-row" onClick={props.onChangeVehicle}>
          Change Vehicle{"…"}
        </button>
        <button type="button" class="menu-row" onClick={props.onExport}>
          Export this day{"…"}
        </button>
        <a
          class="menu-row"
          href={api.api.uploads[":id"].original.$path({ param: { id: String(detail.id) } })}
          download
        >
          Download original
        </a>
        <button type="button" class="menu-row" onClick={() => setConfirming(true)}>
          Delete{"…"}
        </button>
      </div>
    </Sheet>
  );
}
