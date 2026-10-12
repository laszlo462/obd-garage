import { type ChannelDef, createCatalogue } from "../core/channels.ts";
import type { DecodeFix } from "../core/derive.ts";
import type { VehicleProfile } from "./types.ts";

export const SIX_SEVEN_PROFILE_ID = "6.7";
/** The "6.7 P0401" Rule Pack. The pack itself lands in its own slice. */
export const P0401_PACK_ID = "p0401";

/**
 * 2011-2016 Ford Super Duty with the 6.7L Power Stroke diesel, from the VIN (17 characters, upper case).
 * Positions are 1-based. Verified against NHTSA vPIC (https://vpic.nhtsa.dot.gov/api/, DecodeVinValues):
 *  - 1-3 WMI `1FT` (Ford truck) or `1FD` (Ford incomplete vehicle, i.e. chassis cab).
 *  - 4 `7` or `8` for `1FT` (F-250, F-350/F-450 pickup). Needed because the 3.5L EcoBoost F-150 also has
 *    `T` at position 8. A `1FD` chassis cab (F-350 to F-550) has other letters here, so it is not checked.
 *  - 8 `T`: engine, 6.7L V8 turbo diesel. vPIC decodes `1FT7W2BT?CE...`, `1FT8W3BT?CE...` and
 *    `1FDUF5GT?CE...` as F-250, F-350 and F-550 with 6.7L diesel, and `…B6…` as the 6.2L gasoline engine.
 *  - 10 model year `B` to `G` (2011 to 2016); vPIC gives 2010 for `A` (no 6.7) and 2017 for `H` (a different
 *    generation of truck).
 */
export function isSixSevenVin(vin: string): boolean {
  const v = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return false;
  const wmi = v.slice(0, 3);
  const superDuty = wmi === "1FD" || (wmi === "1FT" && "78".includes(v.charAt(3)));
  return superDuty && v.charAt(7) === "T" && /[B-G]/.test(v.charAt(9));
}

const CHANNELS: readonly ChannelDef[] = [
  {
    key: "egrActual",
    label: "EGR position, actual",
    aliases: [
      "Actual Exhaust Gas Recirculation A Duty Cycle or Position",
      "Actual EGR A duty cycle/position",
    ],
  },
  {
    key: "egrCommanded",
    label: "EGR position, commanded",
    aliases: [
      "Commanded Exhaust Gas Recirculation A Duty Cycle or Position",
      "Commanded EGR A duty cycle/position",
    ],
  },
  {
    key: "egrvp",
    label: "Ford EGRVP",
    // The same PID is also logged in volts; the first column claiming the key (the % one) wins.
    aliases: ["Exhaust Gas Recirculation Valve Position"],
  },
  {
    key: "egrCoolerBypass",
    label: "EGR cooler bypass valve",
    aliases: ["EGR Cooler Bypass Valve"],
  },
  {
    key: "egrThrottleCmd",
    label: "Intake (EGR) throttle commanded",
    aliases: ["Exhaust Gas Recirculation Throttle Position Commanded"],
  },
  {
    key: "egrTemp",
    label: "EGR temperature",
    aliases: ["Exhaust Gas Recirculation Temperature Bank 1 Sensor 1"],
  },
  { key: "egt11", label: "Exhaust gas temperature 11", aliases: ["Exhaust Gas Temperature 11"] },
  {
    key: "exhaustPressure",
    label: "Exhaust pressure",
    aliases: ["Exhaust Pressure Sensor 1", "Exhaust pressure sensor bank 1 sensor 1"],
  },
  {
    key: "nox",
    label: "Tailpipe NOx",
    aliases: [
      "Nitrogen Oxides Sensor Concentration - parts per million",
      "NOx sensor concentration bank 1 sensor 1",
    ],
  },
];

const catalogue = createCatalogue({
  channels: CHANNELS,
  // Ford's name for the DPF soot PID carries a description in the header.
  aliases: { dpfSoot: ["DPF soot for Pickup (wide frame); third VIN position is T."] },
});

// The pre-October logs decode the actual EGR A PID with full open = 99.35 %, the SAE $69 decode with 59.61 %
// (ported from reference/viewers/build_viewer.js). No SAE-decoded log exceeds 62 %.
const OLD_FULL_OPEN = 99.35;
const SAE_FULL_OPEN = 59.61;
const OLD_DECODE_ABOVE = 62;
// SAE $69 readings are whole steps of 100/255 %; the old decode's steps are not. In the fixture logs every
// nonzero SAE reading lands on that grid and at most 5 % of the old readings do, by chance.
const SAE_STEP = 100 / 255;
const MIXED_ON_GRID_SHARE = 0.25;

