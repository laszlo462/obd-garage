/** Pads numbers on the left so digits line up; a figure space is as wide as a digit. */
const PAD = " ";
const MISSING = "–";

export type ChannelFormat = {
  decimals: number;
  /** Characters in every string `format` returns. */
  width: number;
  /** Fixed decimals, left-padded to `width`; a missing value is an en dash. */
  format(value: number | null): string;
};

/**
 * Fixes how a Channel's values are written, once per Channel: the decimals from the size of its values, the
 * width from its extremes. Every string `format` returns has the same length, so the readout never reflows
 * while the cursor moves.
 */
export function channelFormat(values: readonly (number | null)[]): ChannelFormat {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let whole = true;
  // A loop, not Math.min(...values): spreading a long log overflows the stack.
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    if (!Number.isInteger(v)) whole = false;
  }
  const none = min > max;
  const biggest = none ? 0 : Math.max(Math.abs(min), Math.abs(max));
  const decimals = whole || biggest >= 1000 ? 0 : biggest >= 100 ? 1 : 2;
  const intDigits = biggest.toFixed(decimals).split(".")[0]?.length ?? 1;
  const width = (min < 0 ? 1 : 0) + intDigits + (decimals > 0 ? decimals + 1 : 0);
  return {
    decimals,
    width,
    format: (value) =>
      (value === null || !Number.isFinite(value) ? MISSING : value.toFixed(decimals)).padStart(
        width,
        PAD,
      ),
  };
}
