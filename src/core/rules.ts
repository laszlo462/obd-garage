import type { Catalogue, ChannelKey, ChannelView } from "./channels.ts";
import type { ParsedReport } from "./report.ts";

/** The parsed Reference Report as rules see it. Nothing in core reads it yet (only look-alike rules will). */
export type ReferenceReport = ParsedReport;

/** Rule parameters. A Vehicle Profile may override a generic rule's defaults; the owner may not. */
export type Params = Readonly<Record<string, unknown>>;

/** What a rule sees: the collapsed rows after the Profile's aliases and decode fixes. */
export type RuleLog = {
  /** Raw `Time (sec)` of each collapsed row; the same anchor Events and pinned Notes use. */
  t: readonly number[];
  channels: ChannelView;
};

export type RuleContext = {
  reference?: ReferenceReport;
  params: Params;
  /** The Profile's catalogue, for rules that map names outside the log (a Reference Report's PIDs). */
  catalogue?: Catalogue;
};

/** An Event as a rule writes it. The engine adds `ruleId`, `packId` and `category`. */
export type EventDraft = {
  kind: "point" | "span";
  /** Raw `Time (sec)`. Equal to `t0` for a point. */
  t0: number;
  t1: number;
  title: string;
  text: string;
};

export type EventCategory = "generic" | "look-alike" | "pack";

export type Event = EventDraft & {
  ruleId: string;
  packId: string | null;
  category: EventCategory;
};

/** A rule that finds it cannot judge this log (e.g. a unit it cannot convert) returns this instead of Events. */
export type NotApplicable = { notApplicable: string };

export type Rule = {
  /** `core.engine-start`, `p0401.entry-window`. */
  id: string;
  /** Missing any of these makes the rule "not applicable", naming the missing Channels. */
  needs: readonly ChannelKey[];
  /** Missing all of these makes the rule "not applicable". For rules that work on whichever of a set is logged. */
  needsAny?: readonly ChannelKey[];
  /** Look-alikes. Without a Reference Report the rule is "skipped". */
  needsReferenceReport?: boolean;
  /** Pure and synchronous. */
  run(log: RuleLog, ctx: RuleContext): EventDraft[] | NotApplicable;
};

export type RulePack = {
  id: string;
  name: string;
  /** One plain-English line for the settings switch row. */
  description?: string;
  rules: readonly Rule[];
};

/** One per (Drive Log, rule), stored with the derived data. */
export type RuleOutcome = { ruleId: string; packId: string | null } & (
  | { status: "ran"; events: number }
  | { status: "not-applicable"; missing: ChannelKey[]; reason?: string }
  | { status: "skipped"; reason: "no-reference-report" }
);
