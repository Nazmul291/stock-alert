// Pure, dependency-free display helpers — safe to import anywhere (no
// Shopify/Prisma calls), same convention as notification-schedule.ts.

// Slug-to-title-case derivation of the shop domain (e.g.
// "app-test-basic.myshopify.com" -> "App Test Basic") — zero Shopify API
// calls. Originally only computed during onboarding (app._index.tsx); the
// steady-state dashboard greeting reuses the exact same derivation instead
// of duplicating it.
export function deriveShopDisplayName(shop: string): string {
  return shop
    .replace(".myshopify.com", "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// `hour` is 0-23, already resolved to the shop's local time (see
// localHourAndWeekday in notification-schedule.ts) — this function itself
// has no notion of timezone.
export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
