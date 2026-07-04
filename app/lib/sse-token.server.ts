import { randomUUID } from "crypto";
import { redis } from "./redis.server";

// EventSource can't send an Authorization header, so SSE routes can't reuse
// Shopify's normal session-token auth. A short-lived token minted during the
// page's already-authenticated loader call lets the SSE route trust the shop
// without exposing a raw, guessable shop domain as the auth check.
const TTL_SECONDS = 60;

const memCache = new Map<string, { shop: string; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memCache) if (now > v.expiresAt) memCache.delete(k);
}, 30_000).unref?.();

export async function mintSseToken(shop: string): Promise<string> {
  const token = randomUUID();
  const key = `sse-token:${token}`;
  if (redis) {
    try {
      await redis.set(key, shop, "EX", TTL_SECONDS);
      return token;
    } catch {
      // fall through to in-memory
    }
  }
  memCache.set(key, { shop, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  return token;
}

export async function resolveSseToken(token: string): Promise<string | null> {
  const key = `sse-token:${token}`;
  if (redis) {
    try {
      return await redis.get(key);
    } catch {
      return null;
    }
  }
  const entry = memCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.shop;
  return null;
}
