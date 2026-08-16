// Shared by ManagePurchaseOrderModal.tsx (product-detail page) and
// PurchaseOrderDetail.tsx (Purchase Orders page) — both render a "Receive
// Items" control for the same PurchaseOrder record, and used to each carry
// their own copy of this payload-building/validation logic. Client-safe
// (imported by both browser components), not a .server.ts file.

export type ReceivableLineItem = {
  id: string;
  quantityOrdered: number;
  quantityReceived: number;
  locationId: string | null;
  locations: { id: string; name: string; available: number }[];
};

export type ReceiptDraft = {
  lineItemId: string;
  quantityReceived: number;
  locationId?: string;
};

// A variant stocked at more than one location needs the merchant to pick
// which one received the shipment when the line has no fixed locationId
// from creation time (see receivePurchaseOrderItems in purchase-order.server.ts
// for why this can't be guessed). True when at least one line with a pending
// receive quantity is missing that choice.
export function isReceiveLocationMissing(
  lineItems: ReceivableLineItem[],
  quantities: Record<string, string>,
  locationEdits: Record<string, string>,
): boolean {
  return lineItems.some((li) => {
    const qty = Math.max(0, parseInt(quantities[li.id] ?? "0") || 0);
    return qty > 0 && !li.locationId && li.locations.length > 1 && !locationEdits[li.id];
  });
}

// Builds the receipts payload the "receive_items" action expects — one entry
// per line item with a positive quantity entered. Deliberately never sends
// li.locationId itself (only whatever the merchant picked in the location
// select) — a line that already has a fixed locationId doesn't render that
// select at all, so there's nothing to send, and the server already knows
// the line's fixed location from its own DB record (receivePurchaseOrderItems).
export function buildReceiptDrafts(
  lineItems: ReceivableLineItem[],
  quantities: Record<string, string>,
  locationEdits: Record<string, string>,
): ReceiptDraft[] {
  return lineItems
    .map((li) => ({
      lineItemId: li.id,
      quantityReceived: Math.max(0, parseInt(quantities[li.id] ?? "0") || 0),
      locationId: locationEdits[li.id] || undefined,
    }))
    .filter((r) => r.quantityReceived > 0);
}
