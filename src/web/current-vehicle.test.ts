import { describe, expect, it } from "vitest";
import { pickCurrentVehicle } from "./current-vehicle.ts";

const vehicles = [
  { id: 4, label: "2012 Ford F-250" },
  { id: 9, label: "2018 Honda Civic" },
];

describe("pickCurrentVehicle", () => {
  it("returns the stored Vehicle when it still exists", () => {
    expect(pickCurrentVehicle(vehicles, 9)?.label).toBe("2018 Honda Civic");
  });

  it("falls back to the first Vehicle when the stored id is gone", () => {
    expect(pickCurrentVehicle(vehicles, 77)?.id).toBe(4);
    expect(pickCurrentVehicle(vehicles, null)?.id).toBe(4);
  });

  it("returns none when there are no Vehicles", () => {
    expect(pickCurrentVehicle([], 4)).toBeUndefined();
  });
});
