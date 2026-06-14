export interface OutboundWebhookPayload {
  event: "low_stock" | "out_of_stock" | "restock";
  shop: string;
  productId: string;
  productTitle: string;
  sku: string | null;
  currentQuantity: number;
  threshold?: number;
  timestamp: string;
}

export async function fireOutboundWebhook(
  url: string,
  payload: OutboundWebhookPayload,
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Stock-Alert-Event": payload.event },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[OutboundWebhook] POST to ${url} returned ${res.status}`);
    } else {
      console.log(`[OutboundWebhook] Fired ${payload.event} → ${url} (${res.status})`);
    }
  } catch (err) {
    console.error(`[OutboundWebhook] Failed to POST to ${url}:`, err instanceof Error ? err.message : err);
  }
}
