import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

async function verifyWebhook(req: NextRequest, body: string): Promise<boolean> {
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  if (!hmacHeader) return false;

  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET!)
    .update(body, 'utf8')
    .digest('base64');

  return hash === hmacHeader;
}

export async function POST(req: NextRequest) {
  console.log('=== APP UNINSTALL WEBHOOK RECEIVED ===');
  
  try {
    const body = await req.text();
    console.log('Uninstall webhook body:', body);
    
    // Log headers for debugging
    const headers: any = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log('Uninstall webhook headers:', headers);
    
    // Verify webhook
    const isValid = await verifyWebhook(req, body);
    if (!isValid) {
      console.error('Webhook verification failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = JSON.parse(body);
    
    // Shopify sends the shop domain in different fields depending on the webhook
    // APP/UNINSTALLED typically uses 'domain' or 'myshopify_domain'
    const shop = data.domain || 
                 data.myshopify_domain || 
                 data.shop_domain ||
                 headers['x-shopify-shop-domain'] ||
                 headers['x-shopify-domain'];
    
    console.log('Parsed webhook data:', {
      domain: data.domain,
      myshopify_domain: data.myshopify_domain,
      shop_domain: data.shop_domain,
      header_shop: headers['x-shopify-shop-domain'],
      header_domain: headers['x-shopify-domain'],
      final_shop: shop
    });
    
    if (!shop) {
      return NextResponse.json({ error: 'Missing shop domain' }, { status: 400 });
    }

    // Delete store and all related data (cascading delete will handle related tables)
    console.log(`Deleting store data for ${shop}...`);
    
    const { error, count } = await supabaseAdmin
      .from('stores')
      .delete()
      .eq('shop_domain', shop);

    if (error) {
      console.error('Error deleting store:', error);
      return NextResponse.json({ error: 'Failed to delete store data' }, { status: 500 });
    }

    console.log(`Store deleted successfully. Rows affected: ${count}`);
    console.log('=== APP UNINSTALL COMPLETED ===');
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Uninstall webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}