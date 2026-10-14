import { useState } from "preact/hooks";
import type { Mode06Test } from "../../core/report.ts";
import { type Comparison, mode06Keys } from "./compare.ts";
import {
  band,
  groupMisfires,
  headroom,
  isMisfire,
  isOpen,
  scaleFor,
  sortLeastHeadroom,
} from "./mode06.ts";
import { fmtNum } from "./numbers.ts";

type Order = "least" | "report";

const limitText = (text: string, value: number | null) => (isOpen(value) ? "none" : fmtNum(text));

/** The range bar: the pass zone between the limits and a marker at the value. */
function Gauge(props: { test: Mode06Test }) {
  const { test } = props;
  const scale = scaleFor(test);
  const label = `${test.valueText} ${test.units}, limits ${test.minText} to ${test.maxText}`;
  if (!scale) return <div class="gauge" role="img" aria-label={label} />;
  const lo = isOpen(test.min) ? 0 : scale(test.min as number);
  const hi = isOpen(test.max) ? 100 : scale(test.max as number);
  const fail = /fail/i.test(test.result);
  return (
    <div class="gauge" role="img" aria-label={label}>
      <div class="gauge-pass" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
      {test.value !== null && (
        <div
          class={`gauge-marker${fail ? " fail" : ""}`}
          style={{ left: `${scale(test.value)}%` }}
        />
      )}
    </div>
  );
}

function headroomText(test: Mode06Test): { text: string; tone: string } {
  if (/fail/i.test(test.result)) return { text: "outside limit", tone: "bad" };
  const h = headroom(test);
  if (!h) return { text: "no limits", tone: "muted" };
  if (h.frac === null)
    return {
      text: `${fmtNum(String(+h.abs.toPrecision(4)))} ${test.units} to ${h.side}`.trim(),
      tone: "muted",
    };
  return { text: `${Math.round(h.frac * 100)} % headroom`, tone: band(test) ?? "muted" };
}

/** The Mode $06 tests, least headroom first or in Report order, then the misfire table. */
export function Mode06(props: { tests: Mode06Test[]; comparison: Comparison }) {
  const { tests, comparison } = props;
  const [order, setOrder] = useState<Order>("least");
  if (tests.length === 0) return <p class="list-note">No Mode $06 data in this Report.</p>;
  const keys = new Map(
    mode06Keys({ header: { vin: "", date: "" }, mode06: tests }).map(([k, t]) => [t, k]),
  );
  const rows = tests.filter((t) => !isMisfire(t));
  const shown = order === "least" ? sortLeastHeadroom(rows) : rows;
  const misfires = groupMisfires(tests);
  return (
    <>
      <div class="segmented" role="radiogroup" aria-label="Order">
        {(
          [
            ["least", "Least headroom"],
            ["report", "Report order"],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="m06-order"
              checked={order === value}
              onChange={() => setOrder(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <ul class="m06-list">
        {shown.map((t) => {
          const key = keys.get(t) ?? "";
          const was = comparison.mode06Was[key];
          const head = headroomText(t);
          return (
            <li key={key} class="m06-row">
              <span class="m06-name">{t.midName}</span>
              <span class="m06-ids">{`TID ${t.tid} · CID ${t.mid}`}</span>
              <span class="m06-reading">
                <span class="m06-value">{fmtNum(t.valueText)}</span>
                <span class="m06-unit">{t.units}</span>
                {was !== undefined && <span class="was">{`was ${fmtNum(was)}`}</span>}
              </span>
              <span class={`m06-headroom tone-${head.tone}`}>{head.text}</span>
              <Gauge test={t} />
              <span class="m06-limits">
                <span>{`min ${limitText(t.minText, t.min)}`}</span>
                <span>{`max ${limitText(t.maxText, t.max)}`}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {misfires.rows.length > 0 && (
        <table class="misfire-table" aria-label="Misfire counts">
          <thead>
            <tr>
              <th scope="col">Misfire counts</th>
              {misfires.cylinders.map((c) => (
                <th key={c} scope="col">{`Cyl ${c}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {misfires.rows.map((r) => (
              <tr key={r.tid}>
                <th scope="row">{`${r.tid} ${r.name}`}</th>
                {r.cells.map((cell, i) => (
                  <td key={i} class={cell && (cell.value ?? 0) > 0 ? "hit" : undefined}>
                    {cell ? fmtNum(cell.valueText) : "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
