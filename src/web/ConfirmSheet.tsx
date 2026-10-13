import { Sheet } from "./Sheet.tsx";

export function ConfirmSheet(props: {
  title: string;
  goes: string[];
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet title={props.title} actionLabel="Cancel" onClose={props.onCancel}>
      <ul class="sheet-body">
        {props.goes.map((line) => (
          <li key={line} class="sheet-note">
            {line}
          </li>
        ))}
      </ul>
      <button type="button" class="btn-danger-fill" onClick={props.onConfirm}>
        {props.confirmLabel}
      </button>
    </Sheet>
  );
}
