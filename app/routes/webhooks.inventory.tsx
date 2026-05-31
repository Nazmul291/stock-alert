import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendLowStockAlert, sendOutOfStockAlert, sendRestockAlert } from "../lib/notifications";

const INVENTORY_ITEM_QUERY = `
  query ($id: ID!) {
    inventoryItem(id: $id) {
      variant {
        product {
          legacyResourceId
          featuredImage { url }
          variants(first: 100) {
            edges { node { inventoryQuantity } }
          }
        }
      }
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

  // Dedup: keyed on shop + item + location so parallel location updates are each processed
  const cacheKey = `${shop}_${inventoryItemId}_${data.location_id ?? 0}`;
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
  if (!admin) {
    console.warn(`[Webhook] No admin client for shop ${shop} — skipping`);
    return;
  }

  // Resolve product ID from inventory item via Shopify API
  const invRes = await admin.graphql(INVENTORY_ITEM_QUERY, {
    variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` },
  });
  const invJson: any = await invRes.json();
  const product = invJson.data?.inventoryItem?.variant?.product;
  const productId: string | undefined = product?.legacyResourceId;
  const productImageUrl: string | null = product?.featuredImage?.url ?? null;
  if (!productId) {
    console.warn(`[Webhook] Could not resolve productId for inventoryItem ${inventoryItemId} on ${shop}`);
    return;
  }

  // Sum inventoryQuantity across all variants to get the real total across all locations
  const newQtyTotal: number = (product?.variants?.edges ?? []).reduce(
    (sum: number, e: any) => sum + (e.node.inventoryQuantity ?? 0),
    0,
  );
  console.log(`[Webhook] ${shop} product ${productId}: total qty across all locations = ${newQtyTotal}`);

  const [existingTracking, settings, storeSession] = await Promise.all([
    prisma.inventoryTracking.findUnique({ where: { shop_productId: { shop, productId: BigInt(productId) } } }),
    prisma.storeSettings.findUnique({ where: { shop } }),
    prisma.session.findFirst({ where: { shop, isOnline: false } }),
  ]);

  if (!existingTracking) {
    console.log(`[Webhook] Product ${productId} not tracked in DB for ${shop} — skipping`);
    return;
  }
  if (!settings) {
    console.warn(`[Webhook] No store settings found for ${shop} — skipping`);
    return;
  }
  if (!existingTracking.monitoringEnabled) {
    console.log(`[Webhook] Monitoring disabled for product ${productId} (${existingTracking.productTitle}) on ${shop} — skipping`);
    return;
  }

  // Fetch per-product overrides from Shopify metafields
  let productMeta = { customThreshold: null as number | null, excludeFromAlerts: false, excludeFromAutoHide: false };
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

  if (productMeta.excludeFromAlerts) {
    console.log(`[Webhook] Product ${productId} excluded from alerts via metafield on ${shop}`);
  }

  const previousQty = existingTracking.currentQuantity ?? 0;
  const previousStatus = existingTracking.inventoryStatus ?? "in_stock";
  const newQty: number = newQtyTotal;
  const qtyChanged = newQty !== previousQty;

  const threshold = productMeta.customThreshold ?? settings.lowStockThreshold;
  const newStatus: "in_stock" | "low_stock" | "out_of_stock" =
    newQty === 0 ? "out_of_stock" : newQty <= threshold ? "low_stock" : "in_stock";

  console.log(`[Webhook] Product ${productId} (${existingTracking.productTitle}): qty ${previousQty}→${newQty} (changed:${qtyChanged}), status ${previousStatus}→${newStatus}, threshold ${threshold}`);

  if (previousStatus === "deactivated") {
    console.log(`[Webhook] Product ${productId} is deactivated — skipping`);
    return;
  }

  // Update DB whenever qty changed
  if (qtyChanged) {
    await prisma.inventoryTracking.update({
      where: { id: existingTracking.id },
      data: { currentQuantity: newQty, previousQuantity: previousQty, inventoryStatus: newStatus, lastCheckedAt: new Date() },
    });
  }

  // Determine the alert type for the current status
  const alertType =
    newStatus === "out_of_stock" ? "out_of_stock" :
    newStatus === "low_stock"    ? "low_stock"    :
    previousStatus !== "in_stock" ? "restock"     : null; // restock only when coming from a critical state

  if (!alertType || productMeta.excludeFromAlerts) {
    console.log(`[Webhook] No alert needed — alertType:${alertType ?? "none"}, excluded:${productMeta.excludeFromAlerts}`);
    return;
  }

  // Check the last alert sent for this product to apply 1-hour cooldown per alert type
  const lastAlert = await prisma.alertHistory.findFirst({
    where: { shop, productId: BigInt(productId) },
    orderBy: { sentAt: "desc" },
  });

  const oneHourAgo = new Date(Date.now() - 10 * 60 * 1000);
  const withinCooldown = lastAlert && lastAlert.sentAt > oneHourAgo && lastAlert.alertType === alertType;

  if (withinCooldown) {
    const minsAgo = Math.round((Date.now() - lastAlert!.sentAt.getTime()) / 60_000);
    console.log(`[Webhook] Skipping ${alertType} alert for product ${productId} — same type sent ${minsAgo}m ago (< 10m cooldown)`);
    return;
  }

  const storeCtx = { shop, plan: storeSession?.plan ?? "basic", email: storeSession?.email ?? null };
  const settingsCtx = {
    emailNotifications: settings.emailNotifications,
    slackNotifications: settings.slackNotifications,
    notificationEmail: settings.notificationEmail,
    slackWebhookUrl: settings.slackWebhookUrl,
  };
  const productCtx = { id: productId, title: existingTracking.productTitle ?? "Unknown", sku: existingTracking.sku ?? null, imageUrl: productImageUrl };

  console.log(`[Webhook] Sending ${alertType} alert — emailEnabled:${settings.emailNotifications}, recipient:${settings.notificationEmail || storeSession?.email || "(none)"}`);

  if (newStatus === "out_of_stock") {
    await sendOutOfStockAlert(storeCtx, productCtx, settingsCtx);
  } else if (newStatus === "low_stock") {
    await sendLowStockAlert(storeCtx, productCtx, newQty, threshold, settingsCtx);
  } else {
    await sendRestockAlert(storeCtx, productCtx, newQty, settingsCtx);
  }

  if (newStatus === "out_of_stock" && settings.autoHideEnabled && !productMeta.excludeFromAutoHide && !existingTracking.isHidden) {
    await Promise.all([
      admin.graphql(`mutation productUpdate($input: ProductInput!) { productUpdate(input: $input) { userErrors { message } } }`, {
        variables: { input: { id: `gid://shopify/Product/${productId}`, status: "ARCHIVED" } },
      }),
      prisma.inventoryTracking.update({ where: { id: existingTracking.id }, data: { isHidden: true } }),
    ]);
  }

  if (newStatus === "in_stock" && previousQty === 0 && settings.autoRepublishEnabled && storeSession?.plan === "pro" && !productMeta.excludeFromAutoHide && existingTracking.isHidden) {
    await Promise.all([
      admin.graphql(`mutation productUpdate($input: ProductInput!) { productUpdate(input: $input) { userErrors { message } } }`, {
        variables: { input: { id: `gid://shopify/Product/${productId}`, status: "ACTIVE" } },
      }),
      prisma.inventoryTracking.update({ where: { id: existingTracking.id }, data: { isHidden: false } }),
    ]);
  }
}
