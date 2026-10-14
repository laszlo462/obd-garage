import { useEffect, useRef, useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import type { DriveLogDetail } from "./api-types.ts";

export type DriveLogLoad =
  | { state: "loading" }
  /** A failed load: the shell shows the banner, so the screen shows nothing of its own. */
  | { state: "error" }
  /** The server holds this upload as a Failed Upload (409); the screen shows its error inline. */
  | { state: "conflict"; message: string }
  | { state: "ready"; detail: DriveLogDetail };

/**
 * Load one Drive Log by id. Like `useReportLoad`: it reloads when the app-state `revision` changes (Retry),
 * ignores a stale answer, and reports a failure other than 409 to app state, which shows the one banner.
 */
export function useDriveLogLoad(id: number, enabled = true): DriveLogLoad {
  const api = useApi();
  const state = useAppState();
  const revision = state.revision.value;
  const [load, setLoad] = useState<{ key: string; value: DriveLogLoad } | null>(null);
  const owner = useRef({});
  useEffect(() => () => state.reportLoad(owner.current, false), [state]);
  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    const key = `${id}:${revision}`;
    const done = (value: DriveLogLoad, failed: boolean) => {
      if (stale) return;
      state.reportLoad(owner.current, failed);
      setLoad((prev) => ({
        key,
        value:
          failed && prev?.value.state === "ready" && prev.key.startsWith(`${id}:`)
            ? prev.value
            : value,
      }));
    };
    api.api["drive-logs"][":id"].$get({ param: { id: String(id) } }).then(
      async (res) => {
        if (res.ok)
          return done({ state: "ready", detail: (await res.json()) as DriveLogDetail }, false);
        if (res.status === 409) {
          const body = (await res.json()) as { error?: string };
          return done(
            { state: "conflict", message: body.error ?? "This Drive Log has no data." },
            false,
          );
        }
        done({ state: "error" }, true);
      },
      () => done({ state: "error" }, true),
    );
    return () => {
      stale = true;
    };
  }, [id, revision, enabled]);
  return load?.key.startsWith(`${id}:`) ? load.value : { state: "loading" };
}
