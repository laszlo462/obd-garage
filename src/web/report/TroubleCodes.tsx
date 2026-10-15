import type { Dtc } from "../../core/report.ts";
import { type Comparison, dtcKey } from "./compare.ts";
import { dtcBadges, dtcCodeTone, statusChangeText } from "./dtc.ts";

/**
 * The trouble codes: the code in mono, the description, and a badge per status. When comparing,
 * the compared Report's codes this one lacks follow as muted "Gone since" rows.
 */
export function TroubleCodes(props: {
  dtcs: Dtc[];
  comparison: Comparison;
  /** The compared Report's short date, or null with No comparison. */
  comparedDate: string | null;
}) {
  const { dtcs, comparison, comparedDate } = props;
  const gone = comparison.goneCodes;
  if (dtcs.length === 0 && gone.length === 0)
    return <p class="list-note">No trouble codes in this Report.</p>;
  return (
    <>
      {dtcs.length === 0 && <p class="list-note">No trouble codes in this Report.</p>}
      <ul class="dtc-list">
        {dtcs.map((d, i) => {
          const key = dtcKey(d);
          const change = comparison.statusChanges[key];
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
                {change && <span class="badge badge-accent">{statusChangeText(change)}</span>}
              </span>
            </li>
          );
        })}
        {gone.map((d, i) => (
          <li key={`gone-${dtcKey(d)}#${i}`} class="dtc-row dtc-gone">
            <span class="dtc-code tone-muted">{d.code}</span>
            <span class="dtc-desc">{d.description}</span>
            <span class="dtc-badges">
              <span class="badge badge-neutral">{`Gone since ${comparedDate}`}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
