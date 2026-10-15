import { useState } from "preact/hooks";
import { Sheet } from "../Sheet.tsx";

/** The Note sheet: a plain-text field with Save and Cancel. It closes itself once `onSave` answers true. */
export function NoteSheet(props: {
  title: string;
  initial: string;
  onSave(text: string): Promise<boolean>;
  onClose(): void;
}) {
  const [text, setText] = useState(props.initial);
  return (
    <Sheet title={props.title} actionLabel="Cancel" onClose={props.onClose}>
      <div class="sheet-body">
        <textarea
          class="note-field"
          aria-label="Note"
          rows={5}
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button
          type="button"
          class="btn-primary"
          disabled={text.trim() === ""}
          onClick={async () => {
            if (await props.onSave(text)) props.onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}
