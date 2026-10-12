import { describe, expect, it } from "vitest";
import { channel, createCatalogue, parseHeader, STANDARD_CATALOGUE } from "./channels.ts";

describe("parseHeader", () => {
  it("splits a header into name and unit", () => {
    expect(parseHeader("Engine RPM (RPM)")).toEqual({ name: "Engine RPM", unit: "RPM" });
    expect(parseHeader("  Vehicle speed (mph) ")).toEqual({ name: "Vehicle speed", unit: "mph" });
    expect(parseHeader("Intake air temperature (°F)")).toEqual({
      name: "Intake air temperature",
      unit: "°F",
    });
  });

  it("uses the last bracket as the unit", () => {
    expect(parseHeader("Cooler bypass (bank 1) (%)")).toEqual({
      name: "Cooler bypass (bank 1)",
      unit: "%",
    });
  });

  it("leaves unit undefined when there is none", () => {
    expect(parseHeader("DPF regeneration status")).toEqual({ name: "DPF regeneration status" });
    expect(parseHeader("Name ()")).toEqual({ name: "Name" });
  });
});

describe("standard catalogue matching", () => {
  it("matches the name variants seen in real exports, ignoring case and whitespace", () => {
    const maf = [
      "Mass air flow sensor A (lb/min)",
      "Mass Air Flow Sensor A (lb/min)",
      "  MASS AIR FLOW SENSOR A  (lb/min) ",
    ];
    for (const h of maf) expect(STANDARD_CATALOGUE.match(h).key, h).toBe("maf");
    const rpm = ["Engine RPM (RPM)", "Engine Revolutions Per Minute (RPM)", "engine rpm (rpm)"];
    for (const h of rpm) expect(STANDARD_CATALOGUE.match(h).key, h).toBe("rpm");
  });

  it("returns the exported unit and the header as written", () => {
    const m = STANDARD_CATALOGUE.match("Vehicle speed (mph)");
    expect(m).toMatchObject({
      key: "speed",
      unit: "mph",
      header: "Vehicle speed (mph)",
      known: true,
    });
  });

  it("covers the core channels", () => {
    const keys = new Set(STANDARD_CATALOGUE.channels.map((c) => c.key));
    for (const k of ["time", "rpm", "speed", "ect", "load", "maf", "map", "dpfRegen"]) {
      expect(keys.has(k), k).toBe(true);
    }
  });

  it("keeps an unmatched column as an extra under a derived key, with its header label", () => {
    const m = STANDARD_CATALOGUE.match("Some Ford Thing 7 (V)");
    expect(m).toMatchObject({
      key: "extra.some-ford-thing-7",
      label: "Some Ford Thing 7",
      unit: "V",
      known: false,
    });
  });

  it("does not match on a prefix", () => {
    expect(STANDARD_CATALOGUE.match("Engine RPM limit (RPM)").known).toBe(false);
  });
});

describe("matchAll", () => {
  it("first duplicate wins the key; later ones become distinct extras", () => {
    const out = STANDARD_CATALOGUE.matchAll([
      "Time (sec)",
      "Mass air flow sensor A (lb/min)",
      "Mass Air Flow Sensor A (lb/min)",
      "Odd (x)",
      "Odd (x)",
    ]);
    expect(out.map((m) => m.key)).toEqual([
      "time",
      "maf",
      "extra.mass-air-flow-sensor-a",
      "extra.odd",
      "extra.odd-2",
    ]);
    expect(out.map((m) => m.known)).toEqual([true, true, false, false, false]);
  });
});

describe("Vehicle Profile extension point", () => {
  const header = "Actual EGR Valve Pos (%)";

  it("the core alone leaves a profile's header as an extra", () => {
    expect(STANDARD_CATALOGUE.match(header).known).toBe(false);
  });

  it("an added alias maps it to an existing channel", () => {
    const cat = createCatalogue({ aliases: { rpm: ["Crank speed"] } });
    expect(cat.match("CRANK SPEED (RPM)").key).toBe("rpm");
    expect(STANDARD_CATALOGUE.match("Crank speed (RPM)").known).toBe(false);
  });

  it("adds vehicle-specific channels with their aliases", () => {
    const cat = createCatalogue({
      channels: [{ key: "egrAct", label: "Actual EGR", aliases: ["Actual EGR Valve Pos"] }],
    });
    expect(cat.match(header)).toMatchObject({
      key: "egrAct",
      label: "Actual EGR",
      known: true,
      unit: "%",
    });
    expect(cat.channels.some((c) => c.key === "rpm")).toBe(true);
  });

  it("rejects a clash that would make matching ambiguous", () => {
    expect(() => createCatalogue({ aliases: { speed: ["Engine RPM"] } })).toThrow(/Engine RPM/);
    expect(() => createCatalogue({ channels: [{ key: "rpm", label: "x", aliases: [] }] })).toThrow(
      /rpm/,
    );
    expect(() => createCatalogue({ aliases: { nope: ["x"] } })).toThrow(/nope/);
  });
});

describe("channel accessor", () => {
  const log = new Map([
    ["ect", { unit: "°F", values: [158, 212] }],
    ["rpm", { unit: "RPM", values: [800, 900] }],
  ]);

  it("returns the values converted to the requested unit", () => {
    expect(channel(log, "ect", "°C")).toEqual({ ok: true, values: [70, 100] });
  });

  it("returns exported values when the unit already matches", () => {
    expect(channel(log, "rpm", "RPM")).toEqual({ ok: true, values: [800, 900] });
  });

  it("is not applicable, with a reason, when the channel is missing", () => {
    const r = channel(log, "maf", "g/s");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("maf");
  });

  it("is not applicable, naming the unit, when it cannot convert", () => {
    const r = channel(log, "rpm", "kPa");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("RPM");
      expect(r.reason).toContain("kPa");
    }
    const noUnit = channel(new Map([["x", { values: [1] }]]), "x", "kPa");
    expect(noUnit.ok).toBe(false);
  });
});
