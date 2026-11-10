// Deterministic timestamp formatting, identical on the server (UTC on Vercel)
// and in the browser (any locale/timezone), so hydration never mismatches.
// Fixed locale + fixed timezone; only numeric parts come from Intl, and the
// text (month names, am/pm) is assembled here so ICU version differences
// between Node and the browser cannot change the output.

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** e.g. "10 Nov 2026, 2:56 pm IST" */
export function formatDate(iso: string): string {
  const get = (type: string) =>
    Number(PARTS.formatToParts(new Date(iso)).find((p) => p.type === type)?.value);
  const h = get("hour");
  const minute = String(get("minute")).padStart(2, "0");
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${get("day")} ${MONTHS[get("month") - 1]} ${get("year")}, ${hour12}:${minute} ${h < 12 ? "am" : "pm"} IST`;
}

/** IST calendar day of an ISO timestamp. */
function istDay(iso: string): { y: number; m: number; d: number } {
  const parts = PARTS.formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** e.g. "19 Aug 2026" (IST date only). */
export function formatDay(iso: string): string {
  const { y, m, d } = istDay(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Monday of the IST week containing the timestamp, as "YYYY-MM-DD" (a stable grouping key). */
export function istWeekKey(iso: string): string {
  const { y, m, d } = istDay(iso);
  const day = new Date(Date.UTC(y, m - 1, d));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" week key → "17 Aug 2026". */
export function formatWeekKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
