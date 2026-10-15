import { useState } from "preact/hooks";
import type { NoteView } from "../api-types.ts";
import { ConfirmSheet } from "../ConfirmSheet.tsx";
import { NoteSheet } from "./NoteSheet.tsx";
import { NoteViewSheet } from "./NoteViewSheet.tsx";
import type { useNotes } from "./use-notes.ts";

type Dialog =
  | { kind: "add"; title: string; pinnedAt: number | null }
  | { kind: "view"; note: NoteView }
  | { kind: "edit"; note: NoteView }
  | { kind: "delete"; note: NoteView };

/** "Note at 17:44:44" for a pinned Note, else "Note". */
export const noteTitle = (time: string | null) => (time === null ? "Note" : `Note at ${time}`);

/**
 * The Note sheets of a viewer. `openAdd` opens the Note sheet for a new Note, pinned to `pinnedAt` (the raw
 * `Time (sec)` of a row) or on the whole upload when `null`; `openView` opens Note view. Render `dialogs`
 * once in the viewer.
 */
export function useNoteDialogs(
  notes: ReturnType<typeof useNotes>,
  /** The wall-clock time of a pinned Note's row, or `null` for a Note on the whole upload. */
  timeOf: (note: NoteView) => string | null = () => null,
) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);
  return {
    openAdd: (pinnedAt: number | null, title = "Note") =>
      setDialog({ kind: "add", title, pinnedAt }),
    openView: (note: NoteView) => setDialog({ kind: "view", note }),
    dialogs:
      dialog?.kind === "add" ? (
        <NoteSheet
          title={dialog.title}
          initial=""
          onSave={(text) => notes.add(text, dialog.pinnedAt)}
          onClose={close}
        />
      ) : dialog?.kind === "edit" ? (
        <NoteSheet
          title={noteTitle(timeOf(dialog.note))}
          initial={dialog.note.text}
          onSave={(text) => notes.edit(dialog.note.id, text)}
          onClose={close}
        />
      ) : dialog?.kind === "view" ? (
        <NoteViewSheet
          note={dialog.note}
          time={timeOf(dialog.note)}
          onEdit={() => setDialog({ kind: "edit", note: dialog.note })}
          onDelete={() => setDialog({ kind: "delete", note: dialog.note })}
          onClose={close}
        />
      ) : dialog?.kind === "delete" ? (
        <ConfirmSheet
          title="Delete this Note?"
          goes={[dialog.note.text]}
          confirmLabel="Delete"
          onConfirm={async () => {
            await notes.remove(dialog.note.id);
            close();
          }}
          onCancel={close}
        />
      ) : null,
  };
}
