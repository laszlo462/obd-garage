import { describe, expect, it } from "vitest";
import { appendPage } from "./paging.ts";

describe("appendPage", () => {
  it("adds the next page after the rows already shown", () => {
    expect(appendPage([{ id: 3 }, { id: 2 }], [{ id: 1 }])).toEqual([
      { id: 3 },
      { id: 2 },
      { id: 1 },
    ]);
  });

  it("drops ids it already has, so no row appears twice", () => {
    const rows = appendPage([{ id: 3 }, { id: 2 }], [{ id: 2 }, { id: 1 }, { id: 1 }]);
    expect(rows.map((r) => r.id)).toEqual([3, 2, 1]);
  });
});
