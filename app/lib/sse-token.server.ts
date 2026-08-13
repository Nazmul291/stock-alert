import { randomUUID } from "crypto";
import { redis } from "./redis.server";

// EventSource can't send an Authorization header, so routes that genuinely
// stream multiple events over a real EventSource connection can't reuse
// Shopify's normal session-token auth the way a plain fetch()-based route
// can (see sse.server.ts's authenticatedSingleShotJSON for that path). A
// token minted during the page's already-authenticated loader call lets
// those routes — api.live-stream.ts, via api.live-token.ts — trust the shop
// without exposing a raw, guessable shop domain as the auth check.
//
// Also reused for third-party OAuth handoffs (Slack/Asana "Connect" links,
// in slack-oauth.server.ts/asana-oauth.server.ts) that break out of the
// embedded iframe to a plain top-level navigation — same problem (no
// same-origin fetch to attach a session-token header to), same fix.
//
// Every current caller passes its own ttlSeconds explicitly (15min for the
// live-stream token, 10min for OAuth handoffs), so there's deliberately no
// default here — a silently-reused default TTL is exactly the kind of thing
// that goes stale unnoticed once a new caller's actual lifetime need differs
// from it.
const memCache = new Map<string, { shop: string; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memCache) if (now > v.expiresAt) memCache.delete(k);
}, 30_000).unref?.();

export async function mintSseToken(shop: string, ttlSeconds: number): Promise<string> {
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
