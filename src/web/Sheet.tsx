import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusable = (root: HTMLElement | null) =>
  root ? [...root.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];

export function Sheet(props: {
  title: string;
  actionLabel: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const opener = document.activeElement;
    dialog.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the scrim click is a pointer shortcut; keyboard users close with Escape or the header action.
    <div
      class="scrim"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-label={props.title}
        onKeyDown={(e) => {
          if (e.key === "Escape") props.onClose();
          if (e.key === "Tab") {
            const items = focusable(dialog.current);
            const edge = e.shiftKey ? items[0] : items.at(-1);
            if (document.activeElement === edge) {
              e.preventDefault();
              (e.shiftKey ? items.at(-1) : items[0])?.focus();
            }
          }
        }}
      >
        <div class="grab" aria-hidden="true" />
        <header class="sheet-header">
          <h2>{props.title}</h2>
          <button type="button" onClick={props.onClose}>
            {props.actionLabel}
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}
