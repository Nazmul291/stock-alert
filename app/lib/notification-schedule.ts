// Pure schedule-gating logic for the digest and instant-alert daily-batch
// crons — deliberately has zero side effects (no pg-boss, no Prisma) so it
// can be unit-tested without a running worker, and imported by
// workers/inventory-buffer.worker.ts for the real cron handlers.

const WEEKDAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Local hour (0-23) and weekday (0=Sun..6=Sat, matching Date.getDay()),
// both evaluated in `timeZone` rather than the server's UTC clock — this is
// what lets each shop's digest/alert-batch land at *their* chosen hour
// despite both crons firing hourly on a single shared schedule. Falls back
// to UTC if `timeZone` is somehow invalid (shouldn't happen — digestTimezone
// is validated against DIGEST_TIMEZONES when saved) rather than throwing and
// skipping the shop.
export function localHourAndWeekday(date: Date, timeZone: string): { hour: number; weekday: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hour: "numeric", hourCycle: "h23", weekday: "short",
    }).formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const weekdayName = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const weekday = WEEKDAY_SHORT_NAMES.indexOf(weekdayName);
    return { hour, weekday: weekday === -1 ? date.getUTCDay() : weekday };
  } catch {
    return { hour: date.getUTCHours(), weekday: date.getUTCDay() };
  }
}

// `isDaily` is the caller's resolved plan/frequency check (Pro on "daily"
// digestFrequency) — day-of-week only matters for the weekly path.
export function shouldSendDigestNow(
  settings: { digestHour: number; digestDayOfWeek: number; digestTimezone: string },
  isDaily: boolean,
  now: Date,
): boolean {
  const { hour, weekday } = localHourAndWeekday(now, settings.digestTimezone);
  if (hour !== settings.digestHour) return false;
  if (!isDaily && weekday !== settings.digestDayOfWeek) return false;
  return true;
}

export function shouldSendAlertBatchNow(
  settings: { alertBatchHour: number; digestTimezone: string },
  now: Date,
): boolean {
  const { hour } = localHourAndWeekday(now, settings.digestTimezone);
  return hour === settings.alertBatchHour;
}
