import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response("Invalid unsubscribe link.", { status: 400, headers: { "Content-Type": "text/html" } });
  }

  try {
    await prisma.backInStockSubscriber.delete({ where: { id } });
  } catch {
    // Already deleted or invalid — show success anyway to avoid enumeration
  }

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Unsubscribed</title>
    <style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f3f4f6;}
    .card{background:#fff;border-radius:12px;padding:40px;text-align:center;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,0.08);}
    h2{margin:0 0 8px;color:#111827;}p{color:#6b7280;font-size:14px;margin:0;}</style></head>
    <body><div class="card"><div style="font-size:40px;margin-bottom:16px;">✅</div>
    <h2>Unsubscribed</h2><p>You won't receive any more back-in-stock notifications for this product.</p>
    </div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
};
