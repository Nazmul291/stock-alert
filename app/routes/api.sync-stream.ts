import type { LoaderFunctionArgs } from "react-router";
import { syncState } from "../lib/sync-state.server";
import prisma from "../db.server";

const POLL_MS = 1000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response('data: {"type":"error","message":"missing shop"}\n\n', {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const knownSession = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    select: { id: true },
  });
  if (!knownSession) {
    return new Response('data: {"type":"auth_error","message":"unknown shop"}\n\n', {
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

      let lastPct = -1;
      let closed = false;
      let timer: ReturnType<typeof setInterval> | null = null;

      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* ignore */ }
      };

      const poll = async () => {
        if (closed) return;
        try {
          const s = await syncState.get(shop);

          // No row yet or never synced
          if (!s || (!s.running && !s.completedAt && !s.error)) {
            send({ type: "idle" });
            close();
            return;
          }

          if (s.running) {
            if (s.progress !== lastPct) {
              send({ type: "progress", pct: s.progress });
              lastPct = s.progress;
            }
          } else {
            // Sync finished — emit final state and close
            if (s.error) {
              send({ type: "error", message: s.error });
            } else {
              if (lastPct < 100) send({ type: "progress", pct: 100 });
              send({ type: "done" });
            }
            close();
          }
        } catch {
          send({ type: "error", message: "Internal error" });
          close();
        }
      };

      // Poll immediately then every second
      poll();
      timer = setInterval(poll, POLL_MS);

      request.signal.addEventListener("abort", close);
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
