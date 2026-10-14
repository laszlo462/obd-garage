/** The number of series colour tokens, `--c1` to `--c6` (tokens.css). */
const TOKENS = 6;

/** The first `count` series colours, read from the `--c1`…`--c6` tokens now in force; they repeat after six. */
export function seriesColors(count: number): string[] {
  const style = getComputedStyle(document.documentElement);
  const tokens = Array.from({ length: TOKENS }, (_, i) =>
    style.getPropertyValue(`--c${i + 1}`).trim(),
  );
  return Array.from({ length: count }, (_, i) => tokens[i % TOKENS] as string);
}

/** Runs `onChange` when the colour scheme flips, so tokens can be read again. Returns the undo. */
export function watchColorScheme(onChange: () => void): () => void {
  const query = matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
