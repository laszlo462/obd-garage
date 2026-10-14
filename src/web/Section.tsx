import type { ComponentChildren } from "preact";

/**
 * A collapsible panel: a summary row with the title and a right-hand count badge, then the body.
 * The browser keeps the open state, so it is local to the panel; `defaultOpen` sets only the first one.
 */
export function Section(props: {
  title: string;
  count?: number | string;
  defaultOpen?: boolean;
  children: ComponentChildren;
}) {
  return (
    <details class="section" open={props.defaultOpen}>
      <summary>
        <span class="section-title">{props.title}</span>
        {props.count !== undefined && <span class="count">{props.count}</span>}
      </summary>
      <div class="section-body">{props.children}</div>
    </details>
  );
}
