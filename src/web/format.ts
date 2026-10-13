const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * "04 Oct 17:22" from a naive local ISO string. The string is read as text and never turned
 * into a `Date`, so the viewer's time zone cannot shift it.
 */
export function compactDateTime(naive: string | null): string {
  const m = naive && NAIVE.exec(naive);
  if (!m) return "–";
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[4]}:${m[5]}`;
}

/** "41 min", "42 s", "1 h 5 min". */
export function duration(sec: number | null): string {
  if (sec === null) return "–";
  if (sec < 60) return `${Math.round(sec)} s`;
  const min = Math.floor(sec / 60 + 0.5);
  if (min < 60) return `${min} min`;
  const rest = min % 60;
  return rest ? `${Math.floor(min / 60)} h ${rest} min` : `${min / 60} h`;
}

/** "2026-10" from a naive local ISO string; "" when there is no recorded time. */
export const monthKey = (naive: string | null): string => naive?.slice(0, 7) ?? "";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "October 2026" from a `monthKey`. */
export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : "Unknown date";
}

/** "1 report", "3 reports". */
export const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** "2 Oct" from a naive local ISO string. */
export function shortDate(naive: string | null): string {
  const m = naive && NAIVE.exec(naive);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : "–";
}

/** "today", "yesterday" or "9 days ago": calendar days from the written date to `today`'s local date. */
export function daysAgo(naive: string | null, today: Date): string {
  const m = naive && NAIVE.exec(naive);
  if (!m) return "";
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.max(0, Math.round((now - then) / 86_400_000));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/** "12 Oct 10:05" from an ISO UTC instant, in the viewer's local time. "–" when it is not a date. */
export function localDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  const p = (n: number) => String(n).padStart(2, "0");
  return compactDateTime(
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`,
  );
}
