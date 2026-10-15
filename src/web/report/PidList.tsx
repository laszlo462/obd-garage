import { useState } from "preact/hooks";
import type { FreezeFrame, PidRow } from "../../core/report.ts";
import { fmtNum } from "./numbers.ts";
import { filterPids, freezeFrameWas, groupPids, hideIdleTimers, pairCards } from "./pids.ts";

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

function PidGroups(props: { rows: PidRow[]; was: Map<PidRow, string> }) {
  return (
    <>
      {groupPids(props.rows).map((g) => (
        <div key={g.group} class="pid-group">
          <h3 class="group-heading">{g.group}</h3>
          <ul class="kv-list">
            {g.rows.map((r, i) => {
              const was = props.was.get(r);
              return (
                <li key={`${r.pid}|${r.description}|${i}`} class="kv-row">
                  <span class="kv-key">{r.description}</span>
                  <span class="kv-value">
                    <span class="mono-value">{fmtNum(r.value)}</span>
                    {r.units && <span class="unit">{r.units}</span>}
                    {was !== undefined && <span class="was">{`was ${fmtNum(was)}`}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

const NO_WAS = new Map<PidRow, string>();

/** A freeze frame's PID rows in groups, each a two-column key and mono value, with "was …" if changed. */
export function PidList(props: { rows: PidRow[]; was?: Map<PidRow, string> }) {
  if (props.rows.length === 0) return <p class="list-note">No rows in this Report.</p>;
  return (
    <>
      <PairCards rows={props.rows} />
      <PidGroups rows={props.rows} was={props.was ?? NO_WAS} />
    </>
  );
}

/** Live data: PIDs in groups with a name filter, and EI-AECD timers at 0 in both Reports left out. */
export function LivePidList(props: {
  rows: PidRow[];
  /** The compared Report's live data; null with No comparison. */
  other: PidRow[] | null;
  was: Map<PidRow, string>;
}) {
  const [query, setQuery] = useState("");
  if (props.rows.length === 0) return <p class="list-note">No rows in this Report.</p>;
  const { rows: live, hidden } = hideIdleTimers(props.rows, props.other);
  const rows = filterPids(live, query);
  return (
    <>
      <input
        type="search"
        class="pid-filter"
        aria-label="Filter PIDs…"
        placeholder="Filter PIDs…"
        value={query}
        onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
      />
      {hidden > 0 && <p class="list-note">{`${hidden} EI-AECD timers at 0 not shown.`}</p>}
      {rows.length === 0 ? (
        <p class="list-note">No PIDs match.</p>
      ) : (
        <>
          <PairCards rows={rows} />
          <PidGroups rows={rows} was={props.was} />
        </>
      )}
    </>
  );
}

/** Each freeze frame under its title. */
export function FreezeFrames(props: {
  frames: FreezeFrame[];
  /** The compared Report's frames; null with No comparison. */
  other: FreezeFrame[] | null;
}) {
  const was = freezeFrameWas(props.frames, props.other);
  if (props.frames.length === 0) return <p class="list-note">No freeze frame in this Report.</p>;
  return (
    <>
      {props.frames.map((f, i) => (
        <div key={`${f.title}|${i}`} class="freeze-frame">
          <h3 class="group-heading">{f.title}</h3>
          <PidList rows={f.rows} was={was} />
        </div>
      ))}
    </>
  );
}
