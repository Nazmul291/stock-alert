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
