import type { DriveLogRow } from "./api-types.ts";
import { compactDateTime, duration } from "./format.ts";
import { rowBadges } from "./row-badges.ts";

/** One Unassigned Drive Log: a tick, date-time, duration, badges and a View link to the viewer. */
export function UnassignedRow(props: { row: DriveLogRow; ticked: boolean; onToggle: () => void }) {
  const { row } = props;
  return (
    <li class="upload-row unassigned-row">
      <label class="row-check">
        <input type="checkbox" checked={props.ticked} onChange={props.onToggle} />
        <span class="row-main">
          <span class="row-title">{compactDateTime(row.recordedAt)}</span>
          <span class="row-badges">
            {rowBadges({ ...row, kind: "drive-log" }).map((b) => (
              <span key={`${b.tone}-${b.text}`} class={`badge badge-${b.tone}`}>
                {b.text}
              </span>
            ))}
          </span>
        </span>
        <span class="row-right">{duration(row.durationSec)}</span>
      </label>
      <a class="btn-default" href={`/drive-logs/${row.id}`}>
        View
      </a>
    </li>
  );
}
