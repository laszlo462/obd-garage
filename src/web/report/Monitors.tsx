import { useState } from "preact/hooks";
import type { EcuMonitors, MonitorTest } from "../../core/report.ts";
import { type Comparison, keyed } from "./compare.ts";
import { monitorBadge, monitorCounts } from "./dtc.ts";

/**
 * The readiness monitors per ECU: a count line, then name, a status badge, and "was …" when the
 * status changed. Not supported monitors stay hidden until the ECU's "n not supported" toggle.
 */
export function Monitors(props: { monitors: EcuMonitors[]; comparison: Comparison }) {
  const { monitors, comparison } = props;
  if (monitors.length === 0) return <p class="list-note">No monitor status in this Report.</p>;
  // Keys run over the whole Report, so a repeated name lines up with the same one in the other Report.
  // They are computed before any test is hidden.
  const flat = keyed(
    monitors.flatMap((e) => e.tests.map((t) => ({ ecu: e.ecu, t }))),
    ({ ecu, t }) => `${ecu}|${t.name}`,
  );
  let at = 0;
  return (
    <>
      {monitors.map((e) => {
        const keys = flat.slice(at, at + e.tests.length).map(([k]) => k);
        at += e.tests.length;
        return <EcuMonitorList key={e.ecu} ecu={e} keys={keys} comparison={comparison} />;
      })}
    </>
  );
}

function EcuMonitorList(props: { ecu: EcuMonitors; keys: string[]; comparison: Comparison }) {
  const { ecu, keys, comparison } = props;
  const [showNotSupported, setShowNotSupported] = useState(false);
  const counts = monitorCounts(ecu.tests);
  const shown = ecu.tests
    .map((t, i) => [keys[i] ?? "", t] as [string, MonitorTest])
    .filter(([, t]) => showNotSupported || t.state !== "na");
  return (
    <div class="monitor-ecu">
      <h3 class="ecu-heading">{ecu.ecu}</h3>
      <p class="monitor-counts">
        {`${counts.complete} complete · ${counts.incomplete} incomplete · `}
        {counts.notSupported > 0 ? (
          <button
            type="button"
            class="link-button"
            aria-pressed={showNotSupported}
            onClick={() => setShowNotSupported(!showNotSupported)}
          >
            {`${counts.notSupported} not supported`}
          </button>
        ) : (
          <span>0 not supported</span>
        )}
      </p>
      <ul class="monitor-list">
        {shown.map(([key, t]) => {
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
  );
}
