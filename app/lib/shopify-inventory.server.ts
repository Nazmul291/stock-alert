import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export const INVENTORY_SET_MUTATION = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      userErrors { field message }
    }
  }
`;

export type InventoryQuantityInput = {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  changeFromQuantity: number | null;
};

// Pushes absolute available-quantity values to Shopify in one batched,
// idempotent call. Returns the raw userErrors (empty on success) rather than
// throwing — callers differ on how they want to handle failure (app.products.tsx
// collects multiple errors and continues with other operations; PO receiving
// throws immediately since it's a single all-or-nothing operation).
export async function setInventoryQuantities(
  admin: AdminApiContext,
  quantities: InventoryQuantityInput[],
  reason: string,
): Promise<{ userErrors: string[] }> {
  const res = await admin.graphql(INVENTORY_SET_MUTATION, {
    variables: {
      idempotencyKey: crypto.randomUUID(),
      input: { name: "available", reason, quantities },
    },
  });
  const json: { data?: { inventorySetQuantities?: { userErrors: Array<{ message: string }> } } } = await res.json();
  const userErrors = (json.data?.inventorySetQuantities?.userErrors ?? []).map((e) => e.message);
  return { userErrors };
}

export const INVENTORY_ACTIVATE_MUTATION = `
  mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
    inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
      inventoryLevel { id }
      userErrors { field message }
    }
  }
`;

// inventorySetQuantities rejects a location the inventory item has never
// been stocked at — it has to be activated there first. Used when receiving
// a purchase order into a location a variant wasn't previously tracked at
// (see receivePurchaseOrderItems, which now lets a PO target any shop
// location, not just ones a variant already has inventory levels for).
export async function activateInventoryAtLocation(
  admin: AdminApiContext,
  inventoryItemId: string,
  locationId: string,
): Promise<{ userErrors: string[] }> {
  const res = await admin.graphql(INVENTORY_ACTIVATE_MUTATION, { variables: { inventoryItemId, locationId } });
  const json: { data?: { inventoryActivate?: { userErrors: Array<{ message: string }> } } } = await res.json();
  const userErrors = (json.data?.inventoryActivate?.userErrors ?? []).map((e) => e.message);
  return { userErrors };
}

const VARIANT_INVENTORY_ITEM_IDS_QUERY = `
  query getVariantInventoryItemIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryItem { id }
      }
    }
  }
`;

// Lean lookup used only to resolve variantId -> inventoryItemId for pushing
// a unit cost to Shopify — deliberately doesn't reuse getVariantLocationLevels
// (purchase-order.server.ts), which also fetches inventoryLevels and would
// leave this unresolved for a variant with zero activated locations.
export async function getVariantInventoryItemIds(
  admin: AdminApiContext,
  variantIds: bigint[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (variantIds.length === 0) return map;

  const ids = variantIds.map((id) => `gid://shopify/ProductVariant/${id.toString()}`);
  const res = await admin.graphql(VARIANT_INVENTORY_ITEM_IDS_QUERY, { variables: { ids } });
  const json: { data?: { nodes: Array<{ id?: string; inventoryItem?: { id: string } | null } | null> } } = await res.json();
  for (const node of json.data?.nodes ?? []) {
    if (!node?.id || !node.inventoryItem) continue;
    const variantId = node.id.split("/").pop() as string;
    map.set(variantId, node.inventoryItem.id);
  }
  return map;
}

export const INVENTORY_ITEM_UPDATE_MUTATION = `
  mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem { id unitCost { amount } }
      userErrors { field message }
    }
  }
`;

// Pushes the merchant-entered unit cost to Shopify's own "Cost per item"
// field on the variant's inventory item — previously only stored on our
// PurchaseOrderLineItem, so Shopify's own product cost never reflected what
// was actually paid.
export async function updateInventoryItemCost(
  admin: AdminApiContext,
  inventoryItemId: string,
  cost: number,
): Promise<{ userErrors: string[] }> {
  const res = await admin.graphql(INVENTORY_ITEM_UPDATE_MUTATION, {
    variables: { id: inventoryItemId, input: { cost } },
  });
  const json: { data?: { inventoryItemUpdate?: { userErrors: Array<{ message: string }> } } } = await res.json();
  const userErrors = (json.data?.inventoryItemUpdate?.userErrors ?? []).map((e) => e.message);
  return { userErrors };
}

export const PRODUCT_VARIANTS_BULK_UPDATE_MUTATION = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }
`;

// Sets a variant's selling price — only ever called for a variant whose
// price is currently $0 (see syncLineCostsToShopify, which backfills it
// with 2x the unit cost just entered on a PO). A $0 price means the
// merchant never set one; leaving it would mean selling the item for free
// once it's back in stock.
export async function updateVariantPrice(
  admin: AdminApiContext,
  productId: string,
  variantId: string,
  price: number,
): Promise<{ userErrors: string[] }> {
  const res = await admin.graphql(PRODUCT_VARIANTS_BULK_UPDATE_MUTATION, {
    variables: {
      productId: `gid://shopify/Product/${productId}`,
      variants: [{ id: `gid://shopify/ProductVariant/${variantId}`, price: price.toFixed(2) }],
    },
  });
  const json: { data?: { productVariantsBulkUpdate?: { userErrors: Array<{ message: string }> } } } = await res.json();
  const userErrors = (json.data?.productVariantsBulkUpdate?.userErrors ?? []).map((e) => e.message);
  return { userErrors };
}
