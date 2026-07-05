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

    // Skip products where every variant has inventory tracking disabled in Shopify.
    const variants: any[] = data?.variants ?? [];
    const allUntracked = variants.length > 0 && variants.every((v: any) => v.inventory_management !== "shopify");
    if (allUntracked) return new Response(null, { status: 200 });

    // Respect the plan's product cap — don't add if the merchant is already at the limit.
    const { canAdd } = await canAddProduct(shop);
    if (!canAdd) {
      console.log(`[Webhook] Product ${productId} not added — plan limit reached for ${shop}`);
      return new Response(null, { status: 200 });
    }

    const title: string = data?.title ?? "Unknown";
    const skus: string[] = variants.map((v: any) => v.sku).filter(Boolean);
    const totalQty: number = variants.reduce((sum: number, v: any) => sum + (v.inventory_quantity ?? 0), 0);

    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    const threshold = settings?.lowStockThreshold ?? 5;
    const inventoryStatus: "in_stock" | "low_stock" | "out_of_stock" =
      totalQty <= 0 ? "out_of_stock" : totalQty <= threshold ? "low_stock" : "in_stock";

    await prisma.inventoryTracking.upsert({
      where: { shop_productId: { shop, productId: BigInt(productId) } },
      update: { productTitle: title, sku: skus.join(", ") || null },
      // Seed with "in_stock" regardless of the REST payload quantity.
      // The REST webhook only carries single-location qty which is unreliable for
      // multi-location stores. Starting optimistically means the first real
      // inventory_levels/update transitions in_stock→out_of_stock (correct alert)
      // rather than out_of_stock→in_stock (false restock alert).
      create: {
        shop,
        productId: BigInt(productId),
        productTitle: title,
        sku: skus.join(", ") || null,
        currentQuantity: totalQty,
        previousQuantity: totalQty,
        inventoryStatus: "in_stock",
      },
    });

    console.log(`[Webhook] Auto-added new product ${productId} (${title}) for ${shop}`);
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
    const skus: string[] = variants.map((v: any) => v.sku).filter(Boolean);
    const shopifyStatus: string | undefined = data?.status; // "ACTIVE" | "ARCHIVED" | "DRAFT"

    if (shopifyStatus && shopifyStatus !== "ACTIVE") {
      // Product is no longer active (archived or draft) — stop tracking it entirely.
      await prisma.inventoryTracking.deleteMany({
        where: { shop, productId: BigInt(productId) },
      });
      return new Response(null, { status: 200 });
    }

    if (shopifyStatus === "ACTIVE") {
      const existing = await prisma.inventoryTracking.findUnique({
        where: { shop_productId: { shop, productId: BigInt(productId) } },
      });

      if (!existing) {
        // Product just became active — start tracking it again (mirrors PRODUCTS_CREATE).
        const allUntracked = variants.length > 0 && variants.every((v: any) => v.inventory_management !== "shopify");
        if (allUntracked) return new Response(null, { status: 200 });

        const { canAdd } = await canAddProduct(shop);
        if (!canAdd) {
          console.log(`[Webhook] Product ${productId} not re-added — plan limit reached for ${shop}`);
          return new Response(null, { status: 200 });
        }

        const totalQty: number = variants.reduce((sum: number, v: any) => sum + (v.inventory_quantity ?? 0), 0);

        await prisma.inventoryTracking.create({
          data: {
            shop,
            productId: BigInt(productId),
            productTitle: title,
            sku: skus.join(", ") || null,
            currentQuantity: totalQty,
            previousQuantity: totalQty,
            // Seed with "in_stock" regardless of the REST payload quantity — see
            // the PRODUCTS_CREATE comment above for why.
            inventoryStatus: "in_stock",
          },
        });
        console.log(`[Webhook] Re-added product ${productId} (${title}) for ${shop} after status change to ACTIVE`);
        return new Response(null, { status: 200 });
      }
    }

    // Always sync title and SKU regardless of status change.
    if (title || skus.length > 0) {
      await prisma.inventoryTracking.updateMany({
        where: { shop, productId: BigInt(productId) },
        data: {
          ...(title ? { productTitle: title } : {}),
          ...(skus.length > 0 ? { sku: skus.join(", ") } : {}),
        },
      });
    }
  }

  } catch (err) {
    console.error(`[Webhook] products handler error for ${shop}:`, err instanceof Error ? err.message : err);
    // Return 200 so Shopify doesn't retry — the error is logged for investigation.
  }

  return new Response(null, { status: 200 });
};
