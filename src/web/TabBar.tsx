import { Activity, Clock, FileText, Plus } from "lucide-preact";
import { useRef } from "preact/hooks";
import { useLocation } from "preact-iso";
import { useUploadFlow } from "./use-upload-flow.tsx";

export const TABS = [
  { path: "/", label: "Recent", Icon: Clock },
  { path: "/reports", label: "Reports", Icon: FileText },
  { path: "/drive-logs", label: "Drive Logs", Icon: Activity },
] as const;

/** Tab routes show the tabs and the Vehicle switcher; every other route is a pushed screen. */
export const isTabPath = (path: string) => TABS.some((tab) => tab.path === path);

export function Tabs() {
  const { path } = useLocation();
  return (
    <div role="tablist">
      {TABS.map(({ path: href, label, Icon }) => (
        <a key={href} class="bar-control tab" role="tab" href={href} aria-selected={path === href}>
          <Icon aria-hidden="true" size={24} strokeWidth={1.8} />
          {label}
        </a>
      ))}
    </div>
  );
}

/** Opens the Files picker; never navigates. `+ Add` sits in the app bar, `Add` in the tab bar. */
export function AddButton(props: { label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const flow = useUploadFlow();
  return (
    <>
      <button type="button" class="add-button" onClick={() => input.current?.click()}>
        {props.label === "Add" && (
          <span class="plus">
            <Plus aria-hidden="true" size={20} strokeWidth={1.8} />
          </span>
        )}
        {props.label}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label="Choose files"
        onChange={(e) => {
          const files = [...(e.currentTarget.files ?? [])];
          // Copy first: the FileList is live. Then reset, so the same file can be picked again.
          e.currentTarget.value = "";
          void flow.pick(files);
        }}
      />
      {flow.sheets}
    </>
  );
}

export function TabBar() {
  return (
    <nav class="tab-bar">
      <Tabs />
      <AddButton label="Add" />
    </nav>
  );
}
