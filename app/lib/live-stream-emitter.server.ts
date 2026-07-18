import { EventEmitter } from "node:events";
import { redis } from "./redis.server";

// Persistent (not single-shot) SSE channel: forwards publishEvent() calls
// (broadcast.server.ts) to whichever browser tabs are open for that shop, so
// pages can skip refetching until something actually changed server-side.
//
// One shared Redis subscriber per web process — not one per connection — since
// this is a low-traffic B2B app and every tab holding its own subscribe
// connection would put unnecessary load on a small dedicated Redis instance.
// Messages fan out to individual SSE connections via an in-process
// EventEmitter keyed by shop.
export const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let subscriberReady: Promise<void> | null = null;

// Callers must await this before trusting that a publish will be delivered.
// Confirmed directly against this app's Redis: a publish that races an
// un-awaited psubscribe can be silently dropped client-side (never reaches
// the "pmessage" handler) even though Redis itself reports the subscriber
// as notified — psubscribe's own promise is the only reliable "ready"
// signal. Memoized so concurrent callers (multiple tabs/pages opening
// api.live-stream.ts around the same time, e.g. right after a dev-server
// hot-reload resets this module) share the one in-flight setup instead of
// each racing their own.
export function ensureSubscriber(): Promise<void> {
  if (!redis) return Promise.resolve();
  if (subscriberReady) return subscriberReady;

  const sub = redis.duplicate();
  sub.on("error", (err) => {
    console.error("[live-stream] subscriber connection error:", err.message);
  });
  sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const shop = channel.slice("events:".length);
    emitter.emit(shop, message);
  });

  subscriberReady = sub.psubscribe("events:*").then(
    () => undefined,
    (err) => {
      console.error("[live-stream] psubscribe failed:", err.message);
      subscriberReady = null;
      throw err;
    },
  );
  return subscriberReady;
}
