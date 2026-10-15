import { useEffect, useRef, useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import type { ProfileRow, RulePackRow } from "./api-types.ts";
import { okJson } from "./use-vehicle-load.ts";

export type Catalogue = { profiles: ProfileRow[]; rulePacks: RulePackRow[] };

/** A Profile's name, or its id until the catalogue loads or when the catalogue doesn't know it. */
export const profileName = (catalogue: Catalogue | null, id: string) =>
  catalogue?.profiles.find((p) => p.id === id)?.name ?? id;

/** A Rule Pack's name, or its id until the catalogue loads or when the catalogue doesn't know it. */
export const rulePackName = (catalogue: Catalogue | null, id: string) =>
  catalogue?.rulePacks.find((p) => p.id === id)?.name ?? id;

/**
 * The Profiles and Rule Packs the server knows, or null until they load. A failed load is reported
 * to app state (the shell shows the banner), and it reloads when the app-state `revision` changes,
 * so the banner's Retry fetches it again.
 */
export function useCatalogue(): Catalogue | null {
  const api = useApi();
  const state = useAppState();
  const revision = state.revision.value;
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const owner = useRef({});
  useEffect(() => () => state.reportLoad(owner.current, false), [state]);
  useEffect(() => {
    let stale = false;
    Promise.all([api.api.profiles.$get().then(okJson), api.api["rule-packs"].$get().then(okJson)])
      .then(([profiles, rulePacks]) => {
        if (stale) return;
        state.reportLoad(owner.current, false);
        setCatalogue({ profiles, rulePacks });
      })
      .catch(() => {
        if (!stale) state.reportLoad(owner.current, true);
      });
    return () => {
      stale = true;
    };
  }, [revision]);
  return catalogue;
}
