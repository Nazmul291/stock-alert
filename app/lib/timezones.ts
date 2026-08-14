// Curated subset of IANA time zones for the digest-email scheduler — the
// full tz database has ~400 entries, most of which no merchant would ever
// pick; this covers every major commerce region with a human label. Values
// are validated against this list server-side (see app.settings.tsx) so the
// worker never has to guard against an invalid `Intl` time zone string.
export const DIGEST_TIMEZONES: { value: string; label: string }[] = [
  { value: "UTC", label: "UTC" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
  { value: "America/Mexico_City", label: "Mexico City" },
  { value: "America/Toronto", label: "Toronto" },
  { value: "America/Vancouver", label: "Vancouver" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Dublin", label: "Dublin" },
  { value: "Europe/Lisbon", label: "Lisbon" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Europe/Madrid", label: "Madrid" },
  { value: "Europe/Rome", label: "Rome" },
  { value: "Europe/Amsterdam", label: "Amsterdam" },
  { value: "Europe/Stockholm", label: "Stockholm" },
  { value: "Europe/Warsaw", label: "Warsaw" },
  { value: "Europe/Athens", label: "Athens" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Africa/Johannesburg", label: "Johannesburg" },
  { value: "Africa/Cairo", label: "Cairo" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Karachi", label: "Karachi" },
  { value: "Asia/Kolkata", label: "Mumbai, New Delhi" },
  { value: "Asia/Dhaka", label: "Dhaka" },
  { value: "Asia/Bangkok", label: "Bangkok" },
  { value: "Asia/Jakarta", label: "Jakarta" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Asia/Shanghai", label: "Beijing, Shanghai" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Seoul", label: "Seoul" },
  { value: "Australia/Perth", label: "Perth" },
  { value: "Australia/Sydney", label: "Sydney, Melbourne" },
  { value: "Pacific/Auckland", label: "Auckland" },
];

const VALID_TIMEZONES = new Set(DIGEST_TIMEZONES.map((tz) => tz.value));

export function isValidDigestTimezone(tz: string): boolean {
  return VALID_TIMEZONES.has(tz);
}
