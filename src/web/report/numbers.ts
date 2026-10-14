/** A number from report text: plain digits with optional commas. NaN for anything else. */
export function num(s: string | null | undefined): number {
  if (s == null) return Number.NaN;
  const t = String(s).replace(/,/g, "").trim();
  return /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t) ? Number(t) : Number.NaN;
}

/** The decimals printed in `s`. */
export const dec = (s: string): number =>
  (String(s).split(".")[1] ?? "").replace(/\D.*$/, "").length;

const group = (x: number, decimals: number) =>
  x.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** A value for display: thousands grouped, printed decimals kept, 'no value' sentinels as "n/a". */
export function fmtNum(s: string): string {
  const x = num(s);
  if (!Number.isFinite(x)) return s;
  if (x === 4294967295 || x === 65535) return "n/a";
  return group(x, dec(s));
}

/** "+730.73", "\u22120.5", "0"; "changed" for text that differs; "" when equal text. */
export function delta(a: string, b: string): string {
  const x = num(a);
  const y = num(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return a === b ? "" : "changed";
  const d = x - y;
  if (d === 0) return "0";
  const n = Math.max(dec(a), dec(b));
  return (d > 0 ? "+" : "\u2212") + group(Math.abs(d), n);
}
