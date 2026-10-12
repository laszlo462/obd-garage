import { GENERIC_PROFILE, type Profile } from "../core/derive.ts";
import type { RulePack } from "../core/rules.ts";
import { VEHICLE_PROFILES, type VehicleProfiles } from "../profiles/index.ts";

/** What a Vehicle Profile's VIN matcher says about a VIN. */
export type VinMatch = { profileId: string; suggestedPackIds: readonly string[] };

/**
 * The seam between ingest and the Vehicle Profiles and Rule Packs (built in their own slices). Ingest only
 * asks this interface, so it never imports a Profile or a pack.
 */
export type ProfileRegistry = {
  /** The Profile whose VIN matcher claims `vin`; the Generic Profile when none does. */
  matchVin(vin: string): VinMatch;
  /** `undefined` for an id the registry does not know (the caller falls back to Generic). */
  profile(id: string): Profile | undefined;
  pack(id: string): RulePack | undefined;
};

export const GENERIC_PROFILE_ID = "generic";

/** The registry before any Profile exists: everything is Generic and there are no packs. */
export const GENERIC_ONLY_REGISTRY: ProfileRegistry = {
  matchVin: () => ({ profileId: GENERIC_PROFILE_ID, suggestedPackIds: [] }),
  profile: (id) => (id === GENERIC_PROFILE_ID ? GENERIC_PROFILE : undefined),
  pack: () => undefined,
};

/** Adapts the Vehicle Profiles to the ingest seam. Rule Packs have no home yet, so none resolve. */
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
  };
}

/** What the running server uses. */
export const DEFAULT_REGISTRY: ProfileRegistry = createProfileRegistry(VEHICLE_PROFILES);
