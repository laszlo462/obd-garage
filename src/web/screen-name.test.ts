import { describe, expect, it } from "vitest";
import { screenName } from "./screen-name.ts";

describe("screenName", () => {
  it("names the tab screens", () => {
    expect(screenName("/")).toBe("Recent");
    expect(screenName("/reports")).toBe("Reports");
    expect(screenName("/drive-logs")).toBe("Drive Logs");
  });

  it("names the pushed screens, ignoring a query string and a trailing slash", () => {
    expect(screenName("/vehicles")).toBe("Vehicles");
    expect(screenName("/vehicles/")).toBe("Vehicles");
    expect(screenName("/vehicles/8/settings")).toBe("Vehicle settings");
    expect(screenName("/unassigned")).toBe("Unassigned");
    expect(screenName("/failed-uploads?x=1")).toBe("Failed Uploads");
  });
});
