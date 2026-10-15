import { NotesPanel } from "./NotesPanel.tsx";
import { useNoteDialogs } from "./use-note-dialogs.tsx";
import { useNotes } from "./use-notes.ts";

/** The Report viewer's Notes section body: the Report's Notes, with Add Note. */
export function ReportNotes(props: { uploadId: number }) {
  const notes = useNotes(props.uploadId);
  const { openAdd, openView, dialogs } = useNoteDialogs(notes);
  return (
    <>
      <NotesPanel
        notes={notes.notes}
        addLabel="Add Note"
        onAdd={() => openAdd(null)}
        onOpen={openView}
      />
      {dialogs}
    </>
  );
}
