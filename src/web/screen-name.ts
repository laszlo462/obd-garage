import { TABS } from "./TabBar.tsx";

const PUSHED: [RegExp, string][] = [
  [/^\/vehicles$/, "Vehicles"],
  [/^\/vehicles\/\d+\/settings$/, "Vehicle settings"],
  [/^\/reports\/\d+$/, "Report"],
  [/^\/drive-logs\/\d+$/, "Drive Log"],
  [/^\/unassigned$/, "Unassigned"],
  [/^\/failed-uploads$/, "Failed Uploads"],
];

/** The screen's name for the app bar title and the Back label. */
export function screenName(path: string): string {
  const clean = path.replace(/[?#].*$/, "").replace(/(.)\/$/, "$1");
  const tab = TABS.find((t) => t.path === clean);
  if (tab) return tab.label;
  return PUSHED.find(([re]) => re.test(clean))?.[1] ?? "";
}
