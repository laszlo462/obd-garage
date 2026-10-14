import { useEffect, useRef, useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import type { ReportDetail, ReportRow } from "./api-types.ts";
import { okJson } from "./use-vehicle-load.ts";

export type ReportLoad =
  | { state: "loading" }
  /** A failed load: the shell shows the banner, so the screen shows nothing of its own. */
  | { state: "error" }
  /** The server holds this upload as a Failed Upload (409); the screen shows its error inline. */
  | { state: "conflict"; message: string }
  | { state: "ready"; detail: ReportDetail };

/**
 * The Reports of one Vehicle, newest first, for the compare bar. Null until loaded; a failure goes to the
 * shell banner like any other load and leaves the list empty.
 */
export function useVehicleReports(vehicleId: number | null): ReportRow[] | null {
  const api = useApi();
  const state = useAppState();
  const revision = state.revision.value;
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const owner = useRef({});
  useEffect(() => () => state.reportLoad(owner.current, false), [state]);
  useEffect(() => {
    if (vehicleId === null) return setRows([]);
    let stale = false;
    api.api.reports
      .$get({ query: { vehicle: String(vehicleId) } })
      .then(okJson)
      .then(
        (loaded) => {
          if (stale) return;
          state.reportLoad(owner.current, false);
          setRows(loaded);
        },
        () => {
          if (stale) return;
          state.reportLoad(owner.current, true);
          setRows((prev) => prev ?? []);
        },
      );
    return () => {
      stale = true;
    };
  }, [vehicleId, revision]);
  return rows;
}

/**
 * Load one Report by id. It reloads when the app-state `revision` changes (Retry) and ignores a stale answer.
 * A failure other than 409 is reported to app state, which shows the one banner.
 */
export function useReportLoad(id: number, enabled = true): ReportLoad {
  const api = useApi();
  const state = useAppState();
  const revision = state.revision.value;
  const [load, setLoad] = useState<{ key: string; value: ReportLoad } | null>(null);
  const owner = useRef({});
  useEffect(() => () => state.reportLoad(owner.current, false), [state]);
  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    const key = `${id}:${revision}`;
    const done = (value: ReportLoad, failed: boolean) => {
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
    api.api.reports[":id"].$get({ param: { id: String(id) } }).then(
      async (res) => {
        if (res.ok)
          return done({ state: "ready", detail: (await res.json()) as ReportDetail }, false);
        if (res.status === 409) {
          const body = (await res.json()) as { error?: string };
          return done(
            { state: "conflict", message: body.error ?? "This Report has no data." },
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
