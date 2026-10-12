import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRY, GENERIC_PROFILE_ID } from "./registry.ts";

describe("DEFAULT_REGISTRY", () => {
  it("answers a 6.7 VIN with the 6.7 Profile and its suggested pack", () => {
    const m = DEFAULT_REGISTRY.matchVin("1FT7W2BT5CE000001");
    expect(m).toEqual({ profileId: "6.7", suggestedPackIds: ["p0401"] });
    expect(DEFAULT_REGISTRY.profile(m.profileId)?.decodeFixes).toHaveLength(1);
  });

  it("answers any other VIN with Generic", () => {
    expect(DEFAULT_REGISTRY.matchVin("1FTFW1ET0CFA00001")).toEqual({
      profileId: GENERIC_PROFILE_ID,
      suggestedPackIds: [],
    });
  });

  it("resolves Generic by id and an unknown id to nothing", () => {
    expect(DEFAULT_REGISTRY.profile(GENERIC_PROFILE_ID)).toBeDefined();
    expect(DEFAULT_REGISTRY.profile("nope")).toBeUndefined();
  });
});
