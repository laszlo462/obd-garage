import {
  type Catalogue,
  type ChannelKey,
  type ChannelView,
  STANDARD_CATALOGUE,
} from "./channels.ts";
import {
  type DriveLog,
  type DriveLogChannel,
  type DriveLogFailureCode,
  type DriveLogRowCounts,
  parseDriveLog,
} from "./drive-log.ts";
import { GENERIC_RULES } from "./generic-rules.ts";
import type { Event, Params, ReferenceReport, Rule, RuleOutcome, RulePack } from "./rules.ts";

export type DecodedLog = { t: readonly number[]; channels: Record<ChannelKey, DriveLogChannel> };

/** A decode fix rewrites Channels (it may inspect the whole log) and may add a per-log notice. */
export type DecodeFix = (log: DecodedLog) => {
  channels: Record<ChannelKey, DriveLogChannel>;
  notices: string[];
};

/**
 * What a Vehicle Profile contributes to `derive`. Core only sees this interface; Profiles live outside
 * core. Every field is optional, so the Generic Profile is an empty object.
 */
export type Profile = {
  catalogue?: Catalogue;
  collapseKeys?: readonly ChannelKey[];
  decodeFixes?: readonly DecodeFix[];
  /** Overrides for generic rule parameters. The context's own `params` win over these. */
  params?: Params;
};

export const GENERIC_PROFILE: Profile = {};

export type VehicleContext = {
  profile: Profile;
  /** Only the packs enabled for the Vehicle. An Unassigned Drive Log passes none. */
  packs: readonly RulePack[];
  /** The Vehicle's parsed Reference Report, or none. */
  referenceReport?: ReferenceReport;
  params: Params;
};

export type DriveLogMetadata = {
  startTime: string;
  duration: number;
  rows: DriveLogRowCounts;
  warnings: string[];
};

export type Derived = {
  kind: "derived";
  metadata: DriveLogMetadata;
  channels: Record<ChannelKey, DriveLogChannel>;
  /** Raw `Time (sec)` per collapsed row, for anchoring Events and Notes. */
  t: number[];
  events: Event[];
  outcomes: RuleOutcome[];
  /** Per-log notices from decode fixes. */
  notices: string[];
};

export type DeriveResult =
  | Derived
  | { kind: "failed"; code: DriveLogFailureCode; reason: string }
  | { kind: "not-drive-log" };

const toView = (channels: Record<ChannelKey, DriveLogChannel>): ChannelView =>
  new Map(
    Object.entries(channels).map(([k, c]) => [
      k,
      c.unit === undefined ? { values: c.values } : { unit: c.unit, values: c.values },
    ]),
  );

/**
 * Everything derived from an Original: parse, apply the Profile, run every applicable rule. Pure,
 * synchronous and all-or-nothing: it returns the whole result or a failure, never part of one.
 * Drive Logs only for now; Diagnostic Reports get recognised here once their parser lands.
 */
export function derive(original: string | Uint8Array, ctx: VehicleContext): DeriveResult {
  const parsed = parseDriveLog(original, {
    catalogue: ctx.profile.catalogue ?? STANDARD_CATALOGUE,
    ...(ctx.profile.collapseKeys ? { collapseKeys: ctx.profile.collapseKeys } : {}),
  });
  if (parsed.kind !== "drive-log") return parsed;
  const log: DriveLog = parsed.log;

  let channels = log.channels;
  const notices: string[] = [];
  for (const fix of ctx.profile.decodeFixes ?? []) {
    const fixed = fix({ t: log.t, channels });
    channels = fixed.channels;
    notices.push(...fixed.notices);
  }

  const params: Params = { ...ctx.profile.params, ...ctx.params };
  const view = toView(channels);
  const ruleLog = { t: log.t, channels: view };
  const events: Event[] = [];
  const outcomes: RuleOutcome[] = [];

  const sources: { rule: Rule; packId: string | null }[] = [
    ...GENERIC_RULES.map((rule) => ({ rule, packId: null })),
    ...ctx.packs.flatMap((p) => p.rules.map((rule) => ({ rule, packId: p.id }))),
  ];

  for (const { rule, packId } of sources) {
    const id = { ruleId: rule.id, packId };
    const missing = rule.needs.filter((k) => !view.has(k));
    if (rule.needsAny && !rule.needsAny.some((k) => view.has(k))) {
      outcomes.push({ ...id, status: "not-applicable", missing: [...rule.needsAny] });
      continue;
    }
    if (missing.length > 0) {
      outcomes.push({ ...id, status: "not-applicable", missing });
      continue;
    }
    if (rule.needsReferenceReport && ctx.referenceReport === undefined) {
      outcomes.push({ ...id, status: "skipped", reason: "no-reference-report" });
      continue;
    }
    const result = rule.run(ruleLog, {
      params,
      ...(ctx.referenceReport === undefined ? {} : { reference: ctx.referenceReport }),
    });
    if (!Array.isArray(result)) {
      outcomes.push({ ...id, status: "not-applicable", missing: [], reason: result.notApplicable });
      continue;
    }
    // Packs write pack Events; look-alike rules will mark their own once they exist.
    const category = packId === null ? "generic" : "pack";
    for (const draft of result) events.push({ ...draft, ...id, category });
    outcomes.push({ ...id, status: "ran", events: result.length });
  }

  return {
    kind: "derived",
    metadata: {
      startTime: log.startTime,
      duration: log.duration,
      rows: log.rows,
      warnings: log.warnings,
    },
    channels,
    t: log.t,
    events,
    outcomes,
    notices,
  };
}
