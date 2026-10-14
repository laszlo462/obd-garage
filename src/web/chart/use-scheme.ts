import { useEffect, useState } from "preact/hooks";
import { watchColorScheme } from "./series-colors.ts";

/** A number that goes up each time the colour scheme changes, to make a chart read its tokens again. */
export function useSchemeChanges(): number {
  const [changes, setChanges] = useState(0);
  useEffect(() => watchColorScheme(() => setChanges((n) => n + 1)), []);
  return changes;
}
