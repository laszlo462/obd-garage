import { parseHTML } from "linkedom";

/** A numeric value from report text, or null when the text is not a plain number. */
export type Numeric = number | null;

/** One PID row (Mode $01 live data, Mode $02 freeze frame). */
export type PidRow = {
  /** The PID as printed (`SAE 0x0C`). Empty for freeze-frame rows, which print only a Description. */
  pid: string;
  /**
   * The Description as printed. OBDLink uses the same wording for a Drive Log header, so this maps through the
   * Channel catalogue (`parseHeader`/`createCatalogue`).
   */
  description: string;
  /** The value exactly as printed. */
  value: string;
  /** `value` as a number, or null (`P0401`, `On`, `N/A`). */
  number: Numeric;
  units: string;
};

export type MonitorState = "complete" | "incomplete" | "na";

export type MonitorTest = {
  name: string;
  continuous: boolean;
  /** The status text as printed. */
  status: string;
  state: MonitorState;
};

/** The readiness monitors one ECU reports. */
export type EcuMonitors = { ecu: string; tests: MonitorTest[] };

export type Dtc = {
  ecu: string;
  code: string;
  type: string;
  description: string;
  /** One entry per distinct Status OBDLink printed for this ECU and code (Confirmed, Pending, Permanent...). */
  statuses: string[];
  /** The UDS status lines, without `N/A`. */
  uds: string[];
};

export type FreezeFrame = {
  /** The sub-heading, e.g. `P0401 - First Occurrence`. */
  title: string;
  /** The DTC that stored the frame, when the report says so. */
  dtc?: string;
  rows: PidRow[];
};

export type Mode06Test = {
  /** `$01` */
  mid: string;
  /** `Exhaust Gas Sensor Monitor Bank 1 – Sensor 1` */
  midName: string;
  /** `$90` */
  tid: string;
  /** `Manufacturer Defined` */
  tidName: string;
  /** The value, minimum and maximum as printed. */
  valueText: string;
  minText: string;
  maxText: string;
  value: Numeric;
  min: Numeric;
  max: Numeric;
  units: string;
  /** `Pass`, `Fail`... as printed. */
  result: string;
};

export type OxygenSensor = { sensor: string; available: boolean };

export type Overview = {
  mil: "on" | "off" | "unknown";
  confirmedCount?: number;
  /** `Readiness Standard:` */
  standard?: string;
  /** null when the report does not say. */
  ready: boolean | null;
  /** Why the vehicle is not ready, per ECU. */
  reasons: { ecu: string; text: string }[];
  /** The "Additional Information" table of the Trouble Code section. */
  additional: { description: string; value: string; units: string }[];
};

export type IumprCounter = { ecu: string; counter: string; description: string; value: string };

export type ReportHeader = {
  vin: string;
  /** `Date:` as a naive local ISO time with no offset (ADR 0004), e.g. `2026-10-02T21:32:14`. */
  date: string;
  year?: number;
  make?: string;
  model?: string;
  option?: string;
};

/** A parsed Diagnostic Report. Plain JSON: the server stores it and the viewer receives it as-is. */
export type ParsedReport = {
  header: ReportHeader;
  /** Every section below is absent when the report has no such section. */
  overview?: Overview;
  vehicleInfo?: { description: string; value: string }[];
  monitors?: EcuMonitors[];
  dtcs?: Dtc[];
  freezeFrames?: FreezeFrame[];
  liveData?: PidRow[];
  oxygenSensors?: OxygenSensor[];
  mode06?: Mode06Test[];
  iumpr?: IumprCounter[];
};

export type ReportFailureCode = "missing-vin" | "missing-date" | "bad-date";

export type ReportResult =
  | { kind: "report"; report: ParsedReport }
  /** Looks like a Report but lacks an essential. Ingest turns this into a Failed Upload. */
  | { kind: "failed"; code: ReportFailureCode; reason: string }
  /** Some other file (a Drive Log, random text). Not an error for this parser. */
  | { kind: "not-report" };

type Row = Record<string, string>;

// ---------- text helpers ----------

type TextNode = {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  childNodes: Iterable<TextNode>;
};

/** Text of a node; `<br>` becomes a newline. Never returns markup. */
function cellText(node: TextNode): string {
  let s = "";
  for (const n of node.childNodes) {
    if (n.nodeType === 3) s += n.nodeValue ?? "";
    else if (n.nodeName === "BR") s += "\n";
    else if (n.nodeType === 1) s += cellText(n);
  }
  return s;
}

