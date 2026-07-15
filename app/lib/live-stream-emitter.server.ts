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

let subscriberStarted = false;

export function ensureSubscriber(): void {
  if (!redis || subscriberStarted) return;
  subscriberStarted = true;
  const sub = redis.duplicate();
  sub.on("error", (err) => {
    console.error("[live-stream] subscriber connection error:", err.message);
  });
  sub.psubscribe("events:*").catch((err) => {
    console.error("[live-stream] psubscribe failed:", err.message);
    subscriberStarted = false;
  });
  sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const shop = channel.slice("events:".length);
    emitter.emit(shop, message);
  });
}
