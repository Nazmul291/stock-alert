import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendLowStockAlert, sendOutOfStockAlert, sendRestockAlert } from "../lib/notifications";

const INVENTORY_ITEM_QUERY = `
  query ($id: ID!) {
    inventoryItem(id: $id) {
      variant { product { legacyResourceId } }
    }
  }
`;

const PRODUCT_METAFIELDS_QUERY = `
  query ($id: ID!) {
    product(id: $id) {
      customThreshold: metafield(namespace: "stock_alert", key: "custom_threshold") { value }
      excludeFromAlerts: metafield(namespace: "stock_alert", key: "exclude_from_alerts") { value }
      excludeFromAutoHide: metafield(namespace: "stock_alert", key: "exclude_from_auto_hide") { value }
    }
  }
`;

// In-memory dedup cache (3-second TTL)
const requestCache = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of requestCache) {
    if (now - ts > 3000) requestCache.delete(k);
  }
}, 10000);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  if (topic !== "INVENTORY_LEVELS_UPDATE") {
    return new Response(null, { status: 200 });
  }

  const data = payload as any;
  const inventoryItemId = data?.inventory_item_id?.toString();
  if (!inventoryItemId) return new Response(null, { status: 200 });

  // Dedup check
  const cacheKey = `${shop}_${inventoryItemId}_${data.available ?? 0}`;
  const now = Date.now();
  if (requestCache.has(cacheKey) && now - requestCache.get(cacheKey)! < 3000) {
    return new Response(null, { status: 200 });
  }
  requestCache.set(cacheKey, now);

  // Process async so Shopify gets an immediate 200
  processInventoryUpdate(shop, inventoryItemId, data, admin).catch((err) =>
    console.error("[Webhook] Background processing error:", err),
  );

  return new Response(null, { status: 200 });
};

async function processInventoryUpdate(shop: string, inventoryItemId: string, data: any, admin: any) {
  if (!admin) return;

  // Resolve product ID from inventory item via Shopify API
  const invRes = await admin.graphql(INVENTORY_ITEM_QUERY, {
    variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` },
  });
  const invJson: any = await invRes.json();
  const productId: string | undefined = invJson.data?.inventoryItem?.variant?.product?.legacyResourceId;
  if (!productId) return;

  const [existingTracking, settings, storeSession] = await Promise.all([
    prisma.inventoryTracking.findUnique({ where: { shop_productId: { shop, productId: BigInt(productId) } } }),
    prisma.storeSettings.findUnique({ where: { shop } }),
    prisma.session.findFirst({ where: { shop, isOnline: false } }),
  ]);

  if (!settings) return;

  // Fetch per-product overrides from Shopify metafields
  let productMeta = { customThreshold: null as number | null, excludeFromAlerts: false, excludeFromAutoHide: false };
  if (admin) {
    try {
      const res = await admin.graphql(PRODUCT_METAFIELDS_QUERY, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });
      const json: any = await res.json();
      const p = json.data?.product;
      if (p) {
        productMeta = {
          customThreshold: p.customThreshold?.value ? parseInt(p.customThreshold.value) : null,
          excludeFromAlerts: p.excludeFromAlerts?.value === "true",
          excludeFromAutoHide: p.excludeFromAutoHide?.value === "true",
        };
      }
    } catch {
      // Metafield fetch failed — proceed with store-level defaults
    }
  }

  const previousQty = existingTracking?.currentQuantity ?? 0;
  const previousStatus = existingTracking?.inventoryStatus ?? "in_stock";
  const newQty: number = data.available ?? 0;

  if (newQty === previousQty) return;

  const threshold = productMeta.customThreshold ?? settings.lowStockThreshold;
  const newStatus: "in_stock" | "low_stock" | "out_of_stock" =
    newQty === 0 ? "out_of_stock" : newQty <= threshold ? "low_stock" : "in_stock";

  if (previousStatus === "deactivated") return;

  if (existingTracking) {
    await prisma.inventoryTracking.update({
      where: { id: existingTracking.id },
      data: { currentQuantity: newQty, previousQuantity: previousQty, inventoryStatus: newStatus, lastCheckedAt: new Date() },
    });
  }

  const storeCtx = { shop, plan: storeSession?.plan ?? "free", email: storeSession?.email ?? null };
  const settingsCtx = {
    emailNotifications: settings.emailNotifications,
    slackNotifications: settings.slackNotifications,
    notificationEmail: settings.notificationEmail,
    slackWebhookUrl: settings.slackWebhookUrl,
  };
  const productCtx = { id: productId, title: existingTracking?.productTitle ?? "Unknown", sku: existingTracking?.sku ?? null };

  if (previousStatus !== newStatus && !productMeta.excludeFromAlerts) {
    if (newStatus === "out_of_stock") {
      await sendOutOfStockAlert(storeCtx, productCtx, settingsCtx);
    } else if (newStatus === "low_stock" && previousStatus === "in_stock") {
      await sendLowStockAlert(storeCtx, productCtx, newQty, threshold, settingsCtx);
    } else if (newStatus === "in_stock" && previousStatus !== "in_stock") {
      await sendRestockAlert(storeCtx, productCtx, newQty, settingsCtx);
    }
  }

  if (newStatus === "out_of_stock" && settings.autoHideEnabled && !productMeta.excludeFromAutoHide && existingTracking && !existingTracking.isHidden) {
    await prisma.inventoryTracking.update({ where: { id: existingTracking.id }, data: { isHidden: true } });
  }

  if (newStatus === "in_stock" && previousQty === 0 && settings.autoRepublishEnabled && storeSession?.plan === "pro" && !productMeta.excludeFromAutoHide && existingTracking?.isHidden) {
    await prisma.inventoryTracking.update({ where: { id: existingTracking.id }, data: { isHidden: false } });
  }
}
