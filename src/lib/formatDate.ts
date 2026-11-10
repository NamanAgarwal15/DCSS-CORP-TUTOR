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
