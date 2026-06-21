import prisma from "../db.server";
import { redis } from "./redis.server";

// 30-second TTL — short enough to pick up settings saves quickly,
// long enough to eliminate the ~2 DB round-trips on every page load.
const TTL_SECONDS = 30;

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

async function writeCache(key: string, data: unknown): Promise<void> {
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(data), "EX", TTL_SECONDS);
    } catch {
      // cache is best-effort — a write failure just means the next read is a DB hit
    }
    return;
  }
  memoryFallback.set(key, { data, expiresAt: Date.now() + TTL_SECONDS * 1000 });
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
