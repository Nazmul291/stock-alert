import { unauthenticated } from "../shopify.server";

// Notifies Shopify Flow of an inventory event so merchants can build their own
// automations on top of it (extensions/flow-triggers/shopify.extension.toml
// declares the three handles below and their payload fields). Safe to call
// unconditionally — if a shop has no Flow workflow listening for `handle`,
// flowTriggerReceive just no-ops. Runs from background jobs/webhooks (no
// request-bound session), so it uses the shop's stored offline access token
// via unauthenticated.admin, the same pattern as billing.server.ts's
// getCachedHasActivePaymentOffline.
export async function fireFlowTrigger(
  shop: string,
  handle: "low-stock" | "out-of-stock" | "restock",
  payload: Record<string, string | number>,
): Promise<void> {
  try {
    const { admin } = await unauthenticated.admin(shop);
    const res = await admin.graphql(
      `#graphql
      mutation TriggerFlow($handle: String, $payload: JSON) {
        flowTriggerReceive(handle: $handle, payload: $payload) {
          userErrors { field message }
        }
      }`,
      { variables: { handle, payload } },
    );
    const json = await res.json() as {
      data?: { flowTriggerReceive?: { userErrors?: { field: string[] | null; message: string }[] } };
    };
    const errors = json.data?.flowTriggerReceive?.userErrors;
    if (errors?.length) console.error(`[FlowTrigger] ${handle} userErrors:`, errors);
  } catch (err) {
    // A Flow trigger failure must never break the actual notification send.
    console.error(`[FlowTrigger] ${handle} failed:`, err);
  }
}
