// Sends a custom event to Klaviyo's Events API so merchants can build marketing
// flows/campaigns off inventory events. Two distinct uses in this app:
//  - a merchant-facing channel (alongside Slack/WhatsApp) — events fired against
//    the merchant's own profile for low-stock/out-of-stock/restock alerts.
//  - a customer-facing sync — a "Back in Stock" event fired per back-in-stock
//    subscriber when a product they're watching restocks.
// Never throws — a Klaviyo failure must not break the actual notification send,
// same contract as fireFlowTrigger (app/lib/flow-trigger.server.ts). Returns a
// result instead of void so the "Send Test" flow can report success/failure;
// fire-and-forget call sites are free to ignore the return value.
export async function sendKlaviyoEvent(
  apiKey: string,
  metricName: string,
  profile: { email?: string; first_name?: string },
  properties: Record<string, string | number>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://a.klaviyo.com/api/events", {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        "Content-Type": "application/json",
        revision: "2025-07-15",
      },
      body: JSON.stringify({
        data: {
          type: "event",
          attributes: { metric: { name: metricName }, profile, properties },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = `${res.status} ${body}`.trim();
      console.error(`[Klaviyo] ${metricName} failed: ${error}`);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[Klaviyo] ${metricName} failed:`, err);
    return { ok: false, error };
  }
}
