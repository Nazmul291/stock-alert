// Generic single-shot SSE responder: runs `compute()` once, emits exactly one
// "done" (with the result) or "error" event, then closes the stream. Unlike
// api.sync-stream.ts (which polls a job's progress over time), the routes using
// this have no intermediate progress to report — they just move a query that
// used to block the page's document response into the background.
export function singleShotSSE<T>(compute: () => Promise<T>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      try {
        const data = await compute();
        send({ type: "done", data });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Internal error" });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // no-store, not no-cache — no-cache still permits a cache to store the
      // response and serve it again after revalidating, which an
      // intermediate proxy (e.g. Cloudflare, sitting in front of this app)
      // can get wrong for a streamed response. Since routes using this
      // reuse the exact same URL (same token) for every refetch within a
      // page's mount — see use-cached-sse-data.ts — any caching here would
      // keep re-serving that mount's very first response forever, no matter
      // how many times the underlying data actually changes.
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
