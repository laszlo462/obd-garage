import type { IumprCounter } from "../../core/report.ts";
import { IUMPR_SCALE_MAX, iumprByEcu } from "./iumpr.ts";

const count = (n: number | null) => (n === null ? "–" : n.toLocaleString("en-US"));

/** In-use performance per ECU: completions, conditions met and the ratio, with the counts since `other`. */
export function Iumpr(props: { counters: IumprCounter[]; other: IumprCounter[] | null }) {
  const ecus = iumprByEcu(props.counters, props.other);
  if (ecus.length === 0) return <p class="list-note">No in-use performance data in this Report.</p>;
  return (
    <>
      {ecus.map((e) => (
        <div key={e.ecu} class="iumpr-ecu">
          <h3 class="ecu-heading">{e.ecu}</h3>
          <p class="iumpr-meta">
            {e.ignitionCycles !== null && (
              <span>{`Ignition cycles ${count(e.ignitionCycles)}${e.ignitionCyclesDelta ? ` (${e.ignitionCyclesDelta})` : ""}`}</span>
            )}
            {e.generalDenominator !== null && (
              <span>{`General denominator ${count(e.generalDenominator)}`}</span>
            )}
          </p>
          <ul class="iumpr-list">
            {e.monitors.map((m) => (
              <li key={m.name} class="iumpr-row">
                <span class="iumpr-name">{m.name}</span>
                <span class="mono-value">{count(m.completions)}</span>
                <span class="mono-value">{count(m.conditions)}</span>
                <span class={`mono-value ${m.low ? "tone-bad" : ""}`}>
                  {m.ratio === null ? "–" : m.ratio.toFixed(3)}
                </span>
                <span class="ratio-bar">
                  <i
                    class={m.low ? "low" : undefined}
                    style={{
                      width: `${m.ratio === null ? 0 : Math.min(100, (m.ratio / IUMPR_SCALE_MAX) * 100)}%`,
                    }}
                  />
                </span>
                {m.offScale && <span class="was">off scale</span>}
                {m.since && (
                  <span class="was">{`+${m.since.completions} / +${m.since.conditions}`}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
