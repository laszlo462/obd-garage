/** A New vehicle sheet set aside while the owner is in that Vehicle's settings. */
export type Parked = { vehicleId: number; ticked: number[]; seenSettings: boolean };

export function parkedSheet(
  parked: Parked,
  path: string,
  vehicleIds: readonly number[],
): "hide" | "show" | "drop" {
  if (!vehicleIds.includes(parked.vehicleId)) return "drop";
  if (path === `/vehicles/${parked.vehicleId}/settings`) return "hide";
  return parked.seenSettings ? "show" : "hide";
}
