import type { Dtc } from "../../core/report.ts";
import { type Comparison, dtcKey } from "./compare.ts";
import { dtcBadges, dtcCodeTone } from "./dtc.ts";

/** The trouble codes: the code in mono, the description, and a badge per status. */
export function TroubleCodes(props: {
  dtcs: Dtc[];
  comparison: Comparison;
  /** The compared Report's short date, or null with No comparison. */
  comparedDate: string | null;
}) {
  const { dtcs, comparison, comparedDate } = props;
  if (dtcs.length === 0) return <p class="list-note">No trouble codes in this Report.</p>;
  return (
    <ul class="dtc-list">
      {dtcs.map((d, i) => {
        const key = dtcKey(d);
        return (
          // The same ECU and code can repeat, so the index keeps the keys apart.
          <li key={`${key}#${i}`} class="dtc-row">
            <span class={`dtc-code tone-${dtcCodeTone(d)}`}>{d.code}</span>
            <span class="dtc-desc">{d.description}</span>
            <span class="dtc-badges">
              {dtcBadges(d).map((b) => (
                <span key={b.label} class={`badge badge-${b.tone}`}>
                  {b.label}
                </span>
              ))}
              {comparison.newCodes.includes(key) && <span class="badge badge-accent">New</span>}
              {comparison.alsoIn.includes(key) && (
                <span class="badge badge-neutral">{`Also in ${comparedDate}`}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