const clean = (s: string) =>
  s
    .replace(/[ \t\r ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

const text = (node: TextNode) => clean(cellText(node));

function num(s: string | undefined): Numeric {
  if (s == null) return null;
  const t = s.replace(/,/g, "").trim();
  return /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t) ? Number(t) : null;
}

/** `10/2/2026 9:32:14 PM` (or 24-hour) to a naive local ISO time. Null when it is not a real date. */
export function parseReportDate(s: string | undefined): string | null {
  const m = s?.match(/(\d+)\/(\d+)\/(\d{4})\s+(\d+):(\d+):(\d+)\s*(AM|PM)?/i);
  if (!m) return null;
  const [month, day, year, minute, second] = [m[1], m[2], m[3], m[5], m[6]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  let hour = Number(m[4]);
  if (m[7]) {
    if (hour < 1 || hour > 12) return null;
    hour %= 12;
    if (/pm/i.test(m[7])) hour += 12;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(year, 4)}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:${p(second)}`;
}

function tableRows(table: ParentNode & TextNode): Row[] {
  const trs = [...table.querySelectorAll("tr")];
  const cellsOf = (tr: Element) => [...tr.children].filter((c) => /^(TD|TH)$/.test(c.tagName));
  const head = trs[0] ? cellsOf(trs[0]).map((c) => text(c)) : [];
  return trs.slice(1).map((tr) => {
    const o: Row = {};
    cellsOf(tr).forEach((c, i) => {
      o[head[i] || String(i)] = text(c);
    });
    return o;
  });
}

function mode06Row(r: Row): Mode06Test {
  const comp = r.Component ?? "";
  const desc = r.Description ?? "";
  return {
    mid: comp.match(/^\$[0-9A-F]+/i)?.[0] ?? comp,
    midName: comp.replace(/^\$[0-9A-F]+\s*-\s*/i, ""),
    tid: desc.match(/TID\s*(\$[0-9A-F]+)/i)?.[1] ?? desc,
    tidName: desc.replace(/^TID\s*\$[0-9A-F]+\s*-\s*/i, ""),
    valueText: r.Value ?? "",
    minText: r.Minimum ?? "",
    maxText: r.Maximum ?? "",
    value: num(r.Value),
    min: num(r.Minimum),
    max: num(r.Maximum),
    units: r.Units ?? "",
    result: r.Result ?? "",
  };
}

const pidRow = (r: Row): PidRow => ({
  pid: r.PID ?? "",
  description: r.Description ?? "",
  value: r.Value ?? "",
  number: num(r.Value),
  units: r.Units ?? "",
});

export function monitorState(status: string): MonitorState {
  if (/not support/i.test(status)) return "na";
  if (/incomplete/i.test(status)) return "incomplete";
  return /has completed|complete$/i.test(status) && !/not/i.test(status)
    ? "complete"
    : "incomplete";
}

function overviewOf(sectionText: string, list: Element | null): Omit<Overview, "additional"> {
  const reasons: Overview["reasons"] = [];
  if (list) {
    let ecu = "";
    for (const c of list.children) {
      if (c.tagName === "LI") ecu = text(c);
      else if (c.tagName === "UL")
        for (const li of c.querySelectorAll("li")) reasons.push({ ecu, text: text(li) });
    }
  }
  const count = sectionText.match(/Number of Confirmed Codes:\s*(\d+)/i)?.[1];
  const standard = sectionText.match(/Readiness Standard:\s*([^\n]+)/i)?.[1];
  return {
    mil: /MIL On/i.test(sectionText) ? "on" : /MIL Off/i.test(sectionText) ? "off" : "unknown",
    ...(count !== undefined && { confirmedCount: Number(count) }),
    ...(standard !== undefined && { standard: standard.trim() }),
    ready: /is not ready/i.test(sectionText) ? false : /is ready/i.test(sectionText) ? true : null,
    reasons,
  };
}

function collapseDtcs(rows: Row[]): Dtc[] {
  const by = new Map<string, Dtc>();
  for (const r of rows) {
    const key = `${r.ECU}|${r.Code}`;
    let d = by.get(key);
    if (!d) {
      d = {
        ecu: r.ECU ?? "",
        code: r.Code ?? "",
        type: r.Type ?? "",
        description: r.Description ?? "",
        statuses: [],
        uds: [],
      };
      by.set(key, d);
    }
    const status = r.Status ?? "";
    if (!d.statuses.includes(status)) d.statuses.push(status);
    for (const line of (r["UDS Status"] ?? "").split("\n")) {
      if (line && !/^N\/A$/i.test(line) && !d.uds.includes(line)) d.uds.push(line);
    }
  }
  return [...by.values()];
}

const KNOWN_SECTION = /^(Monitor Status|Trouble Code|Mode \$0[1-9])/i;

/**
 * Parses an OBDLink Diagnostic Report. Report text is untrusted: only text is extracted, no markup is kept.
 * A missing section is absent from the result; a missing VIN or date is a typed failure.
 */
export function parseReport(input: string | Uint8Array): ReportResult {
  const html = typeof input === "string" ? input : new TextDecoder().decode(input);
  const { document: doc } = parseHTML(html);

  const fields: Record<string, string> = {};
  for (const b of doc.querySelectorAll("b")) {
    const k = text(b);
    const next = b.nextSibling;
    if (/:$/.test(k) && next && next.nodeType === 3) {
      const key = k.slice(0, -1);
      if (!(key in fields)) fields[key] = clean(next.nodeValue ?? "");
    }
  }

  const sections = [...doc.querySelectorAll("h2")];
  const looksLikeReport =
    /Diagnostic Report/i.test(doc.querySelector("h1")?.textContent ?? "") ||
    sections.some((h) => KNOWN_SECTION.test(text(h)));
  if (!looksLikeReport) return { kind: "not-report" };

  if (!fields.VIN)
    return { kind: "failed", code: "missing-vin", reason: "The report has no VIN line." };
  if (!fields.Date)
    return { kind: "failed", code: "missing-date", reason: "The report has no Date line." };
  const date = parseReportDate(fields.Date);
  if (!date)
    return { kind: "failed", code: "bad-date", reason: "The report's Date line is not a date." };

  const year = Number.parseInt(fields.Year ?? "", 10);
  const report: ParsedReport = {
    header: {
      vin: fields.VIN,
      date,
      ...(Number.isFinite(year) && { year }),
      ...(fields.Make && { make: fields.Make }),
      ...(fields.Model && { model: fields.Model }),
      ...(fields.Option && { option: fields.Option }),
    },
  };

  let overview: Omit<Overview, "additional"> | undefined;
  let additional: Overview["additional"] | undefined;

  for (const h2 of sections) {
    const title = text(h2);
    const sec = h2.parentElement;
    if (!sec) continue;
    let sub = "";
    let sawTable = false;
    for (const el of sec.querySelectorAll("h3, table")) {
      if (el.tagName === "H3") {
        sub = text(el);
        continue;
      }
      sawTable = true;
      const rows = tableRows(el);
      if (/^Monitor Status/i.test(title)) {
        report.monitors = [
          ...(report.monitors ?? []),
          {
            ecu: sub,
            tests: rows.map((r) => ({
              name: r.Name ?? "",
              continuous: /^yes$/i.test(r.Continuous ?? ""),
              status: r.Status ?? "",
              state: monitorState(r.Status ?? ""),
            })),
          },
        ];
      } else if (/^Trouble Code/i.test(title)) {
        if (/Additional/i.test(sub)) {
          additional = rows.map((r) => ({
            description: r.Description ?? "",
            value: r.Value ?? "",
            units: r.Units ?? "",
          }));
        } else report.dtcs = collapseDtcs(rows);
      } else if (/Mode \$01/i.test(title)) {
        report.liveData = rows.map(pidRow);
      } else if (/Mode \$02/i.test(title)) {
        const frameRows = rows.map(pidRow);
        const dtc =
          frameRows.find((r) => /^Freeze frame DTC$/i.test(r.description))?.value ??
          sub.match(/^[PCBU][0-9A-F]{4}/i)?.[0];
        report.freezeFrames = [
          ...(report.freezeFrames ?? []),
          { title: sub, ...(dtc && { dtc }), rows: frameRows },
        ];
      } else if (/Mode \$05/i.test(title)) {
        report.oxygenSensors = rows.map((r) => ({
          sensor: r.Sensor ?? "",
          available: /^yes$/i.test(r.Available ?? ""),
        }));
      } else if (/Mode \$06/i.test(title)) {
        report.mode06 = rows.map(mode06Row);
      } else if (/Mode \$09/i.test(title)) {
        if (/Performance/i.test(sub)) {
          report.iumpr = rows.map((r) => ({
            ecu: r.ECU ?? "",
            counter: r.Counter ?? "",
            description: r.Description ?? "",
            value: r.Value ?? "",
          }));
        } else {
          report.vehicleInfo = [
            ...(report.vehicleInfo ?? []),
            ...rows.map((r) => ({ description: r.Description ?? "", value: r.Value ?? "" })),
          ];
        }
      }
    }
    // A section whose heading is there but whose table is not still counts as present, and empty.
    if (!sawTable) {
      if (/^Monitor Status/i.test(title)) report.monitors ??= [];
      else if (/^Trouble Code/i.test(title)) report.dtcs ??= [];
      else if (/Mode \$01/i.test(title)) report.liveData ??= [];
      else if (/Mode \$02/i.test(title)) report.freezeFrames ??= [];
      else if (/Mode \$06/i.test(title)) report.mode06 ??= [];
    }
    if (/^Monitor Status/i.test(title))
      overview = overviewOf(text(sec).replace(/\n+/g, "\n"), sec.querySelector("ul"));
  }

  if (overview || additional) {
    report.overview = {
      mil: "unknown",
      ready: null,
      reasons: [],
      ...overview,
      additional: additional ?? [],
    };
  }
  return { kind: "report", report };
}
