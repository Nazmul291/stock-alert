import Redis from "ioredis";

// REDIS_URL is optional locally — every caller treats a null client as a
// cache miss, so the app works the same (just uncached) without it.
const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new Redis(redisUrl, { maxRetriesPerRequest: 2 })
  : null;

redis?.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});
