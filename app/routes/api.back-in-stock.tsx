import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { publishEvent } from "../lib/broadcast.server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory rate limit: max 5 signups per IP per 10 minutes
const ipBucket = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipBucket) if (now > v.resetAt) ipBucket.delete(k);
}, 60_000);

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipBucket.get(ip) ?? { count: 0, resetAt: now + 10 * 60 * 1000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 10 * 60 * 1000; }
  entry.count++;
  ipBucket.set(ip, entry);
  return entry.count > 5;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// Handle CORS preflight
export const loader = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" },
    });
  }

  // Verifies the request was actually proxied by Shopify (checks the signed HMAC query params)
  // rather than posted directly to this URL by anyone on the internet.
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return json({ error: "Shop not found" }, 404);
  }
  const shop = session.shop;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) return json({ error: "Too many requests. Please try again later." }, 429);

  let body: { productId?: string; productTitle?: string; email?: string; firstName?: string; lastName?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { productId, productTitle, email, firstName, lastName } = body;

  if (!productId || !email) {
    return json({ error: "Missing required fields: productId, email" }, 400);
  }

  if (!EMAIL_RE.test(email)) {
    return json({ error: "Invalid email address" }, 400);
  }

  const trimName = (v?: string) => v?.trim().slice(0, 100) || null;

  try {
    await prisma.backInStockSubscriber.upsert({
      where: { shop_productId_email: { shop, productId: BigInt(productId), email } },
      update: { subscribedAt: new Date(), notifiedAt: null, firstName: trimName(firstName), lastName: trimName(lastName) },
      create: { shop, productId: BigInt(productId), productTitle: productTitle ?? null, email, firstName: trimName(firstName), lastName: trimName(lastName) },
    });
    publishEvent(shop, ["back-in-stock"]).catch(() => {});
    return json({ success: true, message: "You'll be notified when this product is back in stock." });
  } catch (error) {
    console.error("[back-in-stock] failed to upsert subscriber:", error);
    return json({ error: "Failed to subscribe. Please try again." }, 500);
  }
};
