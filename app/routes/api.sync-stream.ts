import type { LoaderFunctionArgs } from "react-router";
import { syncState } from "../lib/sync-state.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response('data: {"type":"error","message":"missing shop"}\n\n', {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Client disconnected
        }
      };

      const current = syncState.get(shop);

      if (!current?.running) {
        send({ type: "idle" });
        controller.close();
        return;
      }

      // Send current progress immediately on connect
      send({ type: "progress", pct: current.progress });

      const unsubscribe = syncState.onProgress(shop, (pct, done, error) => {
        if (error) {
          send({ type: "error", message: error });
          try { controller.close(); } catch { /* ignore */ }
          unsubscribe();
        } else if (done) {
          send({ type: "progress", pct: 100 });
          send({ type: "done" });
          try { controller.close(); } catch { /* ignore */ }
          unsubscribe();
        } else {
          send({ type: "progress", pct });
        }
      });

      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try { controller.close(); } catch { /* ignore */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};