export const RESCALED_NOTICE = "EGR position rescaled from the pre-October decode";
export const MIXED_NOTICE = "mixed EGR decode, not rescaled";

const onSaeGrid = (v: number) => {
  const steps = v / SAE_STEP;
  return Math.abs(steps - Math.round(steps)) < 0.01;
};

/**
 * Decides the decode over the whole log, never per row. Actual or commanded EGR above 62 % means the old
 * decode; commanded counts too, so a stuck-shut valve is still detected. An old-decode log that also has a
 * large share of SAE-grid readings switched decodes mid-log: it is left raw with a notice. Both position
 * Channels are rescaled, since they share a decode.
 */
export const egrDecodeFix: DecodeFix = ({ channels }) => {
  const actual = channels.egrActual;
  if (!actual) return { channels, notices: [] };
  const commanded = channels.egrCommanded;
  const values = [...actual.values, ...(commanded?.values ?? [])];
  // Not Math.max(...values): spreading a long log overflows the stack.
  if (!values.some((v) => v > OLD_DECODE_ABOVE)) return { channels, notices: [] };
  const open = values.filter((v) => v > 0);
  if (open.filter(onSaeGrid).length > open.length * MIXED_ON_GRID_SHARE) {
    return { channels, notices: [MIXED_NOTICE] };
  }
  const rescale = <T extends { values: number[] }>(c: T): T => ({
    ...c,
    values: c.values.map((v) => Math.round((v * SAE_FULL_OPEN * 100) / OLD_FULL_OPEN) / 100),
  });
  return {
    channels: {
      ...channels,
      egrActual: rescale(actual),
      ...(commanded ? { egrCommanded: rescale(commanded) } : {}),
    },
    notices: [RESCALED_NOTICE],
  };
};

export const SIX_SEVEN: VehicleProfile = {
  id: SIX_SEVEN_PROFILE_ID,
  name: "6.7L Power Stroke (2011-2016)",
  matchesVin: isSixSevenVin,
  catalogue,
  decodeFixes: [egrDecodeFix],
  // Known-useless columns from the reference viewer: never shown. This truck has no NOx sensor 2.
  hiddenColumns: [
    "extra.exhaust-gas-recirculation-system-evaluated",
    "extra.turbocharger-wastegate",
    "extra.nox-sensor-concentration-bank-1-sensor-2",
  ],
  // Panels from the reference viewer.
  defaultChartPreset: [
    { title: "Vehicle speed", unit: "mph", series: [{ key: "speed", label: "Speed" }] },
    { title: "Engine speed", unit: "rpm", series: [{ key: "rpm", label: "RPM" }] },
    { title: "Engine load", unit: "%", series: [{ key: "load", label: "Load" }] },
    {
      title: "EGR position",
      unit: "%",
      series: [
        { key: "egrCommanded", label: "Commanded" },
        { key: "egrActual", label: "Actual" },
      ],
    },
    {
      title: "EGR cooler bypass valve (100 = bypassing the cooler)",
      unit: "%",
      series: [{ key: "egrCoolerBypass", label: "Bypass" }],
    },
    {
      title: "DPF: regen status and soot load",
      unit: "%",
      series: [
        { key: "dpfRegen", label: "Regen" },
        { key: "dpfSoot", label: "Soot" },
      ],
    },
    {
      title: "Intake (EGR) throttle commanded",
      unit: "%",
      series: [{ key: "egrThrottleCmd", label: "Throttle cmd" }],
    },
    { title: "Mass air flow", unit: "lb/min", series: [{ key: "maf", label: "MAF" }] },
    {
      title: "Manifold and exhaust pressure",
      unit: "inHg",
      series: [
        { key: "map", label: "MAP_A" },
        { key: "exhaustPressure", label: "EP" },
      ],
    },
    {
      title: "Tailpipe NOx (post-SCR: an SCR-state marker, not an EGR witness)",
      unit: "ppm",
      series: [{ key: "nox", label: "NOx" }],
    },
    {
      title: "Temperatures",
      unit: "°F",
      series: [
        { key: "ect", label: "ECT1" },
        { key: "egrTemp", label: "EGRT" },
        { key: "egt11", label: "EGT11" },
      ],
    },
  ],
  lookAlikeTolerances: {},
  suggestedPackIds: [P0401_PACK_ID],
};
