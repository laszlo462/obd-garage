import type { FreezeFrame, PidRow } from "../../core/report.ts";
import { fmtNum } from "./numbers.ts";
import { groupPids, pairCards } from "./pids.ts";

function PairCards(props: { rows: PidRow[] }) {
  const cards = pairCards(props.rows);
  if (cards.length === 0) return null;
  return (
    <div class="pair-cards">
      {cards.map((c) => (
        <div key={c.label} class="pair-card">
          <div class="pair-title">
            <b>{c.label}</b>
            <span>{`${fmtNum(c.commanded)} → ${fmtNum(c.actual)} ${c.units}`.trim()}</span>
          </div>
          <div class="pair-bar commanded">
            <i style={{ width: `${c.commandedPct}%` }} />
          </div>
          <div class="pair-bar actual">
            <i style={{ width: `${c.actualPct}%` }} />
          </div>
          <div class={`pair-error${c.big ? " big" : ""}`}>
            {`actual − commanded: ${c.error} ${c.units}`.trim()}
          </div>
        </div>
      ))}
    </div>
  );
}

/** PID rows (Mode $01 or a freeze frame) in groups, each a two-column key and mono value. */
export function PidList(props: { rows: PidRow[] }) {
  const { rows } = props;
  if (rows.length === 0) return <p class="list-note">No rows in this Report.</p>;
  return (
    <>
      <PairCards rows={rows} />
      {groupPids(rows).map((g) => (
        <div key={g.group} class="pid-group">
          <h3 class="group-heading">{g.group}</h3>
          <ul class="kv-list">
            {g.rows.map((r, i) => (
              <li key={`${r.pid}|${r.description}|${i}`} class="kv-row">
                <span class="kv-key">{r.description}</span>
                <span class="kv-value">
                  <span class="mono-value">{fmtNum(r.value)}</span>
                  {r.units && <span class="unit">{r.units}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/** Each freeze frame under its title. */
export function FreezeFrames(props: { frames: FreezeFrame[] }) {
  if (props.frames.length === 0) return <p class="list-note">No freeze frame in this Report.</p>;
  return (
    <>
      {props.frames.map((f, i) => (
        <div key={`${f.title}|${i}`} class="freeze-frame">
          <h3 class="group-heading">{f.title}</h3>
          <PidList rows={f.rows} />
        </div>
      ))}
    </>
  );
}
