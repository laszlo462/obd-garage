import type { IumprCounter } from "../../core/report.ts";
import { delta, num } from "./numbers.ts";

export type IumprMonitor = {
  name: string;
  completions: number | null;
  conditions: number | null;
  /** Completions over conditions met; null without conditions. */
  ratio: number | null;
  /** Under 0.1, the common regulatory minimum. */
  low: boolean;
  /** Over the 0-2 bar scale. */
  offScale: boolean;
  /** Counts added since the compared Report, or null without one. */
  since: { completions: number; conditions: number } | null;
};

export type IumprEcu = {
  ecu: string;
  ignitionCycles: number | null;
  /** The signed change since the compared Report, or null without one. */
  ignitionCyclesDelta: string | null;
  generalDenominator: number | null;
  monitors: IumprMonitor[];
};

/** The ratio scale tops out here; a larger ratio is clipped and marked. */
export const IUMPR_SCALE_MAX = 2;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const finite = (x: number): number | null => (Number.isFinite(x) ? x : null);

/** In-use performance ratios per ECU, with the counts added since `other` when it is given. */
export function iumprByEcu(counters: IumprCounter[], other?: IumprCounter[] | null): IumprEcu[] {
  const value = (list: IumprCounter[] | null | undefined, ecu: string, re: RegExp) =>
    finite(num(list?.find((r) => r.ecu === ecu && re.test(r.description))?.value));
  return [...new Set(counters.map((r) => r.ecu))].map((ecu) => {
    const rows = counters.filter((r) => r.ecu === ecu);
    const names = [
      ...new Set(
        rows
          .map((r) => /^(.*?) Monitor (Completion|Conditions)/i.exec(r.description)?.[1])
          .filter((n): n is string => Boolean(n)),
      ),
    ];
    const ignition = /Ignition Cycle/i;
    const ignitionBefore = other ? value(other, ecu, ignition) : null;
    const ignitionNow = value(counters, ecu, ignition);
    return {
      ecu,
      ignitionCycles: ignitionNow,
      ignitionCyclesDelta:
        ignitionNow !== null && ignitionBefore !== null
          ? delta(String(ignitionNow), String(ignitionBefore))
          : null,
      generalDenominator: value(counters, ecu, /^OBD Monitoring Conditions/i),
      monitors: names.map((name): IumprMonitor => {
        const done = new RegExp(`^${escapeRegExp(name)} Monitor Completion`, "i");
        const met = new RegExp(`^${escapeRegExp(name)} Monitor Conditions`, "i");
        const completions = value(counters, ecu, done);
        const conditions = value(counters, ecu, met);
        const ratio =
          completions !== null && conditions !== null && conditions > 0
            ? completions / conditions
            : null;
        const doneBefore = value(other, ecu, done);
        const metBefore = value(other, ecu, met);
        return {
          name,
          completions,
          conditions,
          ratio,
          low: ratio !== null && ratio < 0.1,
          offScale: ratio !== null && ratio > IUMPR_SCALE_MAX,
          since:
            completions !== null && conditions !== null && doneBefore !== null && metBefore !== null
              ? { completions: completions - doneBefore, conditions: conditions - metBefore }
              : null,
        };
      }),
    };
  });
}
