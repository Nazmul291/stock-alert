import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendRestockAlert, sendBackInStockNotifications } from "../lib/notifications";
import {
  getBoss,
  QUEUE_NAME,
  DEBOUNCE_SECONDS,
  JOB_RETRY_LIMIT,
  JOB_RETRY_DELAY,
  type BufferPayload,
} from "../lib/queue";
import { PRODUCT_METAFIELDS_QUERY } from "../lib/graphql";
import { syncState } from "../lib/sync-state.server";
import { computeStockOutDays } from "../lib/velocity.server";
import { fireOutboundWebhook } from "../lib/outbound-webhook.server";

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

// 5-minute in-memory cache for per-product metafields — avoids an extra GraphQL
// call on every inventory webhook for the same product within a 5-minute window.
type ProductMeta = { customThreshold: number | null; autoHide: boolean | null; autoRepublish: boolean | null };
const metafieldCache = new Map<string, { data: ProductMeta; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of metafieldCache) {
    if (now > entry.expiresAt) metafieldCache.delete(k);
  }
}, 60_000);

// In-memory dedup cache (3-second TTL) — prevents the same location event from
// hammering the DB when Shopify fires duplicate webhook deliveries.
const requestCache = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of requestCache) {
    if (now - ts > 3000) requestCache.delete(k);
  }
}, 10_000);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  if (topic !== "INVENTORY_LEVELS_UPDATE") {
    return new Response(null, { status: 200 });
  }

  const data = payload as any;
  const inventoryItemId = data?.inventory_item_id?.toString();
  if (!inventoryItemId) return new Response(null, { status: 200 });

  // 3-second in-memory dedup keyed on shop + item + location
  const cacheKey = `${shop}_${inventoryItemId}_${data.location_id ?? 0}`;
  const now = Date.now();
  if (requestCache.has(cacheKey) && now - requestCache.get(cacheKey)! < 3000) {
    return new Response(null, { status: 200 });
  }
  requestCache.set(cacheKey, now);

  // Track webhook health non-blocking
  syncState.webhookReceived(shop).catch(() => {});

  // Return 200 immediately; all heavy work is async
  processInventoryUpdate(shop, inventoryItemId, data, admin).catch((err) =>
    console.error("[Webhook] Background processing error:", err),
  );

  return new Response(null, { status: 200 });
};

