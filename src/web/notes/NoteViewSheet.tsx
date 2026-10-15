import type { NoteView } from "../api-types.ts";
import { localDateTime } from "../format.ts";
import { Sheet } from "../Sheet.tsx";

/** The Note view sheet: the text, the time when pinned, when it was added, then Edit and Delete. */
export function NoteViewSheet(props: {
  note: NoteView;
  /** The wall-clock time of a pinned Note's row; `null` for a Note on the whole upload. */
  time: string | null;
  onEdit(): void;
  onDelete(): void;
  onClose(): void;
}) {
  const { note } = props;
  return (
    <Sheet title="Note" actionLabel="Close" onClose={props.onClose}>
      <div class="sheet-body">
        <p class="note-view-text">{note.text}</p>
        {props.time !== null && <p class="sheet-note">{`At ${props.time}`}</p>}
        <p class="sheet-note">{`Added ${localDateTime(note.createdAt)}`}</p>
        <button type="button" class="btn-default" onClick={props.onEdit}>
          Edit
        </button>
        <button type="button" class="btn-danger" onClick={props.onDelete}>
          Delete
        </button>
      </div>
    </Sheet>
  );
}
