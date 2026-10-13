import { useEffect, useState } from "preact/hooks";

const DESKTOP = "(min-width: 900px)";

/** True at 900 px and up, where the tabs move into the app bar. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => matchMedia(DESKTOP).matches);
  useEffect(() => {
    const query = matchMedia(DESKTOP);
    const update = () => setDesktop(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}
