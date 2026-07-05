import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { canAddProduct } from "../lib/plan-enforcement";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
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

    for (const v of trackedVariants) {
      const variantId = v.id?.toString();
      if (!variantId) continue;
      const qty = v.inventory_quantity ?? 0;

      await prisma.inventoryTracking.upsert({
        where: { shop_variantId: { shop, variantId: BigInt(variantId) } },
        update: { productTitle: title, variantTitle: v.title ?? null, sku: v.sku || null, imageUrl, imageAlt },
        // Seed with "in_stock" regardless of the REST payload quantity.
        // The REST webhook only carries single-location qty which is unreliable for
        // multi-location stores. Starting optimistically means the first real
        // inventory_levels/update transitions in_stock→out_of_stock (correct alert)
        // rather than out_of_stock→in_stock (false restock alert).
        create: {
          shop,
          productId: BigInt(productId),
          variantId: BigInt(variantId),
          productTitle: title,
          variantTitle: v.title ?? null,
          sku: v.sku || null,
          currentQuantity: qty,
          previousQuantity: qty,
          inventoryStatus: "in_stock",
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
    const shopifyStatus: string | undefined = data?.status; // "ACTIVE" | "ARCHIVED" | "DRAFT"
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

        for (const v of trackedVariants) {
          const variantId = v.id?.toString();
          if (!variantId) continue;
          const qty = v.inventory_quantity ?? 0;

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
              // Seed with "in_stock" regardless of the REST payload quantity — see
              // the PRODUCTS_CREATE comment above for why.
              inventoryStatus: "in_stock",
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
