import { convert } from "./units.ts";

/** Stable identifier of a Channel, e.g. `rpm`. Unmatched columns get `extra.<slug>`. */
export type ChannelKey = string;

export type ChannelDef = {
  key: ChannelKey;
  label: string;
  /** Header names (without the unit) OBDLink is known to use for this PID. Matched whole, ignoring case. */
  aliases: readonly string[];
};

export type ParsedHeader = { name: string; unit?: string };

export type HeaderMatch = {
  key: ChannelKey;
  /** The catalogue label, or the header's own name for an extra. */
  label: string;
  /** The exported unit; undefined when the header has none. */
  unit?: string;
  /** The header exactly as exported. */
  header: string;
  /** False for an extra: a column no alias claims. */
  known: boolean;
};

export type CatalogueExtension = {
  /** Vehicle-specific Channels, added with their own aliases. */
  channels?: readonly ChannelDef[];
  /** Extra aliases for any Channel in the catalogue, by key. */
  aliases?: Readonly<Record<ChannelKey, readonly string[]>>;
};

export type Catalogue = {
  channels: readonly ChannelDef[];
  match(header: string): HeaderMatch;
  /** Matches a whole header row. The first column claiming a key wins; later duplicates become distinct extras. */
  matchAll(headers: readonly string[]): HeaderMatch[];
};

