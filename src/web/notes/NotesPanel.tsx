import type { NoteView } from "../api-types.ts";
import { localDateTime } from "../format.ts";

/** The Notes on a whole upload (not pinned to a moment), oldest first, and the button that adds one. */
export function NotesPanel(props: {
  notes: readonly NoteView[];
  addLabel: string;
  onAdd(): void;
  onOpen(note: NoteView): void;
}) {
  const whole = props.notes
    .filter((n) => n.pinnedTimeSec === null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  return (
    <>
      <ul class="notes-list">
        {whole.map((n) => (
          <li key={n.id}>
            <button type="button" class="note-row" onClick={() => props.onOpen(n)}>
              <span class="note-text">{n.text}</span>
              <span class="note-added">{localDateTime(n.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class="btn-default" onClick={props.onAdd}>
        {props.addLabel}
      </button>
    </>
  );
}
