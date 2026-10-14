import { describe, expect, it } from "vitest";
import { parkedSheet } from "./parked-sheet.ts";

const parked = (seenSettings: boolean) => ({ vehicleId: 5, ticked: [11], seenSettings });

describe("parkedSheet", () => {
  it("hides the sheet in the instant between the Change tap and the route change", () => {
    expect(parkedSheet(parked(false), "/", [1, 5])).toBe("hide");
  });

  it("hides the sheet while the path is that Vehicle's settings", () => {
    expect(parkedSheet(parked(true), "/vehicles/5/settings", [1, 5])).toBe("hide");
    expect(parkedSheet(parked(false), "/vehicles/5/settings", [1, 5])).toBe("hide");
  });

  it("drops the sheet when the Vehicle is no longer in the app state", () => {
    expect(parkedSheet(parked(true), "/vehicles", [1])).toBe("drop");
    expect(parkedSheet(parked(true), "/vehicles/5/settings", [1])).toBe("drop");
  });

  it("shows the sheet once settings were seen and the path is anything else", () => {
    expect(parkedSheet(parked(true), "/", [1, 5])).toBe("show");
    expect(parkedSheet(parked(true), "/vehicles", [1, 5])).toBe("show");
  });
});