/** Splits `Name (unit)` at the last bracket group. */
export function parseHeader(header: string): ParsedHeader {
  const text = header.trim();
  const m = /^(.*?)\s*\(([^()]*)\)$/.exec(text);
  if (!m) return { name: text };
  const name = (m[1] ?? "").trim();
  const unit = (m[2] ?? "").trim();
  return unit ? { name, unit } : { name };
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const slug = (s: string) =>
  norm(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Common SAE J1979 PIDs with OBDLink's generic header names. Vehicle-specific Channels belong in a Vehicle Profile. */
const STANDARD_CHANNELS: readonly ChannelDef[] = [
  { key: "time", label: "Time", aliases: ["Time"] },
  {
    key: "rpm",
    label: "Engine RPM",
    aliases: ["Engine RPM", "Engine Revolutions Per Minute", "Engine Revolutions"],
  },
  {
    key: "speed",
    label: "Vehicle speed",
    aliases: ["Vehicle speed", "Vehicle speed sensor", "Vehicle Speed Sensor"],
  },
  {
    key: "ect",
    label: "Engine coolant temperature",
    aliases: [
      "Engine coolant temperature",
      "Engine coolant temperature sensor 1",
      "Engine coolant temperature 1",
      "ECT",
    ],
  },
  {
    key: "iat",
    label: "Intake air temperature",
    aliases: ["Intake air temperature", "Intake air temperature sensor"],
  },
  {
    key: "load",
    label: "Engine load",
    // PID 04 only. Absolute load value (PID 43) is a different Channel and stays an extra.
    aliases: ["Engine load", "Calculated engine load", "Calculated load value"],
  },
  {
    key: "maf",
    label: "Mass air flow",
    aliases: ["Mass air flow sensor A", "Mass air flow sensor", "Mass air flow rate"],
  },
  {
    key: "map",
    label: "Intake manifold absolute pressure",
    aliases: [
      "Intake manifold absolute pressure",
      "Intake manifold absolute pressure A",
      "Intake manifold pressure",
    ],
  },
  {
    key: "baro",
    label: "Barometric pressure",
    aliases: ["Barometric pressure", "Absolute barometric pressure"],
  },
  {
    key: "throttle",
    label: "Throttle position",
    // PID 11 only. Absolute throttle position B (PID 47) is a different sensor.
    aliases: ["Throttle position", "Absolute throttle position"],
  },
  {
    key: "app",
    label: "Accelerator pedal position",
    aliases: ["Accelerator pedal position D", "Accelerator pedal position"],
  },
  {
    key: "fuelLevel",
    label: "Fuel level",
    aliases: ["Fuel level input", "Fuel tank level input", "Fuel level"],
  },
  { key: "oilTemp", label: "Engine oil temperature", aliases: ["Engine oil temperature"] },
  { key: "ambientTemp", label: "Ambient air temperature", aliases: ["Ambient air temperature"] },
  { key: "voltage", label: "Control module voltage", aliases: ["Control module voltage"] },
  {
    key: "runTime",
    label: "Run time since engine start",
    aliases: ["Run time since engine start", "Time since engine start"],
  },
  {
    key: "dpfRegen",
    label: "DPF regeneration status",
    aliases: ["Diesel particulate filter regeneration status", "DPF regeneration status"],
  },
  { key: "dpfSoot", label: "DPF soot", aliases: ["DPF soot", "Diesel particulate filter soot"] },
];

/** Builds a catalogue from the standard Channels plus a Vehicle Profile's additions. */
export function createCatalogue(extension: CatalogueExtension = {}): Catalogue {
  const channels = [...STANDARD_CHANNELS];
  const byKey = new Map<ChannelKey, ChannelDef>();
  const byAlias = new Map<string, ChannelKey>();

  const addAlias = (key: ChannelKey, alias: string) => {
    const n = norm(alias);
    const owner = byAlias.get(n);
    if (owner !== undefined && owner !== key) {
      throw new Error(
        `Alias "${alias}" already belongs to channel "${owner}", cannot add it to "${key}"`,
      );
    }
    byAlias.set(n, key);
  };

  const register = (def: ChannelDef) => {
    if (byKey.has(def.key)) throw new Error(`Channel "${def.key}" already exists`);
    byKey.set(def.key, def);
    for (const a of def.aliases) addAlias(def.key, a);
  };

  for (const def of STANDARD_CHANNELS) register(def);
  for (const def of extension.channels ?? []) {
    register(def);
    channels.push(def);
  }
  for (const [key, aliases] of Object.entries(extension.aliases ?? {})) {
    if (!byKey.has(key)) throw new Error(`Cannot add aliases to unknown channel "${key}"`);
    for (const a of aliases) addAlias(key, a);
  }

  const match = (header: string): HeaderMatch => {
    const { name, unit } = parseHeader(header);
    const key = byAlias.get(norm(name));
    const base = unit === undefined ? { header } : { unit, header };
    if (key !== undefined)
      return { key, label: byKey.get(key)?.label ?? name, ...base, known: true };
    return { key: `extra.${slug(name)}`, label: name, ...base, known: false };
  };

  const matchAll = (headers: readonly string[]): HeaderMatch[] => {
    const used = new Set<ChannelKey>();
    return headers.map((h) => {
      const m = match(h);
      if (!used.has(m.key)) {
        used.add(m.key);
        return m;
      }
      // A duplicate of a known key is demoted to an extra; a duplicate extra gets a numeric suffix.
      const stem = `extra.${slug(parseHeader(h).name)}`;
      let key = stem;
      for (let n = 2; used.has(key); n++) key = `${stem}-${n}`;
      used.add(key);
      return { ...m, key, known: false };
    });
  };

  return { channels, match, matchAll };
}

export const STANDARD_CATALOGUE: Catalogue = createCatalogue();

export type LogColumn = { unit?: string; values: readonly number[] };
export type ChannelView = ReadonlyMap<ChannelKey, LogColumn>;
export type ChannelResult = { ok: true; values: number[] } | { ok: false; reason: string };

/** What rules call: a Channel's values in the requested unit, or "not applicable" with the reason. */
export function channel(log: ChannelView, key: ChannelKey, unit: string): ChannelResult {
  const column = log.get(key);
  if (!column) return { ok: false, reason: `no "${key}" channel in this log` };
  if (column.unit === undefined) {
    return {
      ok: false,
      reason: `"${key}" has no unit in this log, so it cannot be read as "${unit}"`,
    };
  }
  const converted = convert(column.values, column.unit, unit);
  if (!converted.ok) return { ok: false, reason: `"${key}": ${converted.reason}` };
  return converted;
}
