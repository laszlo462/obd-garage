import { useEffect, useRef, useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";

export type DetailLoad<T> =
  | { state: "loading" }
  /** A failed load: the shell shows the banner, so the screen shows nothing of its own. */
  | { state: "error" }
  /** The server holds this upload as a Failed Upload (409); the screen shows its error inline. */
  | { state: "conflict"; message: string }
  | { state: "ready"; detail: T };

/**
 * Load the detail of one upload (a Report or a Drive Log) by id. `fetchDetail` makes the typed client call; the
 * body of a 200 is the detail. It reloads when the app-state `revision` changes (Retry) and ignores a stale
 * answer. A failure other than 409 is reported to app state, which shows the one banner; a failed reload keeps
 * the detail already on screen. `noData` is the line shown when the server answers 409 without a message.
 */
export function useDetailLoad<T>(
  id: number,
  enabled: boolean,
  fetchDetail: (id: number) => Promise<Response>,
  noData: string,
): DetailLoad<T> {
  const state = useAppState();
  const revision = state.revision.value;
  const [load, setLoad] = useState<{ key: string; value: DetailLoad<T> } | null>(null);
  const owner = useRef({});
  const fetcher = useRef(fetchDetail);
  fetcher.current = fetchDetail;
  useEffect(() => () => state.reportLoad(owner.current, false), [state]);
  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    const key = `${id}:${revision}`;
    const done = (value: DetailLoad<T>, failed: boolean) => {
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
    fetcher.current(id).then(
      async (res) => {
        if (res.ok) return done({ state: "ready", detail: (await res.json()) as T }, false);
        if (res.status === 409) {
          const body = (await res.json()) as { error?: string };
          return done({ state: "conflict", message: body.error ?? noData }, false);
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
