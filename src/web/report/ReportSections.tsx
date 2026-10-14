import type { ParsedReport } from "../../core/report.ts";
import { Section } from "../Section.tsx";
import type { Comparison } from "./compare.ts";
import { Iumpr } from "./Iumpr.tsx";
import { Mode06 } from "./Mode06.tsx";
import { Monitors } from "./Monitors.tsx";
import { FreezeFrames, PidList } from "./PidList.tsx";
import { TroubleCodes } from "./TroubleCodes.tsx";
import { VehicleInfo } from "./VehicleInfo.tsx";
import { vehicleInfoRows } from "./vehicle-info.ts";

/** The collapsible sections of the viewer, in DESIGN.md order, with its open and closed defaults. */
export function ReportSections(props: {
  report: ParsedReport;
  comparison: Comparison;
  /** The compared Report's short date, or null with No comparison. */
  comparedDate: string | null;
  /** The compared Report, for the sections that read its raw rows. */
  other: ParsedReport | null;
}) {
  const { report, comparison, comparedDate, other } = props;
  return (
    <>
      <Section title="Trouble codes" count={report.dtcs?.length ?? 0} defaultOpen>
        <TroubleCodes
          dtcs={report.dtcs ?? []}
          comparison={comparison}
          comparedDate={comparedDate}
        />
      </Section>
      <Section
        title="Readiness monitors"
        count={(report.monitors ?? []).flatMap((e) => e.tests).length}
        defaultOpen
      >
        <Monitors monitors={report.monitors ?? []} comparison={comparison} />
      </Section>
      <Section title="Mode $06" count={report.mode06?.length ?? 0} defaultOpen>
        <Mode06 tests={report.mode06 ?? []} comparison={comparison} />
      </Section>
      <Section title="Freeze frame" count={report.freezeFrames?.length ?? 0}>
        <FreezeFrames frames={report.freezeFrames ?? []} />
      </Section>
      <Section title="Live data" count={report.liveData?.length ?? 0}>
        <PidList rows={report.liveData ?? []} />
      </Section>
      <Section title="IUMPR" count={report.iumpr?.length ?? 0}>
        <Iumpr counters={report.iumpr ?? []} other={other?.iumpr ?? null} />
      </Section>
      <Section title="Vehicle info" count={vehicleInfoRows(report).length}>
        <VehicleInfo report={report} />
      </Section>
      <Section title="Notes" defaultOpen>
        <p class="list-note">Notes for this Report will appear here.</p>
      </Section>
    </>
  );
}
