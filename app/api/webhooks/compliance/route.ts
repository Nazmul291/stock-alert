import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Verify webhook signature
function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET || '';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody, 'utf8');
  const hash = hmac.digest('base64');
  return hash === signature;
}

export async function POST(req: NextRequest) {
  try {
    // Get the raw body for HMAC verification
    const rawBody = await req.text();
    const signature = req.headers.get('X-Shopify-Hmac-Sha256');
    const topic = req.headers.get('X-Shopify-Topic');
    const shop = req.headers.get('X-Shopify-Shop-Domain');

    console.log('[WEBHOOK] Compliance webhook received:', topic);

    // Verify webhook signature
    if (!signature || !verifyWebhookSignature(rawBody, signature)) {
      console.error('[WEBHOOK] Invalid webhook signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the body
    const data = JSON.parse(rawBody);

    // Handle different compliance topics
    switch (topic) {
      case 'customers/data_request':
        // Handle customer data request (GDPR)
        console.log('[WEBHOOK] Customer data request for shop:', shop);
        // In production, you would:
        // 1. Gather all customer data
        // 2. Send it to the provided email
        // For now, just acknowledge
        return NextResponse.json({
          message: 'Customer data request received',
          shop_domain: shop,
          customer_id: data.customer?.id
        }, { status: 200 });

      case 'customers/redact':
        // Handle customer data deletion request (GDPR)
        console.log('[WEBHOOK] Customer redaction request for shop:', shop);
        // In production, you would:
        // 1. Delete/anonymize customer data
        // 2. Keep only what's legally required
        return NextResponse.json({
          message: 'Customer data redaction received',
          shop_domain: shop,
          customer_id: data.customer?.id
        }, { status: 200 });

      case 'shop/redact':
        // Handle shop data deletion (when app is uninstalled)
        console.log('[WEBHOOK] Shop redaction request for shop:', shop);
        // In production, you would:
        // 1. Delete all shop data after 48 hours
        // 2. Keep only what's legally required
        return NextResponse.json({
          message: 'Shop data redaction received',
          shop_domain: shop
        }, { status: 200 });

      default:
        console.log('[WEBHOOK] Unknown compliance webhook topic:', topic);
        return NextResponse.json({
          message: 'Webhook received',
          topic: topic
        }, { status: 200 });
    }
  } catch (error: any) {
    console.error('[WEBHOOK] Compliance webhook error:', error);
    return NextResponse.json({
      error: 'Webhook processing failed'
    }, { status: 500 });
  }
}