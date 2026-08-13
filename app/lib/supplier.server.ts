import prisma from "../db.server";
import { invalidateShopCache } from "./shop-cache.server";
import { EMAIL_RE } from "./validation";

export type SupplierInput = {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  leadTimeDays?: string;
  contactName?: string;
  website?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  paymentTerms?: string;
  currency?: string;
};

export type SupplierMutationResult =
  | { success: true; id: string; name: string }
  | { success: false; error: string };

type ParsedSupplierData = {
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  leadTimeDays: number | null;
  contactName: string | null;
  website: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
  paymentTerms: string | null;
  currency: string | null;
};

// Trims a possibly-undefined string field down to null-if-empty — shared by
// every optional Supplier field below so an empty form input clears the
// field in the DB rather than persisting an empty string.
function trimmedOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function parseSupplierInput(input: SupplierInput): { data: ParsedSupplierData } | { error: string } {
  const name = input.name.trim();
  const email = (input.email ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const rawLeadTime = input.leadTimeDays ?? "";

  if (!name) return { error: "Supplier name is required." };
  // Purchase orders are sent to this address (sendPurchaseOrderEmail) — a
  // supplier with no email can never actually receive a PO, so this is
  // required rather than merely validated-if-present.
  if (!email) return { error: "Supplier email is required." };
  if (!EMAIL_RE.test(email)) return { error: `"${email}" is not a valid email address.` };
  if (!phone) return { error: "Supplier phone number is required." };

  const leadTimeDays =
    rawLeadTime.trim() !== "" && !isNaN(parseInt(rawLeadTime)) && parseInt(rawLeadTime) > 0 ? parseInt(rawLeadTime) : null;

  return {
    data: {
      name,
      email: email || null,
      phone,
      notes: trimmedOrNull(input.notes),
      leadTimeDays,
      contactName: trimmedOrNull(input.contactName),
      website: trimmedOrNull(input.website),
      address1: trimmedOrNull(input.address1),
      address2: trimmedOrNull(input.address2),
      city: trimmedOrNull(input.city),
      province: trimmedOrNull(input.province),
      zip: trimmedOrNull(input.zip),
      country: trimmedOrNull(input.country),
      paymentTerms: trimmedOrNull(input.paymentTerms),
      // Normalized to uppercase (e.g. "usd" -> "USD") so email-templates.ts
      // can key a symbol lookup off it without also normalizing there.
      currency: input.currency?.trim() ? input.currency.trim().toUpperCase() : null,
    },
  };
}

export async function createSupplier(shop: string, input: SupplierInput): Promise<SupplierMutationResult> {
  const parsed = parseSupplierInput(input);
  if ("error" in parsed) return { success: false, error: parsed.error };

  const supplier = await prisma.supplier.create({ data: { shop, ...parsed.data } });
  invalidateShopCache(shop);
  return { success: true, id: supplier.id, name: supplier.name };
}

export async function updateSupplier(shop: string, id: string, input: SupplierInput): Promise<SupplierMutationResult> {
  if (!id) return { success: false, error: "Missing supplier id." };
  const parsed = parseSupplierInput(input);
  if ("error" in parsed) return { success: false, error: parsed.error };

  const result = await prisma.supplier.updateMany({ where: { id, shop }, data: parsed.data });
  if (result.count === 0) return { success: false, error: "Supplier not found." };

  invalidateShopCache(shop);
  return { success: true, id, name: parsed.data.name };
}

export async function deleteSupplier(shop: string, id: string): Promise<{ success: true } | { success: false; error: string }> {
  if (!id) return { success: false, error: "Missing supplier id." };

  const poCount = await prisma.purchaseOrder.count({ where: { shop, supplierId: id } });
  if (poCount > 0) {
    return { success: false, error: `Cannot delete — this supplier has ${poCount} purchase order(s). Cancel or reassign them first.` };
  }

  const result = await prisma.supplier.deleteMany({ where: { id, shop } });
  if (result.count === 0) return { success: false, error: "Supplier not found." };

  invalidateShopCache(shop);
  return { success: true };
}
