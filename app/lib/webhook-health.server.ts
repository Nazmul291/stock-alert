// In-memory throttle: check at most once per hour per shop per VM.
// Duplicate checks across VMs are harmless (idempotent mutations).
const cache = new Map<string, number>(); // shop -> lastCheckedAt ms
const CHECK_INTERVAL = 60 * 60 * 1000;

const REQUIRED = [
  { topic: "INVENTORY_LEVELS_UPDATE",  path: "/webhooks/inventory" },
  { topic: "APP_SUBSCRIPTIONS_UPDATE", path: "/webhooks/app/subscriptions_update" },
  { topic: "PRODUCTS_CREATE",          path: "/webhooks/products" },
  { topic: "PRODUCTS_UPDATE",          path: "/webhooks/products" },
  { topic: "PRODUCTS_DELETE",          path: "/webhooks/products" },
] as const;

const SUBSCRIPTIONS_QUERY = `
  query {
    webhookSubscriptions(first: 25) {
      edges {
        node {
          topic
        }
      }
    }
  }
`;

const CREATE_MUTATION = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id }
      userErrors { message }
    }
  }
`;

export async function ensureWebhooks(admin: any, shop: string, appUrl: string): Promise<void> {
  if (!appUrl) return;

  const last = cache.get(shop) ?? 0;
  if (Date.now() - last < CHECK_INTERVAL) return;
  cache.set(shop, Date.now()); // mark before the async work to prevent parallel checks

  try {
    const res = await admin.graphql(SUBSCRIPTIONS_QUERY);
    const json: any = await res.json();
    const existing = new Set<string>(
      (json.data?.webhookSubscriptions?.edges ?? []).map((e: any) => e.node.topic as string),
    );

    for (const { topic, path } of REQUIRED) {
      if (!existing.has(topic)) {
        console.log(`[WebhookHealth] Re-registering missing webhook: ${topic}`);
        const createRes = await admin.graphql(CREATE_MUTATION, {
          variables: {
            topic,
            webhookSubscription: { uri: `${appUrl}${path}`, format: "JSON" },
          },
        });
        const createJson: any = await createRes.json();
        const errs: string[] = createJson.data?.webhookSubscriptionCreate?.userErrors?.map((e: any) => e.message) ?? [];
        if (errs.length > 0) {
          console.error(`[WebhookHealth] Failed to register ${topic}:`, errs.join(", "));
        } else {
          console.log(`[WebhookHealth] Successfully registered ${topic}`);
        }
      }
    }
  } catch (err) {
    // Clear cache so the next request retries
    cache.delete(shop);
    console.error("[WebhookHealth] Check failed:", err instanceof Error ? err.message : err);
  }
}
