import type { EcuMonitors } from "../../core/report.ts";
import { type Comparison, keyed } from "./compare.ts";
import { monitorBadge } from "./dtc.ts";

/** The readiness monitors per ECU: name, a status badge, and "was …" when the status changed. */
export function Monitors(props: { monitors: EcuMonitors[]; comparison: Comparison }) {
  const { monitors, comparison } = props;
  if (monitors.length === 0) return <p class="list-note">No monitor status in this Report.</p>;
  // Keys run over the whole Report, so a repeated name lines up with the same one in the other Report.
  const flat = keyed(
    monitors.flatMap((e) => e.tests.map((t) => ({ ecu: e.ecu, t }))),
    ({ ecu, t }) => `${ecu}|${t.name}`,
  );
  let at = 0;
  return (
    <>
      {monitors.map((e) => (
        <div key={e.ecu} class="monitor-ecu">
          <h3 class="ecu-heading">{e.ecu}</h3>
          <ul class="monitor-list">
            {e.tests.map((t) => {
              const key = flat[at++]?.[0] ?? "";
              const badge = monitorBadge(t.state);
              const was = comparison.monitorWas[key];
              return (
                <li key={key} class="monitor-row">
                  <span class="monitor-name">{t.name}</span>
                  {was !== undefined && <span class="was">{`was ${was}`}</span>}
                  <span class={`badge badge-${badge.tone}`}>{badge.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}
