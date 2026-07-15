import type { LoaderFunctionArgs } from "react-router";
import { emitter, ensureSubscriber } from "../lib/live-stream-emitter.server";
import { resolveSseToken } from "../lib/sse-token.server";

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
