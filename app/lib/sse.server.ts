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
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
