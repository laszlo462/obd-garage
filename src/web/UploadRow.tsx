import { compactDateTime, duration } from "./format.ts";
import { type BadgeRow, rowBadges } from "./row-badges.ts";

/** What an upload row shows. The server's Recent rows satisfy it as they are. */
export type UploadRowData = BadgeRow & {
  id: number;
  recordedAt: string | null;
  durationSec: number | null;
};

const MIL_TEXT = { on: "MIL ON", off: "MIL OFF", unknown: "" } as const;

/** One tap target: kind label, compact date-time, duration or MIL state, then badges. */
export function UploadRow(props: { row: UploadRowData }) {
  const { row } = props;
  const isLog = row.kind === "drive-log";
  return (
    <a class="upload-row" href={isLog ? `/drive-logs/${row.id}` : `/reports/${row.id}`}>
      <span class={`row-kind ${isLog ? "kind-log" : "kind-report"}`}>
        {isLog ? "LOG" : "REPORT"}
      </span>
      <span class="row-main">
        <span class="row-title">{compactDateTime(row.recordedAt)}</span>
        <span class="row-badges">
          {rowBadges(row).map((b) => (
            <span key={`${b.tone}-${b.text}`} class={`badge badge-${b.tone}`}>
              {b.text}
            </span>
          ))}
        </span>
      </span>
      <span class="row-right">
        {row.kind === "report" ? MIL_TEXT[row.mil] : duration(row.durationSec)}
      </span>
    </a>
  );
}
