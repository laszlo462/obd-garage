import { describe, expect, it } from "vitest";
import { pickerPanels } from "./series.ts";

const channels = {
  speed: { label: "Vehicle speed", unit: "mph", values: [0, 10] },
  rpm: { label: "Engine speed", unit: "rpm", values: [800, 900] },
  ect: { label: "Coolant", unit: "°F", values: [180, 181] },
  iat: { label: "Intake air", unit: "°F", values: [70, 71] },
  load: { label: "Engine load", unit: "%", values: [20, 25.5] },
};

const preset = [
  { title: "Vehicle speed", unit: "mph", series: [{ key: "speed", label: "Speed" }] },
  {
    title: "Temperatures",
    unit: "°F",
    series: [
      { key: "ect", label: "ECT" },
      { key: "iat", label: "IAT" },
    ],
  },
];

/** Panel titles with the series of each as `key:colourIndex`. */
const shape = (charted: string[]) =>
  pickerPanels(preset, charted, channels).map((p) => [
    p.title,
    ...p.series.map((s) => `${s.key}:${s.index}`),
  ]);

/** The colour index of every charted key. */
const indexes = (charted: string[]) =>
  Object.fromEntries(
    pickerPanels(preset, charted, channels).flatMap((p) => p.series.map((s) => [s.key, s.index])),
  );

describe("pickerPanels", () => {
  it("keeps only the preset's charted series, each indexed by its place in the picker order", () => {
    expect(shape(["ect", "speed"])).toEqual([
      ["Vehicle speed", "speed:1"],
      ["Temperatures", "ect:0"],
    ]);
  });

  it("adds a Channel to the preset panel that holds it", () => {
    expect(shape(["speed", "ect", "iat"])[1]).toEqual(["Temperatures", "ect:1", "iat:2"]);
  });

  it("gives a charted Channel that is in no preset panel its own panel at the end", () => {
    const panels = pickerPanels(preset, ["speed", "load", "ect"], channels);
    expect(panels.map((p) => p.title)).toEqual(["Vehicle speed", "Temperatures", "Engine load"]);
    const last = panels[2];
    expect(last?.unit).toBe("%");
    expect(last?.series.map((s) => [s.key, s.label, s.unit, s.index])).toEqual([
      ["load", "Engine load", "%", 1],
    ]);
  });

  it("drops a panel whose last series was removed", () => {
    expect(shape(["speed"]).map((p) => p[0])).toEqual(["Vehicle speed"]);
  });

  it("carries each series' values and fixed-width format", () => {
    const [speed] = pickerPanels(preset, ["speed"], channels)[0]?.series ?? [];
    expect(speed?.values).toEqual([0, 10]);
    expect(speed?.format.format(5)).toBe(" 5");
  });

  it("leaves the colours of Channels already charted alone when one is added or the last is removed", () => {
    expect(indexes(["speed", "rpm"])).toEqual({ speed: 0, rpm: 1 });
    expect(indexes(["speed", "rpm", "ect"])).toEqual({ speed: 0, rpm: 1, ect: 2 });
    expect(indexes(["speed", "rpm", "ect", "load"])).toEqual({
      speed: 0,
      rpm: 1,
      ect: 2,
      load: 3,
    });
    expect(indexes(["speed", "rpm", "ect"])).toEqual({ speed: 0, rpm: 1, ect: 2 });
  });

  it("keeps counting past six, so the colour index repeats from --c1", () => {
    const many = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`c${i}`, { label: `C${i}`, unit: "", values: [i] }]),
    );
    const panels = pickerPanels([], Object.keys(many), many);
    expect(panels.flatMap((p) => p.series.map((s) => s.index))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("skips a charted key the log has no Channel for", () => {
    expect(shape(["speed", "gone"])).toEqual([["Vehicle speed", "speed:0"]]);
  });
});
