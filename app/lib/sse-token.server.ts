import { randomUUID } from "crypto";
import { redis } from "./redis.server";

// EventSource can't send an Authorization header, so SSE routes can't reuse
// Shopify's normal session-token auth. A token minted during the page's
// already-authenticated loader call lets the SSE route trust the shop
// without exposing a raw, guessable shop domain as the auth check. Also reused
// for third-party OAuth handoffs (e.g. Slack "Connect" links) that break out of
// the embedded iframe to a plain top-level navigation — same problem, same fix
// (those callers pass their own short ttlSeconds explicitly).
//
// This default (used by dashboard/products/etc.'s page loaders) has to
// outlive the page, not just the initial load: useCachedSSEData reuses the
// one token minted at mount for every background refetch a live event
// triggers for as long as the user stays on that page, and silently drops a
// refetch whose token has expired rather than surfacing an error (see its
// comments) — so a too-short TTL here means live updates (e.g. a product
// sync's dashboard refresh) quietly stop working for anyone who's had the
// page open longer than this, with no visible sign anything's wrong.
const TTL_SECONDS = 30 * 60;

const memCache = new Map<string, { shop: string; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memCache) if (now > v.expiresAt) memCache.delete(k);
}, 30_000).unref?.();

export async function mintSseToken(shop: string, ttlSeconds: number = TTL_SECONDS): Promise<string> {
  const token = randomUUID();
  const key = `sse-token:${token}`;
  if (redis) {
    try {
      await redis.set(key, shop, "EX", ttlSeconds);
      return token;
    } catch {
      // fall through to in-memory
    }
  }
  memCache.set(key, { shop, expiresAt: Date.now() + ttlSeconds * 1000 });
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
