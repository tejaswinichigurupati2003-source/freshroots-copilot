/** vercel.json runs "30 1 * * 1,4": Monday and Thursday at 01:30 UTC, which is 07:00 IST. */
const RUN_DAYS_UTC = [1, 4];
const RUN_HOUR_UTC = 1;
const RUN_MINUTE_UTC = 30;

/** The next scheduled run strictly after `now`. */
export function nextScheduledRun(now: Date): Date {
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, RUN_HOUR_UTC, RUN_MINUTE_UTC));
    if (RUN_DAYS_UTC.includes(candidate.getUTCDay()) && candidate.getTime() > now.getTime()) return candidate;
  }
  throw new Error("No scheduled run found in the next week");
}

/** For example "Mon 26 Oct, 7:00 am IST". */
export function formatRun(date: Date): string {
  const day = date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
  return `${day.replace(",", "")}, ${time} IST`;
}
