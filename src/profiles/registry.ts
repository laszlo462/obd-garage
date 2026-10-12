import { GENERIC } from "./generic.ts";
import { SIX_SEVEN } from "./six-seven.ts";
import type { VehicleProfile } from "./types.ts";

export type VehicleProfiles = {
  /** The first Profile whose VIN matcher claims `vin`; Generic when none does. */
  matchVin(vin: string): VehicleProfile;
  get(id: string): VehicleProfile | undefined;
  /** Every Profile, the fallback last. */
  list(): readonly VehicleProfile[];
};

/** Profiles in order. The first VIN match wins, so put narrower matchers first. */
export function createVehicleProfiles(
  profiles: readonly VehicleProfile[],
  fallback: VehicleProfile = GENERIC,
): VehicleProfiles {
  return {
    matchVin: (vin) => profiles.find((p) => p.matchesVin(vin)) ?? fallback,
    get: (id) => [...profiles, fallback].find((p) => p.id === id),
    list: () => [...profiles, fallback],
  };
}

export const VEHICLE_PROFILES: VehicleProfiles = createVehicleProfiles([SIX_SEVEN]);
