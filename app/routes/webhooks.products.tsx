import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  const data = payload as any;

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

    const title: string | undefined = data?.title;
    const skus: string[] = (data?.variants ?? [])
      .map((v: any) => v.sku)
      .filter(Boolean);

    await prisma.inventoryTracking.updateMany({
      where: { shop, productId: BigInt(productId) },
      data: {
        ...(title ? { productTitle: title } : {}),
        ...(skus.length > 0 ? { sku: skus.join(", ") } : {}),
      },
    });
  }

  return new Response(null, { status: 200 });
};
