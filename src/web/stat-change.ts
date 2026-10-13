export type Tone = "ok" | "warn" | "bad" | "muted";

/** The fields of a status-strip Report that the tiles read. */
export type StatReport = {
  mil: "on" | "off" | "unknown";
  storedCodes: string[];
  pendingCodes: string[];
  incompleteMonitors: number;
  totalMonitors: number;
};

export type StatTile = {
  label: string;
  value: string;
  tone: Tone;
  change: string;
  /** `warn` when the change is for the worse. */
  changeTone: "warn" | "muted";
};

const MIL_WORD = { on: "ON", off: "OFF", unknown: "?" } as const;

/** "+1" / "-1" / "no change" for a count where more is worse. */
function delta(
  now: number,
  before: number,
  suffix = "",
): { change: string; changeTone: "warn" | "muted" } {
  const d = now - before;
  if (d === 0) return { change: "no change", changeTone: "muted" };
  return {
    change: `${d > 0 ? "+" : "-"}${Math.abs(d)}${suffix}`,
    changeTone: d > 0 ? "warn" : "muted",
  };
}

/** The four status-strip tiles: value, status colour and the change line against the previous Report. */
export function statChange(latest: StatReport, previous: StatReport | null): StatTile[] {
  const first = { change: "first report", changeTone: "muted" } as const;
  const milChange = !previous
    ? first
    : previous.mil === latest.mil
      ? ({ change: "no change", changeTone: "muted" } as const)
      : ({ change: `was ${MIL_WORD[previous.mil]}`, changeTone: "muted" } as const);
  const ready = (r: StatReport) => r.totalMonitors - r.incompleteMonitors;
  const monitorChange = !previous
    ? first
    : ((): { change: string; changeTone: "warn" | "muted" } => {
        const d = ready(latest) - ready(previous);
        if (d === 0) return { change: "no change", changeTone: "muted" };
        // Fewer ready monitors is the change for the worse.
        return {
          change: `${d > 0 ? "+" : "-"}${Math.abs(d)} ready`,
          changeTone: d < 0 ? "warn" : "muted",
        };
      })();
  const counted = (now: number, before: number | undefined) =>
    before === undefined ? first : delta(now, before);
  return [
    {
      label: "MIL",
      value: MIL_WORD[latest.mil],
      tone: latest.mil === "on" ? "bad" : latest.mil === "off" ? "ok" : "muted",
      ...milChange,
    },
    {
      label: "Stored",
      value: String(latest.storedCodes.length),
      tone: latest.storedCodes.length ? "bad" : "ok",
      ...counted(latest.storedCodes.length, previous?.storedCodes.length),
    },
    {
      label: "Pending",
      value: String(latest.pendingCodes.length),
      tone: latest.pendingCodes.length ? "warn" : "ok",
      ...counted(latest.pendingCodes.length, previous?.pendingCodes.length),
    },
    {
      label: "Monitors",
      value: `${ready(latest)}/${latest.totalMonitors}`,
      tone: latest.incompleteMonitors ? "warn" : "ok",
      ...monitorChange,
    },
  ];
}
