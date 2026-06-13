import prisma from "../db.server";

type CachedEntry<T> = { data: T; expiresAt: number };

const settingsCache = new Map<string, CachedEntry<any>>();
const sessionCache = new Map<string, CachedEntry<any>>();

// 30-second TTL — short enough to pick up settings saves quickly,
// long enough to eliminate the ~2 DB round-trips on every page load.
const TTL = 30_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of settingsCache) if (now > v.expiresAt) settingsCache.delete(k);
  for (const [k, v] of sessionCache) if (now > v.expiresAt) sessionCache.delete(k);
}, 15_000);

export async function getCachedSettings(shop: string) {
  const entry = settingsCache.get(shop);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  const data = await prisma.storeSettings.findUnique({ where: { shop } });
  settingsCache.set(shop, { data, expiresAt: Date.now() + TTL });
  return data;
}

export async function getCachedSession(shop: string) {
  const entry = sessionCache.get(shop);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  const data = await prisma.session.findFirst({ where: { shop, isOnline: false } });
  sessionCache.set(shop, { data, expiresAt: Date.now() + TTL });
  return data;
}

// Call after any mutation to storeSettings or session.plan so the stale
// entry is evicted before the next page load reads from cache.
export function invalidateShopCache(shop: string) {
  settingsCache.delete(shop);
  sessionCache.delete(shop);
}
