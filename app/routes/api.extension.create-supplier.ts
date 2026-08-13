import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { extensionCorsPreflight, extensionJSON } from "../lib/extension-cors.server";
import { getCachedSession } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { createSupplier, type SupplierInput } from "../lib/supplier.server";

// OPTIONS preflight lands here (see extension-cors.server.ts) — this route
// otherwise only supports POST.
export const loader = ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return extensionCorsPreflight();
  return new Response("Method Not Allowed", { status: 405 });
};

export const action = ({ request }: ActionFunctionArgs) =>
  extensionJSON(request, async ({ shop }) => {
    const storeSession = await getCachedSession(shop);
    const plan = storeSession?.plan ?? "basic";
    if (!canUseFeature(plan, "purchaseOrders")) {
      return { success: false as const, error: "Suppliers and purchase orders are an Enterprise plan feature." };
    }

    const body = (await request.json()) as Partial<SupplierInput>;
    return createSupplier(shop, {
      name: body.name ?? "",
      email: body.email ?? "",
      phone: body.phone ?? "",
      leadTimeDays: body.leadTimeDays ?? "",
      contactName: body.contactName ?? "",
      website: body.website ?? "",
      address1: body.address1 ?? "",
      address2: body.address2 ?? "",
      city: body.city ?? "",
      province: body.province ?? "",
      zip: body.zip ?? "",
      country: body.country ?? "",
      paymentTerms: body.paymentTerms ?? "",
      currency: body.currency ?? "",
    });
  });
