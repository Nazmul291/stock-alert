import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  let body: { shop?: string; productId?: string; productTitle?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { shop, productId, productTitle, email } = body;

  if (!shop || !productId || !email) {
    return json({ error: "Missing required fields: shop, productId, email" }, 400);
  }

  if (!EMAIL_RE.test(email)) {
    return json({ error: "Invalid email address" }, 400);
  }

  // Verify the shop exists in our DB (prevents spam subscriptions for random shops)
  const session = await prisma.session.findUnique({ where: { shop } });
  if (!session) {
    return json({ error: "Shop not found" }, 404);
  }

  try {
    await prisma.backInStockSubscriber.upsert({
      where: { shop_productId_email: { shop, productId: BigInt(productId), email } },
      update: { subscribedAt: new Date(), notifiedAt: null },
      create: { shop, productId: BigInt(productId), productTitle: productTitle ?? null, email },
    });
    return json({ success: true, message: "You'll be notified when this product is back in stock." });
  } catch {
    return json({ error: "Failed to subscribe. Please try again." }, 500);
  }
};
