import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

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

        // This app doesn't store any customer data
        // We only store shop, product, and inventory information
        // No PII (Personally Identifiable Information) is collected

        // Log the request for compliance records
        await supabaseAdmin
          .from('gdpr_requests')
          .insert({
            shop_domain: shop,
            request_type: 'customers_data_request',
            customer_id: data.customer?.id,
            request_id: data.data_request?.id,
            status: 'completed',
            response: 'No customer data stored',
            processed_at: new Date().toISOString()
          })
          .catch(err => console.error('[WEBHOOK] Failed to log GDPR request:', err));

        return NextResponse.json({
          message: 'Customer data request processed',
          shop_domain: shop,
          customer_id: data.customer?.id,
          data_found: false,
          note: 'This app does not store any customer personal data'
        }, { status: 200 });

      case 'customers/redact':
        // Handle customer data deletion request (GDPR)

        // Since we don't store customer data, there's nothing to delete
        // However, we should check and clean any potential references

        try {
          // Get store ID
          const { data: store } = await supabaseAdmin
            .from('stores')
            .select('id')
            .eq('shop_domain', shop)
            .single();

          if (store) {
            // Check if there are any customer-specific settings or data
            // (Currently we don't have any, but this is where you'd delete them)

            // Log the redaction request for compliance
            await supabaseAdmin
              .from('gdpr_requests')
              .insert({
                shop_domain: shop,
                request_type: 'customers_redact',
                customer_id: data.customer?.id,
                request_id: data.data_request?.id,
                status: 'completed',
                response: 'No customer data to redact',
                processed_at: new Date().toISOString()
              });
          }

        } catch (error) {
          console.error('[WEBHOOK] Error processing customer redaction:', error);
        }

        return NextResponse.json({
          message: 'Customer data redaction completed',
          shop_domain: shop,
          customer_id: data.customer?.id,
          data_deleted: false,
          note: 'No customer data stored to delete'
        }, { status: 200 });

      case 'shop/redact':
        // Handle shop data deletion (when app is uninstalled)

        try {
          // Delete all shop data from database
          // This is called 48 hours after app uninstall

          // Get store record
          const { data: store } = await supabaseAdmin
            .from('stores')
            .select('id')
            .eq('shop_domain', shop)
            .single();

          if (store) {

            // Delete in order due to foreign key constraints
            // 1. Delete inventory tracking records
            await supabaseAdmin
              .from('inventory_tracking')
              .delete()
              .eq('store_id', store.id);

            // 2. Delete product settings
            await supabaseAdmin
              .from('product_settings')
              .delete()
              .eq('store_id', store.id);

            // 3. Delete store settings
            await supabaseAdmin
              .from('store_settings')
              .delete()
              .eq('store_id', store.id);

            // 4. Delete setup progress
            await supabaseAdmin
              .from('setup_progress')
              .delete()
              .eq('store_id', store.id);

            // 5. Delete notification logs
            await supabaseAdmin
              .from('notification_logs')
              .delete()
              .eq('store_id', store.id);

            // 6. Delete billing records
            await supabaseAdmin
              .from('billing_records')
              .delete()
              .eq('store_id', store.id);

            // 7. Finally delete the store record itself
            await supabaseAdmin
              .from('stores')
              .delete()
              .eq('id', store.id);


            // Log the redaction for compliance
            await supabaseAdmin
              .from('gdpr_requests')
              .insert({
                shop_domain: shop,
                request_type: 'shop_redact',
                status: 'completed',
                response: 'All shop data deleted',
                processed_at: new Date().toISOString()
              });
          } else {
          }
        } catch (error) {
          console.error('[WEBHOOK] Error during shop data deletion:', error);
          // Don't throw - we should always return 200 to Shopify
        }

        return NextResponse.json({
          message: 'Shop data redaction completed',
          shop_domain: shop,
          status: 'completed'
        }, { status: 200 });

      default:
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