async function processInventoryUpdate(
  shop: string,
  inventoryItemId: string,
  data: any,
  admin: any,
) {
  if (!admin) {
    console.warn(`[Webhook] No admin client for shop ${shop} — skipping`);
    return;
  }

  // ── 1. Resolve product from Shopify ───────────────────────────────────────
  const invRes = await admin.graphql(INVENTORY_ITEM_QUERY, {
    variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` },
  });
  const invJson: any = await invRes.json();
  const product = invJson.data?.inventoryItem?.variant?.product;
  const productId: string | undefined = product?.legacyResourceId;
  const productImageUrl: string | null = product?.featuredImage?.url ?? null;

  if (!productId) {
    console.warn(
      `[Webhook] Could not resolve productId for inventoryItem ${inventoryItemId} on ${shop}`,
    );
    return;
  }

  // Sum inventoryQuantity across ALL variants → true cross-location total
  const newQtyTotal: number = (product?.variants?.edges ?? []).reduce(
    (sum: number, e: any) => sum + (e.node.inventoryQuantity ?? 0),
    0,
  );
  console.log(
    `[Webhook] ${shop} product ${productId}: total qty across all locations = ${newQtyTotal}`,
  );

  // ── 2. DB lookups ─────────────────────────────────────────────────────────
  const [existingTracking, settings, storeSession] = await Promise.all([
    prisma.inventoryTracking.findUnique({
      where: { shop_productId: { shop, productId: BigInt(productId) } },
    }),
    prisma.storeSettings.findUnique({ where: { shop } }),
    prisma.session.findFirst({ where: { shop, isOnline: false } }),
  ]);

  if (!existingTracking) {
    console.log(`[Webhook] Product ${productId} not tracked in DB for ${shop} — skipping`);
    return;
  }
  if (!storeSession?.plan) {
    console.log(`[Webhook] No active plan for ${shop} — skipping`);
    return;
  }
  if (!settings) {
    console.warn(`[Webhook] No store settings found for ${shop} — skipping`);
    return;
  }
  if (!existingTracking.monitoringEnabled) {
    console.log(
      `[Webhook] Monitoring disabled for product ${productId} (${existingTracking.productTitle}) on ${shop} — skipping`,
    );
    return;
  }

  // ── 3. Per-product metafield overrides (5-min cached) ────────────────────
  const cacheMetaKey = `${shop}:${productId}`;
  const cached = metafieldCache.get(cacheMetaKey);
  let productMeta: ProductMeta = { customThreshold: null, autoHide: null, autoRepublish: null };
  if (cached && Date.now() < cached.expiresAt) {
    productMeta = cached.data;
  } else {
    try {
      const res = await admin.graphql(PRODUCT_METAFIELDS_QUERY, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });
      const json: any = await res.json();
      const p = json.data?.product;
      if (p) {
        productMeta = {
          customThreshold: p.customThreshold?.value ? parseInt(p.customThreshold.value) : null,
          autoHide: p.autoHide?.value !== undefined ? p.autoHide.value === "true" : null,
          autoRepublish: p.autoRepublish?.value !== undefined ? p.autoRepublish.value === "true" : null,
        };
      }
      metafieldCache.set(cacheMetaKey, { data: productMeta, expiresAt: Date.now() + 5 * 60 * 1000 });
    } catch {
      // Metafield fetch failed — fall through with store-level defaults
    }
  }

  // ── 4. Status determination ───────────────────────────────────────────────
  const previousQty = existingTracking.currentQuantity ?? 0;
  const previousStatus = existingTracking.inventoryStatus ?? "in_stock";
  const newQty = newQtyTotal;
  const qtyChanged = newQty !== previousQty;

  // Per-product custom thresholds are a Pro feature; ignore the metafield for basic stores.
  const threshold =
    (storeSession?.plan === "pro" && productMeta.customThreshold !== null)
      ? productMeta.customThreshold
      : settings.lowStockThreshold;
  const newStatus: "in_stock" | "low_stock" | "out_of_stock" =
    newQty === 0 ? "out_of_stock" : newQty <= threshold ? "low_stock" : "in_stock";

  console.log(
    `[Webhook] Product ${productId} (${existingTracking.productTitle}): qty ${previousQty}→${newQty} (changed:${qtyChanged}), status ${previousStatus}→${newStatus}, threshold ${threshold}`,
  );

  if (previousStatus === "deactivated") {
    console.log(`[Webhook] Product ${productId} is deactivated — skipping`);
    return;
  }

  // Update DB tracking whenever qty changed
  if (qtyChanged) {
    const effectiveDailySales = existingTracking.manualDailySales ?? existingTracking.avgDailySales;
    const newStockOutDays = computeStockOutDays(newQty, effectiveDailySales);
    await prisma.inventoryTracking.update({
      where: { id: existingTracking.id },
      data: {
        currentQuantity: newQty,
        previousQuantity: previousQty,
        inventoryStatus: newStatus,
        lastCheckedAt: new Date(),
        ...(effectiveDailySales ? { stockOutDays: newStockOutDays } : {}),
      },
    });
  }

  // ── 5. Determine alert type ───────────────────────────────────────────────
  const alertType =
    newStatus === "out_of_stock"
      ? "out_of_stock"
      : newStatus === "low_stock"
      ? "low_stock"
      : previousStatus !== "in_stock"
      ? "restock"
      : null;

  if (!alertType) {
    console.log(`[Webhook] No alert needed — alertType: none`);
    return;
  }

  // ── 6. 24-hour per-type cooldown check ───────────────────────────────────
  // Uses the stamp written to inventory_tracking by logAlert — no extra query.
  // Prevents repeated alerts when inventory bounces repeatedly near the threshold.
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const withinCooldown =
    existingTracking.lastAlertSentAt !== null &&
    existingTracking.lastAlertSentAt > twentyFourHoursAgo &&
    existingTracking.lastAlertType === alertType;

  if (withinCooldown) {
    const hoursAgo = Math.round(
      (Date.now() - existingTracking.lastAlertSentAt!.getTime()) / 3_600_000,
    );
    console.log(
      `[Webhook] Skipping ${alertType} alert for product ${productId} — same type sent ${hoursAgo}h ago (< 24h cooldown)`,
    );
    return;
  }

  // ── 7. Build shared context objects ──────────────────────────────────────
  const storeCtx = {
    shop,
    plan: storeSession?.plan ?? "basic",
    email: storeSession?.email ?? null,
  };
  const settingsCtx = {
    emailNotifications: settings.emailNotifications,
    slackNotifications: settings.slackNotifications,
    notificationEmail: settings.notificationEmail,
    slackWebhookUrl: settings.slackWebhookUrl,
    brandLogoUrl: settings.brandLogoUrl,
    brandColor: settings.brandColor,
    brandSenderName: settings.brandSenderName,
  };
  const productCtx = {
    id: productId,
    title: existingTracking.productTitle ?? "Unknown",
    sku: existingTracking.sku ?? null,
    imageUrl: productImageUrl,
  };

  console.log(
    `[Webhook] Preparing ${alertType} alert — emailEnabled:${settings.emailNotifications}, recipient:${settings.notificationEmail || storeSession?.email || "(none)"}`,
  );

  // ── 8. Route the alert ────────────────────────────────────────────────────
  if (alertType === "restock") {
    // Restock fires immediately — no need to debounce going from 0→N.
    await sendRestockAlert(storeCtx, productCtx, newQty, settingsCtx);
    // Notify back-in-stock subscribers (non-blocking)
    sendBackInStockNotifications(
      shop,
      productId,
      productCtx.title,
      shop,
      process.env.SHOPIFY_APP_URL ?? "",
      { logoUrl: settingsCtx.brandLogoUrl, color: settingsCtx.brandColor, senderName: settingsCtx.brandSenderName },
    ).catch((err) => console.error("[Webhook] Back-in-stock notifications failed:", err));
  } else {
    // low_stock and out_of_stock go through the debounce buffer.
    // Shopify may fire dozens of parallel webhooks per bulk inventory update;
    // the buffer collapses them into a single notification per product per type.
    await upsertBufferAndSchedule(shop, productId, alertType as "low_stock" | "out_of_stock", {
      alertType: alertType as "low_stock" | "out_of_stock",
      newQty,
      threshold,
      storeCtx,
      settingsCtx,
      productCtx,
    });
  }

  // ── 8b. Outbound webhook (Pro, non-blocking) ──────────────────────────────
  if (storeSession?.plan === "pro" && settings.outboundWebhookUrl) {
    fireOutboundWebhook(settings.outboundWebhookUrl, {
      event: alertType as "low_stock" | "out_of_stock" | "restock",
      shop,
      productId,
      productTitle: productCtx.title,
      sku: productCtx.sku,
      currentQuantity: newQty,
      threshold,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  // ── 9. Auto-hide / auto-republish (fires immediately, separate from alerts) ──
  // Per-product setting wins; falls back to store-wide default when not set.
  const effectiveAutoHide = productMeta.autoHide !== null ? productMeta.autoHide : settings.autoHideEnabled;
  const effectiveAutoRepublish = productMeta.autoRepublish !== null ? productMeta.autoRepublish : settings.autoRepublishEnabled;

  if (
    newStatus === "out_of_stock" &&
    effectiveAutoHide &&
    !existingTracking.isHidden
  ) {
    const res = await admin.graphql(
      `mutation productUpdate($input: ProductInput!) { productUpdate(input: $input) { userErrors { message } } }`,
      { variables: { input: { id: `gid://shopify/Product/${productId}`, status: "ARCHIVED" } } },
    );
    const json: any = await res.json();
    const errs: string[] = json.data?.productUpdate?.userErrors?.map((e: any) => e.message) ?? [];
    if (errs.length > 0) {
      console.error(`[Webhook] Auto-hide failed for product ${productId}:`, errs.join(", "));
    } else {
      await prisma.inventoryTracking.update({
        where: { id: existingTracking.id },
        data: { isHidden: true },
      });
    }
  }

  if (
    newStatus === "in_stock" &&
    previousQty === 0 &&
    effectiveAutoRepublish &&
    storeSession?.plan === "pro" &&
    existingTracking.isHidden
  ) {
    const res = await admin.graphql(
      `mutation productUpdate($input: ProductInput!) { productUpdate(input: $input) { userErrors { message } } }`,
      { variables: { input: { id: `gid://shopify/Product/${productId}`, status: "ACTIVE" } } },
    );
    const json: any = await res.json();
    const errs: string[] = json.data?.productUpdate?.userErrors?.map((e: any) => e.message) ?? [];
    if (errs.length > 0) {
      console.error(`[Webhook] Auto-republish failed for product ${productId}:`, errs.join(", "));
    } else {
      await prisma.inventoryTracking.update({
        where: { id: existingTracking.id },
        data: { isHidden: false },
      });
    }
  }
}

