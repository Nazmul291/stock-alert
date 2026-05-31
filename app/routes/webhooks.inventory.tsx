import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendRestockAlert } from "../lib/notifications";
import {
  getBoss,
  QUEUE_NAME,
  DEBOUNCE_SECONDS,
  type BufferPayload,
} from "../lib/queue";

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

  // ── 3. Per-product metafield overrides ────────────────────────────────────
  let productMeta = {
    customThreshold: null as number | null,
    excludeFromAlerts: false,
    excludeFromAutoHide: false,
  };
  try {
    const res = await admin.graphql(PRODUCT_METAFIELDS_QUERY, {
      variables: { id: `gid://shopify/Product/${productId}` },
    });
    const json: any = await res.json();
    const p = json.data?.product;
    if (p) {
      productMeta = {
        customThreshold: p.customThreshold?.value
          ? parseInt(p.customThreshold.value)
          : null,
        excludeFromAlerts: p.excludeFromAlerts?.value === "true",
        excludeFromAutoHide: p.excludeFromAutoHide?.value === "true",
      };
    }
  } catch {
    // Metafield fetch failed — fall through with store-level defaults
  }

  // ── 4. Status determination ───────────────────────────────────────────────
  const previousQty = existingTracking.currentQuantity ?? 0;
  const previousStatus = existingTracking.inventoryStatus ?? "in_stock";
  const newQty = newQtyTotal;
  const qtyChanged = newQty !== previousQty;

  const threshold = productMeta.customThreshold ?? settings.lowStockThreshold;
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
    await prisma.inventoryTracking.update({
      where: { id: existingTracking.id },
      data: {
        currentQuantity: newQty,
        previousQuantity: previousQty,
        inventoryStatus: newStatus,
        lastCheckedAt: new Date(),
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

  if (!alertType || productMeta.excludeFromAlerts) {
    console.log(
      `[Webhook] No alert needed — alertType:${alertType ?? "none"}, excluded:${productMeta.excludeFromAlerts}`,
    );
    return;
  }

  // ── 6. 10-minute cooldown check ───────────────────────────────────────────
  // Prevents scheduling buffer jobs for alerts we know we'll suppress anyway.
  const lastAlert = await prisma.alertHistory.findFirst({
    where: { shop, productId: BigInt(productId) },
    orderBy: { sentAt: "desc" },
  });
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const withinCooldown =
    lastAlert &&
    lastAlert.sentAt > tenMinutesAgo &&
    lastAlert.alertType === alertType;

  if (withinCooldown) {
    const minsAgo = Math.round(
      (Date.now() - lastAlert!.sentAt.getTime()) / 60_000,
    );
    console.log(
      `[Webhook] Skipping ${alertType} alert for product ${productId} — same type sent ${minsAgo}m ago (< 10m cooldown)`,
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

  // ── 9. Auto-hide / auto-republish (fires immediately, separate from alerts) ──
  if (
    newStatus === "out_of_stock" &&
    settings.autoHideEnabled &&
    !productMeta.excludeFromAutoHide &&
    !existingTracking.isHidden
  ) {
    await Promise.all([
      admin.graphql(
        `mutation productUpdate($input: ProductInput!) { productUpdate(input: $input) { userErrors { message } } }`,
        { variables: { input: { id: `gid://shopify/Product/${productId}`, status: "ARCHIVED" } } },
      ),
      prisma.inventoryTracking.update({
        where: { id: existingTracking.id },
        data: { isHidden: true },
      }),
    ]);
  }

  if (
    newStatus === "in_stock" &&
    previousQty === 0 &&
    settings.autoRepublishEnabled &&
    storeSession?.plan === "pro" &&
    !productMeta.excludeFromAutoHide &&
    existingTracking.isHidden
  ) {
    await Promise.all([
      admin.graphql(
        `mutation productUpdate($input: ProductInput!) { productUpdate(input: $input) { userErrors { message } } }`,
        { variables: { input: { id: `gid://shopify/Product/${productId}`, status: "ACTIVE" } } },
      ),
      prisma.inventoryTracking.update({
        where: { id: existingTracking.id },
        data: { isHidden: false },
      }),
    ]);
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

  // Cancel the previous pending job so the debounce timer resets.
  // Only one pg-boss job per eventKey exists at any time.
  const existing = await prisma.inventoryBuffer.findUnique({
    where: { eventKey },
    select: { jobId: true },
  });
  if (existing?.jobId) {
    try {
      await boss.cancel(QUEUE_NAME, existing.jobId);
    } catch {
      // Job already ran or was cancelled — safe to ignore.
    }
  }

  // Upsert the buffer row with the latest payload.
  try {
    await prisma.inventoryBuffer.upsert({
      where: { eventKey },
      update: { payload: payload as any },
      create: { eventKey, shop, productId, alertType, payload: payload as any },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      await prisma.inventoryBuffer.update({
        where: { eventKey },
        data: { payload: payload as any },
      });
    } else {
      throw err;
    }
  }

  // Schedule a new debounce job and store its ID so the next webhook can cancel it.
  const jobId = await boss.send(QUEUE_NAME, { eventKey }, { startAfter: DEBOUNCE_SECONDS });
  if (jobId) {
    await prisma.inventoryBuffer.update({ where: { eventKey }, data: { jobId } });
  }

  console.log(
    `[Webhook] Debounce reset for ${alertType} — product ${productId}, key: ${eventKey}, fires in ${DEBOUNCE_SECONDS}s`,
  );
}
