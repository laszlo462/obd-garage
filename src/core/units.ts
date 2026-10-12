/** One tested unit table. Add a unit by adding a row; never convert anywhere else. */

export type Conversion = { ok: true; values: number[] } | { ok: false; reason: string };

type UnitDef = { quantity: string; toBase: (x: number) => number; fromBase: (x: number) => number };

const scale = (factor: number) => ({
  toBase: (x: number) => x * factor,
  fromBase: (x: number) => x / factor,
});

// Base units: °C, kPa, km/h.
const UNITS: Record<string, UnitDef> = {
  "°C": { quantity: "temperature", toBase: (x) => x, fromBase: (x) => x },
  "°F": {
    quantity: "temperature",
    toBase: (x) => ((x - 32) * 5) / 9,
    fromBase: (x) => (x * 9) / 5 + 32,
  },
  kPa: { quantity: "pressure", ...scale(1) },
  inHg: { quantity: "pressure", ...scale(3.386389) },
  psi: { quantity: "pressure", ...scale(6.894757) },
  "km/h": { quantity: "speed", ...scale(1) },
  mph: { quantity: "speed", ...scale(1.609344) },
};

const SPELLINGS: Record<string, string> = {
  c: "°C",
  degc: "°C",
  "°c": "°C",
  f: "°F",
  degf: "°F",
  "°f": "°F",
  kpa: "kPa",
  inhg: "inHg",
  psi: "psi",
  "km/h": "km/h",
  kph: "km/h",
  kmh: "km/h",
  mph: "mph",
};

/** Maps a unit as written in an export to the table's spelling; unknown units come back trimmed. */
export function normaliseUnit(unit: string): string {
  const trimmed = unit.trim();
  return SPELLINGS[trimmed.toLowerCase()] ?? trimmed;
}

/** Converts `values` between units. Unknown or cross-quantity pairs give `ok: false`, never a guess. */
export function convert(values: readonly number[], from: string, to: string): Conversion {
  const f = normaliseUnit(from);
  const t = normaliseUnit(to);
  // Units outside the table (rpm, %) only match themselves; exports vary the case ("RPM", "rpm").
  if (f.toLowerCase() === t.toLowerCase()) return { ok: true, values: [...values] };
  const fromUnit = UNITS[f];
  const toUnit = UNITS[t];
  if (!fromUnit || !toUnit || fromUnit.quantity !== toUnit.quantity) {
    return { ok: false, reason: `cannot convert from "${from}" to "${to}"` };
  }
  return { ok: true, values: values.map((v) => toUnit.fromBase(fromUnit.toBase(v))) };
}
