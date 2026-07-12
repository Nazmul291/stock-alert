import prisma from "../db.server";
import { redis } from "./redis.server";
import { unauthenticated } from "../shopify.server";

// 30-second TTL — short enough to pick up settings saves quickly,
// long enough to eliminate the ~2 DB round-trips on every page load.
const TTL_SECONDS = 30;

// Shop owner email changes essentially never — cache it far longer than
// settings/session to avoid an Admin API round-trip on every load.
const SHOP_EMAIL_TTL_SECONDS = 86_400;

// Falls back to an in-process Map when REDIS_URL isn't set (e.g. local dev),
// so caching still works without requiring a local Redis instance.
const memoryFallback = new Map<string, { data: unknown; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memoryFallback) if (now > v.expiresAt) memoryFallback.delete(k);
}, 15_000);

async function readCache<T>(key: string): Promise<T | undefined> {
  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  }
  const entry = memoryFallback.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data as T;
  return undefined;
}

async function writeCache(key: string, data: unknown, ttlSeconds = TTL_SECONDS): Promise<void> {
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
    } catch {
      // cache is best-effort — a write failure just means the next read is a DB hit
    }
    return;
  }
  memoryFallback.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function getCachedSettings(shop: string) {
  const key = `settings:${shop}`;
  const cached = await readCache<Awaited<ReturnType<typeof prisma.storeSettings.findUnique>>>(key);
  if (cached !== undefined) return cached;
  const data = await prisma.storeSettings.findUnique({ where: { shop } });
  await writeCache(key, data);
  return data;
}

export async function getCachedSession(shop: string) {
  const key = `session:${shop}`;
  const cached = await readCache<Awaited<ReturnType<typeof prisma.session.findFirst>>>(key);
  if (cached !== undefined) return cached;
  const data = await prisma.session.findFirst({ where: { shop, isOnline: false } });
  await writeCache(key, data);
  return data;
}

// The Session row's `email` column is only ever populated for Shopify's
// *online* OAuth flow (a specific staff member) — this app stores an offline
// session (see getCachedSession), which never carries an email, so that
// column is always null here. The real owner email has to come from the
// Admin API instead.
export async function getCachedShopEmail(shop: string): Promise<string | null> {
  const key = `shop-email:${shop}`;
  const cached = await readCache<string | null>(key);
  if (cached !== undefined) return cached;

  let email: string | null = null;
  try {
    const { admin } = await unauthenticated.admin(shop);
    const res = await admin.graphql(`query { shop { email } }`);
    const json: { data?: { shop?: { email: string | null } } } = await res.json();
    email = json.data?.shop?.email ?? null;
  } catch {
    // Non-fatal — caller falls back to a generic message in the UI
  }

  await writeCache(key, email, SHOP_EMAIL_TTL_SECONDS);
  return email;
}

// Call after any mutation to storeSettings or session.plan so the stale
// entry is evicted before the next page load reads from cache.
export async function invalidateShopCache(shop: string): Promise<void> {
  memoryFallback.delete(`settings:${shop}`);
  memoryFallback.delete(`session:${shop}`);
  memoryFallback.delete(`test-store:${shop}`);
  memoryFallback.delete(`billing:${shop}`);
  if (!redis) return;
  try {
    await redis.del(`settings:${shop}`, `session:${shop}`, `test-store:${shop}`, `billing:${shop}`);
  } catch {
    // best-effort — a stale cache entry self-heals after its TTL anyway
  }
}
