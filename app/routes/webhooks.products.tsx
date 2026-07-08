import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { canAddProduct } from "../lib/plan-enforcement";
import { canUseFeature } from "../lib/plan-limits";

// The REST payload's inventory_quantity is only a single location's count,
// unreliable for multi-location stores — inventoryQuantity on a GraphQL
// variant is the reliable cross-location total (same field
// webhooks.inventory.tsx uses). Fetched once per product so a freshly
// (re)created product is seeded with its true quantity/status instead of
// guessing — see the PRODUCTS_CREATE handler below for why that matters.
const PRODUCT_VARIANTS_INVENTORY_QUERY = `
  query getProductVariantsInventory($id: ID!) {
    product(id: $id) {
      customThreshold: metafield(namespace: "stock_alert", key: "custom_threshold") { value }
      variants(first: 100) {
        edges {
          node { legacyResourceId inventoryQuantity }
        }
      }
    }
  }
`;

async function fetchTrueInventory(
  admin: any,
  productId: string,
): Promise<{ qtyByVariantId: Map<string, number>; customThreshold: number | null } | null> {
  try {
    const res = await admin.graphql(PRODUCT_VARIANTS_INVENTORY_QUERY, {
      variables: { id: `gid://shopify/Product/${productId}` },
    });
    const json: any = await res.json();
    const p = json.data?.product;
    if (!p) return null;
    const qtyByVariantId = new Map<string, number>();
    for (const edge of p.variants?.edges ?? []) {
      qtyByVariantId.set(edge.node.legacyResourceId, edge.node.inventoryQuantity ?? 0);
    }
    const customThreshold = p.customThreshold?.value ? parseInt(p.customThreshold.value) : null;
    return { qtyByVariantId, customThreshold };
  } catch {
    return null;
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);
  const data = payload as any;

  try {

  if (topic === "PRODUCTS_CREATE") {
    const productId = data?.id?.toString();
    if (!productId) return new Response(null, { status: 200 });

    // Skip variants with inventory tracking disabled in Shopify individually
    // rather than skipping the whole product.
    const variants: any[] = data?.variants ?? [];
    const trackedVariants = variants.filter((v: any) => v.inventory_management === "shopify");
    if (trackedVariants.length === 0) return new Response(null, { status: 200 });

    // Respect the plan's product cap — don't add if the merchant is already at the limit.
    const { canAdd } = await canAddProduct(shop);
    if (!canAdd) {
      console.log(`[Webhook] Product ${productId} not added — plan limit reached for ${shop}`);
      return new Response(null, { status: 200 });
    }

    const title: string = data?.title ?? "Unknown";
    const imageUrl: string | null = data?.image?.src ?? null;
    const imageAlt: string | null = data?.image?.alt ?? null;

    // Seed the true status from the reliable cross-location quantity rather
    // than the REST payload's (single-location, unreliable) inventory_quantity
    // or a hardcoded "in_stock" — a product created while already out of
    // stock would otherwise sit mislabeled "in_stock" until its next real
    // inventory change, silently swallowing that eventual restock alert
    // (previousStatus already "in_stock" == no transition == no alert).
    const [settings, storeSession, trueInventory] = await Promise.all([
      prisma.storeSettings.findUnique({ where: { shop } }),
      prisma.session.findFirst({ where: { shop, isOnline: false } }),
      fetchTrueInventory(admin, productId),
    ]);
    const globalThreshold = settings?.lowStockThreshold ?? 5;
    const effectiveThreshold =
      canUseFeature(storeSession?.plan, "perProductThresholds") && trueInventory?.customThreshold != null
        ? trueInventory.customThreshold
        : globalThreshold;
    const statusFor = (qty: number): "in_stock" | "low_stock" | "out_of_stock" =>
      qty <= 0 ? "out_of_stock" : qty <= effectiveThreshold ? "low_stock" : "in_stock";

    for (const v of trackedVariants) {
      const variantId = v.id?.toString();
      if (!variantId) continue;
      const qty = trueInventory?.qtyByVariantId.get(variantId) ?? (v.inventory_quantity ?? 0);
      const status = statusFor(qty);

      await prisma.inventoryTracking.upsert({
        where: { shop_variantId: { shop, variantId: BigInt(variantId) } },
        update: { productTitle: title, variantTitle: v.title ?? null, sku: v.sku || null, imageUrl, imageAlt },
        create: {
          shop,
          productId: BigInt(productId),
          variantId: BigInt(variantId),
          productTitle: title,
          variantTitle: v.title ?? null,
          sku: v.sku || null,
          currentQuantity: qty,
          previousQuantity: qty,
          inventoryStatus: status,
          imageUrl,
          imageAlt,
        },
      });
    }

    console.log(`[Webhook] Auto-added new product ${productId} (${title}) — ${trackedVariants.length} variant(s) for ${shop}`);
  }

  if (topic === "PRODUCTS_DELETE") {
    const productId = data?.id?.toString();
    if (productId) {
      await prisma.inventoryTracking.deleteMany({
        where: { shop, productId: BigInt(productId) },
      });
    }
  }

  if (topic === "PRODUCTS_UPDATE") {
    const productId = data?.id?.toString();
    if (!productId) return new Response(null, { status: 200 });

    const title: string = data?.title ?? "Unknown";
    const variants: any[] = data?.variants ?? [];
    // This is a REST-shaped webhook payload (confirmed by the snake_case
    // fields elsewhere in this handler, e.g. inventory_management), and
    // Shopify's REST Admin API returns status as lowercase "active" /
    // "archived" / "draft" — NOT the GraphQL API's uppercase enum. Comparing
    // against "ACTIVE" unnormalized meant this branch fired on every single
    // PRODUCTS_UPDATE for a genuinely active product, deleting its tracking
    // rows on essentially any edit in Shopify admin.
    const shopifyStatus: string | undefined = data?.status?.toUpperCase();
    const imageUrl: string | null = data?.image?.src ?? null;
    const imageAlt: string | null = data?.image?.alt ?? null;

    if (shopifyStatus && shopifyStatus !== "ACTIVE") {
      // Product is no longer active (archived or draft) — stop tracking it entirely.
      await prisma.inventoryTracking.deleteMany({
        where: { shop, productId: BigInt(productId) },
      });
      return new Response(null, { status: 200 });
    }

    if (shopifyStatus === "ACTIVE") {
      const existing = await prisma.inventoryTracking.findFirst({
        where: { shop, productId: BigInt(productId) },
        select: { id: true },
      });

      if (!existing) {
        // Product just became active — start tracking it again (mirrors PRODUCTS_CREATE).
        const trackedVariants = variants.filter((v: any) => v.inventory_management === "shopify");
        if (trackedVariants.length === 0) return new Response(null, { status: 200 });

        const { canAdd } = await canAddProduct(shop);
        if (!canAdd) {
          console.log(`[Webhook] Product ${productId} not re-added — plan limit reached for ${shop}`);
          return new Response(null, { status: 200 });
        }

        // Seed the true status from the reliable cross-location quantity —
        // see the PRODUCTS_CREATE handler above for why hardcoding "in_stock"
        // silently swallows a real restock alert.
        const [settings, storeSession, trueInventory] = await Promise.all([
          prisma.storeSettings.findUnique({ where: { shop } }),
          prisma.session.findFirst({ where: { shop, isOnline: false } }),
          fetchTrueInventory(admin, productId),
        ]);
        const globalThreshold = settings?.lowStockThreshold ?? 5;
        const effectiveThreshold =
          canUseFeature(storeSession?.plan, "perProductThresholds") && trueInventory?.customThreshold != null
            ? trueInventory.customThreshold
            : globalThreshold;
        const statusFor = (qty: number): "in_stock" | "low_stock" | "out_of_stock" =>
          qty <= 0 ? "out_of_stock" : qty <= effectiveThreshold ? "low_stock" : "in_stock";

        for (const v of trackedVariants) {
          const variantId = v.id?.toString();
          if (!variantId) continue;
          const qty = trueInventory?.qtyByVariantId.get(variantId) ?? (v.inventory_quantity ?? 0);

          await prisma.inventoryTracking.create({
            data: {
              shop,
              productId: BigInt(productId),
              variantId: BigInt(variantId),
              productTitle: title,
              variantTitle: v.title ?? null,
              sku: v.sku || null,
              currentQuantity: qty,
              previousQuantity: qty,
              inventoryStatus: statusFor(qty),
              imageUrl,
              imageAlt,
            },
          });
        }
        console.log(`[Webhook] Re-added product ${productId} (${title}) — ${trackedVariants.length} variant(s) for ${shop} after status change to ACTIVE`);
        return new Response(null, { status: 200 });
      }
    }

    // Always sync title and image (whole-product fields) regardless of status change.
    await prisma.inventoryTracking.updateMany({
      where: { shop, productId: BigInt(productId) },
      data: {
        ...(title ? { productTitle: title } : {}),
        imageUrl,
        imageAlt,
      },
    });

    // SKU and variant title are per-variant — sync each variant present in the payload.
    for (const v of variants) {
      const variantId = v.id?.toString();
      if (!variantId) continue;
      await prisma.inventoryTracking.updateMany({
        where: { shop, variantId: BigInt(variantId) },
        data: { sku: v.sku || null, variantTitle: v.title ?? null },
      });
    }
  }

  } catch (err) {
    console.error(`[Webhook] products handler error for ${shop}:`, err instanceof Error ? err.message : err);
    // Return 200 so Shopify doesn't retry — the error is logged for investigation.
  }

  return new Response(null, { status: 200 });
};
