import type { LoaderFunctionArgs } from "react-router";
import { EventEmitter } from "node:events";
import { redis } from "../lib/redis.server";
import { resolveSseToken } from "../lib/sse-token.server";

// Persistent (not single-shot) SSE channel: forwards publishEvent() calls
// (broadcast.server.ts) to whichever browser tabs are open for that shop, so
// pages can skip refetching until something actually changed server-side.
//
// One shared Redis subscriber per web process — not one per connection — since
// this is a low-traffic B2B app and every tab holding its own subscribe
// connection would put unnecessary load on a small dedicated Redis instance.
// Messages fan out to individual SSE connections via an in-process
// EventEmitter keyed by shop.
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let subscriberStarted = false;

function ensureSubscriber(): void {
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

const HEARTBEAT_MS = 25_000;
// Force-close and let the client reconnect with a freshly minted token rather
// than holding a connection open indefinitely — bounds memory/connection use
// per Fly machine even if an abort signal is ever swallowed.
const MAX_CONNECTION_MS = 45 * 60 * 1000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const shop = token ? await resolveSseToken(token) : null;

  if (!shop) {
    return new Response("Session expired", { status: 401 });
  }

  ensureSubscriber();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const onMessage = (message: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch {
          // client disconnected
        }
      };
      emitter.on(shop, onMessage);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // client disconnected
        }
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(hardCap);
        emitter.off(shop, onMessage);
      };

      const hardCap = setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }, MAX_CONNECTION_MS);

      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // no-store, not no-cache — see sse.server.ts's singleShotSSE for why.
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};
