import { GENERIC_PROFILE, type Profile } from "../core/derive.ts";
import type { RulePack } from "../core/rules.ts";

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
