import { create } from "zustand";
import type { CreatedPurchaseOrder } from "../lib/purchase-order.server";
import { assertClientOnly } from "./assert-client-only";

// The one place that talks to api.purchase-orders.create.ts — every page
// that creates a supplier or a purchase order (Purchase Orders page,
// Products list, product detail) calls these two actions instead of each
// building its own useFetcher() payload. Unlike every other store in this
// directory, this one caches nothing (no createSSECacheSlice) — it's a pure
// command store, and it's the first to call fetch() directly rather than
// wrapping useFetcher(). Auth still works: Shopify App Bridge patches the
// global fetch to attach the session token, the same mechanism
// use-sse-data.ts already relies on for reads.
const ENDPOINT = "/api/purchase-orders/create";

export type CreateSupplierFields = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  zip: string;
  country: string;
  paymentTerms: string;
  currency: string;
  leadTimeDays: string;
};

export type CreatePurchaseOrderFields = {
  supplierId: string;
  locationId: string;
  locationName: string;
  lines: { variantId: string; quantityOrdered: number; unitCost: number | null; sku: string | null }[];
  referenceNumber: string;
  supplierNote: string;
  terms: string;
  tags: string[];
  // Product-detail page only — makes the chosen supplier that product's
  // supplier of record server-side. Omitted by the generic multi-product
  // flows (Purchase Orders page, Products list).
  productId?: string;
};

export type CreatedSupplier = { id: string; name: string };

type SupplierResult = { success: true; supplier: CreatedSupplier } | { success: false; error: string };
type PurchaseOrderResult =
  | { success: true; purchaseOrder: CreatedPurchaseOrder; supplierOfRecordWarning: string | null }
  | { success: false; error: string };

// Normalizes both failure modes — a non-2xx response (no JSON body, e.g.
// authenticate.admin()'s 401 session-token-retry signal that App Bridge's
// fetch patch couldn't transparently recover, same guard as
// use-sse-data.ts:67) and a real fetch()-level rejection (network loss) —
// into the same shape every caller already has to handle from a 200 with
// `success: false`.
async function post<T>(fields: Record<string, string>): Promise<T | { success: false; error: string }> {
  try {
    const res = await fetch(ENDPOINT, { method: "POST", body: new URLSearchParams(fields) });
    if (!res.ok) return { success: false, error: `Request failed (${res.status})` };
    return (await res.json()) as T;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Connection lost. Please retry." };
  }
}

export type PurchaseOrderActionsStore = {
  creatingSupplier: boolean;
  supplierError: string | null;
  creatingPurchaseOrder: boolean;
  purchaseOrderError: string | null;
  createSupplier: (fields: CreateSupplierFields) => Promise<SupplierResult>;
  createPurchaseOrder: (fields: CreatePurchaseOrderFields) => Promise<PurchaseOrderResult>;
  // Called when a create-PO modal mounts — this store is a module singleton
  // shared by every page, so a previous modal session's error would
  // otherwise still be showing the instant the next one opens.
  reset: () => void;
};

export const usePurchaseOrderActionsStore = create<PurchaseOrderActionsStore>()((set) => ({
  creatingSupplier: false,
  supplierError: null,
  creatingPurchaseOrder: false,
  purchaseOrderError: null,

  createSupplier: async (fields) => {
    assertClientOnly("usePurchaseOrderActionsStore", "createSupplier");
    set({ creatingSupplier: true, supplierError: null });
    const json = await post<{ success: boolean; error?: string; id?: string; name?: string }>({
      intent: "create_supplier",
      ...fields,
    });
    set({ creatingSupplier: false });
    if (!json.success || !json.id || !json.name) {
      const error = json.error ?? "Failed to create supplier.";
      set({ supplierError: error });
      return { success: false, error };
    }
    return { success: true, supplier: { id: json.id, name: json.name } };
  },

  createPurchaseOrder: async (fields) => {
    assertClientOnly("usePurchaseOrderActionsStore", "createPurchaseOrder");
    set({ creatingPurchaseOrder: true, purchaseOrderError: null });
    const json = await post<
      | { success: true; purchaseOrder: CreatedPurchaseOrder; supplierOfRecordWarning: string | null }
      | { success: false; error: string }
    >({
      intent: "create_po",
      supplierId: fields.supplierId,
      locationId: fields.locationId,
      locationName: fields.locationName,
      lines: JSON.stringify(fields.lines),
      referenceNumber: fields.referenceNumber,
      supplierNote: fields.supplierNote,
      terms: fields.terms,
      tags: JSON.stringify(fields.tags),
      ...(fields.productId ? { productId: fields.productId } : {}),
    });
    set({ creatingPurchaseOrder: false });
    if (!json.success) {
      const error = json.error ?? "Failed to create purchase order.";
      set({ purchaseOrderError: error });
      return { success: false, error };
    }
    return json;
  },

  reset: () => {
    assertClientOnly("usePurchaseOrderActionsStore", "reset");
    set({ creatingSupplier: false, supplierError: null, creatingPurchaseOrder: false, purchaseOrderError: null });
  },
}));
