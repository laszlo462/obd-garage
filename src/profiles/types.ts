import type { ChannelKey } from "../core/channels.ts";
import type { Profile } from "../core/derive.ts";

/** One chart in a Profile's default preset. Series are Channel keys; the UI skips ones a log lacks. */
export type ChartPanel = {
  title: string;
  unit: string;
  series: readonly { key: ChannelKey; label: string }[];
};

/**
 * A Vehicle Profile as the app sees it. The core `Profile` part (catalogue, decode fixes, rule parameter
 * overrides) is what `derive` consumes; the rest is read by the server and the UI. Core never imports this.
 */
export type VehicleProfile = Profile & {
  id: string;
  name: string;
  /** True when this Profile claims the VIN. Generic claims nothing. */
  matchesVin(vin: string): boolean;
  /** Channels the UI hides by default. */
  hiddenColumns: readonly ChannelKey[];
  defaultChartPreset: readonly ChartPanel[];
  /** Per-Channel tolerance overrides for Look-alike rules (none exist yet, so nothing reads this). */
  lookAlikeTolerances: Readonly<Record<ChannelKey, number>>;
  /** Rule Packs offered when a Vehicle is created with this Profile. */
  suggestedPackIds: readonly string[];
};
