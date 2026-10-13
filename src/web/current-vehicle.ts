/** The stored Vehicle if it still exists, else the first one, else none. */
export function pickCurrentVehicle<V extends { id: number }>(
  vehicles: V[],
  storedId: number | null,
): V | undefined {
  return vehicles.find((v) => v.id === storedId) ?? vehicles[0];
}
