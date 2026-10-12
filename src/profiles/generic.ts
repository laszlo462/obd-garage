import type { VehicleProfile } from "./types.ts";

export const GENERIC_PROFILE_ID = "generic";

/** Matches nothing, adds nothing, suggests no packs. The registry falls back to it. */
export const GENERIC: VehicleProfile = {
  id: GENERIC_PROFILE_ID,
  name: "Generic",
  matchesVin: () => false,
  hiddenColumns: [],
  defaultChartPreset: [],
  lookAlikeTolerances: {},
  suggestedPackIds: [],
};
