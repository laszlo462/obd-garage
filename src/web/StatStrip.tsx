import type { StatusData } from "./api-types.ts";
import { daysAgo, shortDate } from "./format.ts";
import { statChange } from "./stat-change.ts";

/** The Recent status panel: four tiles against the previous Report, and a footer that opens the Report. */
export function StatStrip(props: { status: StatusData; today?: Date }) {
  const { report, previous } = props.status;
  if (!report)
    return (
      <section class="stat-strip stat-empty">
        <p class="stat-empty-title">No diagnostic report yet</p>
        <p class="stat-empty-hint">
          Add a Diagnostic Report to see the MIL, codes and monitors here.
        </p>
      </section>
    );
  const footer = [
    `Latest report ${shortDate(report.date)}`,
    daysAgo(report.date, props.today ?? new Date()),
    ...(report.permanentCodes.length ? [`${report.permanentCodes.join(", ")} permanent`] : []),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <a class="stat-strip" href={`/reports/${report.id}`}>
      <div class="stat-tiles">
        {statChange(report, previous).map((tile) => (
          <div key={tile.label} class="stat-tile">
            <span class="stat-label">{tile.label}</span>
            <span class={`stat-value tone-${tile.tone}`}>{tile.value}</span>
            <span class={`stat-change tone-${tile.changeTone}`}>{tile.change}</span>
          </div>
        ))}
      </div>
      <div class="stat-footer">{footer} ›</div>
    </a>
  );
}
