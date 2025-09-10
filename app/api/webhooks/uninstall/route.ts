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
  
  try {
    const body = await req.text();
    
    // Collect headers for processing
    const headers: any = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    // Verify webhook
    const isValid = await verifyWebhook(req, body);
    if (!isValid) {
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
    
    
    if (!shop) {
      return NextResponse.json({ error: 'Missing shop domain' }, { status: 400 });
    }

    // Delete store and all related data (cascading delete will handle related tables)
    const { error, count } = await supabaseAdmin
      .from('stores')
      .delete()
      .eq('shop_domain', shop);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete store data' }, { status: 500 });
    }

    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}