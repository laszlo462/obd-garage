import { useEffect, useRef, useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";

export type Loaded<T> = { state: "loading" } | { state: "error" } | { state: "ready"; data: T };

/**
 * Load a Current Vehicle's data. It reloads when the Current Vehicle or the app-state `revision`
 * changes, and ignores an answer that arrives after either has moved on.
 * A failed load is reported to app state (the shell shows the banner). A failed reload of the same
 * Vehicle keeps the last data, so the screen keeps its rows under the banner.
 */
export function useVehicleLoad<T>(load: (vehicleId: number) => Promise<T>): {
  vehicleId: number | undefined;
  result: Loaded<T>;
} {
  const state = useAppState();
  const vehicleId = state.currentVehicle.value?.id;
  const revision = state.revision.value;
  const [result, setResult] = useState<{ key: string; value: Loaded<T> } | null>(null);
  const owner = useRef({});
  useEffect(() => () => state.reportLoad(owner.current, false), [state]);
  useEffect(() => {
    if (vehicleId === undefined) return;
    let stale = false;
    const key = `${vehicleId}:${revision}`;
    load(vehicleId).then(
      (data) => {
        if (stale) return;
        state.reportLoad(owner.current, false);
        setResult({ key, value: { state: "ready", data } });
      },
      () => {
        if (stale) return;
        state.reportLoad(owner.current, true);
        setResult((prev) => {
          const kept =
            prev?.key.startsWith(`${vehicleId}:`) && prev.value.state === "ready"
              ? prev.value
              : null;
          return { key, value: kept ?? { state: "error" } };
        });
      },
    );
    return () => {
      stale = true;
    };
  }, [vehicleId, revision]);
  // Data of another Vehicle is never shown: it counts as still loading.
  const own = result?.key.startsWith(`${vehicleId}:`) ? result.value : null;
  return { vehicleId, result: own ?? { state: "loading" } };
}

/** Throw on an HTTP error so a failed load becomes the error state. The type drops the `{ error }` bodies. */
export async function okJson<R extends { ok: boolean; json(): Promise<unknown> }>(
  res: R,
): Promise<Exclude<Awaited<ReturnType<R["json"]>>, { error: string }>> {
  if (!res.ok) throw new Error("Request failed.");
  return (await res.json()) as Exclude<Awaited<ReturnType<R["json"]>>, { error: string }>;
}
