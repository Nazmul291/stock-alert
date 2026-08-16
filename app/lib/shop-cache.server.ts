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

// Same reasoning as getCachedShopEmail above — the shop's real business name
// (e.g. "ZR Sports Co") isn't on the offline Session row either, and has to
// come from the Admin API. Used for the dashboard's greeting; falls back to
// a slug-derived guess (see deriveShopDisplayName) if this ever returns null.
export async function getCachedShopName(shop: string): Promise<string | null> {
  const key = `shop-name:${shop}`;
  const cached = await readCache<string | null>(key);
  if (cached !== undefined) return cached;

  let name: string | null = null;
  try {
    const { admin } = await unauthenticated.admin(shop);
    const res = await admin.graphql(`query { shop { name } }`);
    const json: { data?: { shop?: { name: string | null } } } = await res.json();
    name = json.data?.shop?.name ?? null;
  } catch {
    // Non-fatal — caller falls back to deriveShopDisplayName
  }

  await writeCache(key, name, SHOP_EMAIL_TTL_SECONDS);
  return name;
}

// Store name/email change essentially never (hence the 24h TTL above), but
// "essentially never" isn't "never" — a merchant who just renamed their
// store or changed the owner email in Shopify admin has no way to make this
// app notice before the cache naturally expires. Evicts both keys and
// immediately re-fetches from the Admin API (rather than just evicting and
// waiting for the next lazy read) so a "Sync now" action can report the
// fresh values back to the UI right away.
export async function refreshShopIdentity(shop: string): Promise<{ name: string | null; email: string | null }> {
  memoryFallback.delete(`shop-name:${shop}`);
  memoryFallback.delete(`shop-email:${shop}`);
  if (redis) {
    try {
      await redis.del(`shop-name:${shop}`, `shop-email:${shop}`);
    } catch {
      // best-effort — if this fails the stale entry just rides out its TTL
    }
  }
  const [name, email] = await Promise.all([getCachedShopName(shop), getCachedShopEmail(shop)]);
  return { name, email };
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
