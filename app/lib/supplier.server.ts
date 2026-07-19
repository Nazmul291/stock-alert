import prisma from "../db.server";
import { invalidateShopCache } from "./shop-cache.server";
import { EMAIL_RE } from "./validation";

export type SupplierInput = {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  leadTimeDays?: string;
};

export type SupplierMutationResult =
  | { success: true; id: string; name: string }
  | { success: false; error: string };

function parseSupplierInput(input: SupplierInput): { data: { name: string; email: string | null; phone: string | null; notes: string | null; leadTimeDays: number | null } } | { error: string } {
  const name = input.name.trim();
  const email = (input.email ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const notes = (input.notes ?? "").trim();
  const rawLeadTime = input.leadTimeDays ?? "";

  if (!name) return { error: "Supplier name is required." };
  if (email && !EMAIL_RE.test(email)) return { error: `"${email}" is not a valid email address.` };

  const leadTimeDays =
    rawLeadTime.trim() !== "" && !isNaN(parseInt(rawLeadTime)) && parseInt(rawLeadTime) > 0 ? parseInt(rawLeadTime) : null;

  return { data: { name, email: email || null, phone: phone || null, notes: notes || null, leadTimeDays } };
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
