// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { seriesColors } from "./series-colors.ts";

const setTokens = (colors: string[]) => {
  colors.forEach((c, i) => {
    document.documentElement.style.setProperty(`--c${i + 1}`, c);
  });
};

afterEach(() => {
  document.documentElement.removeAttribute("style");
});

describe("seriesColors", () => {
  it("reads --c1 to --c6 in order", () => {
    setTokens(["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"]);
    expect(seriesColors(6)).toEqual([
      "#111111",
      "#222222",
      "#333333",
      "#444444",
      "#555555",
      "#666666",
    ]);
  });

  it("gives only as many as asked for", () => {
    setTokens(["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"]);
    expect(seriesColors(2)).toEqual(["#111111", "#222222"]);
  });

  it("repeats from --c1 after six", () => {
    setTokens(["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"]);
    expect(seriesColors(8)).toEqual([
      "#111111",
      "#222222",
      "#333333",
      "#444444",
      "#555555",
      "#666666",
      "#111111",
      "#222222",
    ]);
  });
});
