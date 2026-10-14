import { GENERIC_PROFILE, type Profile } from "../core/derive.ts";
import type { RulePack } from "../core/rules.ts";
import { VEHICLE_PROFILES, type VehicleProfiles } from "../profiles/index.ts";
import { P0401_PACK } from "../rule-packs/6.7-p0401/index.ts";

/** What a Vehicle Profile's VIN matcher says about a VIN. */
export type VinMatch = { profileId: string; suggestedPackIds: readonly string[] };

/**
 * The seam between ingest and the Vehicle Profiles and Rule Packs. Ingest only
 * asks this interface, so it never imports a Profile or a pack.
 */
export type ProfileRegistry = {
  /** The Profile whose VIN matcher claims `vin`; the Generic Profile when none does. */
  matchVin(vin: string): VinMatch;
  /** `undefined` for an id the registry does not know (the caller falls back to Generic). */
  profile(id: string): (Profile & { hiddenColumns?: readonly string[] }) | undefined;
  pack(id: string): RulePack | undefined;
  /** Every Profile, for the settings picker. */
  profiles(): { id: string; name: string }[];
  /** Every Rule Pack, for the settings picker. */
  packs(): { id: string; name: string; description?: string }[];
};

export const GENERIC_PROFILE_ID = "generic";

/** The registry before any Profile exists: everything is Generic and there are no packs. */
export const GENERIC_ONLY_REGISTRY: ProfileRegistry = {
  matchVin: () => ({ profileId: GENERIC_PROFILE_ID, suggestedPackIds: [] }),
  profile: (id) => (id === GENERIC_PROFILE_ID ? GENERIC_PROFILE : undefined),
  pack: () => undefined,
  profiles: () => [{ id: GENERIC_PROFILE_ID, name: "Generic" }],
  packs: () => [],
};

/** Adapts the Vehicle Profiles and the given Rule Packs (by id) to the ingest seam. */
export function createProfileRegistry(
  profiles: VehicleProfiles,
  packs: ReadonlyMap<string, RulePack> = new Map(),
): ProfileRegistry {
  return {
    matchVin: (vin) => {
      const p = profiles.matchVin(vin);
      return { profileId: p.id, suggestedPackIds: p.suggestedPackIds };
    },
    profile: (id) => profiles.get(id),
    pack: (id) => packs.get(id),
    profiles: () => profiles.list().map((p) => ({ id: p.id, name: p.name })),
    packs: () =>
      [...packs.values()].map((p) => ({ id: p.id, name: p.name, description: p.description })),
  };
}

/** What the running server uses. */
export const DEFAULT_REGISTRY: ProfileRegistry = createProfileRegistry(
  VEHICLE_PROFILES,
  new Map([[P0401_PACK.id, P0401_PACK]]),
);
