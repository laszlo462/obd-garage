import { useEffect, useState } from "preact/hooks";
import { useApi } from "./api.tsx";
import type { ProfileRow, RulePackRow } from "./api-types.ts";
import { okJson } from "./use-vehicle-load.ts";

export type Catalogue = { profiles: ProfileRow[]; rulePacks: RulePackRow[] };

/** The Profiles and Rule Packs the server knows, or null until they load. */
export function useCatalogue(): Catalogue | null {
  const api = useApi();
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  useEffect(() => {
    Promise.all([api.api.profiles.$get().then(okJson), api.api["rule-packs"].$get().then(okJson)])
      .then(([profiles, rulePacks]) => setCatalogue({ profiles, rulePacks }))
      .catch(() => {});
  }, []);
  return catalogue;
}
