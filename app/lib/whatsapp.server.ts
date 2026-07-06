// Stock Alert sends from a single WhatsApp Business number it owns (set up
// once via Meta's self-service "Integrate with API" path — not per merchant).
// Merchants just supply their own personal phone as a recipient and verify
// ownership with a one-time code; there's no per-merchant Meta account to
// connect, so this is the only function this module needs.
export async function sendWhatsAppTemplate(to: string, templateName: string, bodyParams: string[]): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error("WhatsApp isn't configured (missing WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN).");
  }

  const phone = to.replace(/\D/g, "");
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en_US" },
        components: [{
          type: "body",
          parameters: bodyParams.map((text) => ({ type: "text", text })),
        }],
      },
    }),
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `WhatsApp API error ${res.status}`);
  }
}