// ── Buffer upsert + pg-boss job scheduling ───────────────────────────────────

async function upsertBufferAndSchedule(
  shop: string,
  productId: string,
  alertType: "low_stock" | "out_of_stock",
  payload: BufferPayload,
): Promise<void> {
  // eventKey uniquely identifies: which product, which shop, which alert type.
  const eventKey = `${productId}_${shop}_${alertType}`;
  const boss = await getBoss();

  // pg_advisory_xact_lock serializes concurrent webhooks for the same eventKey
  // at the DB level — handles millisecond-apart bursts without a race condition.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventKey}))`;

    const existing = await tx.inventoryBuffer.findUnique({
      where: { eventKey },
      select: { jobId: true },
    });

    if (existing?.jobId) {
      try {
        await boss.cancel(QUEUE_NAME, existing.jobId);
      } catch {
        // Already ran or cancelled — safe to ignore.
      }
    }

    await tx.inventoryBuffer.upsert({
      where: { eventKey },
      update: { payload: payload as any },
      create: { eventKey, shop, productId, alertType, payload: payload as any },
    });

    const jobId = await boss.send(QUEUE_NAME, { eventKey }, {
      startAfter: DEBOUNCE_SECONDS,
      retryLimit: JOB_RETRY_LIMIT,
      retryDelay: JOB_RETRY_DELAY,
      retryBackoff: true,
    });
    if (jobId) {
      await tx.inventoryBuffer.update({ where: { eventKey }, data: { jobId } });
    }
  });

  console.log(
    `[Webhook] Debounce reset for ${alertType} — product ${productId}, key: ${eventKey}, fires in ${DEBOUNCE_SECONDS}s`,
  );
}
