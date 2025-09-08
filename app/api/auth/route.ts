import { NextRequest, NextResponse } from 'next/server';
import { shopify } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const shop = searchParams.get('shop');
  const embedded = searchParams.get('embedded');
  
  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
  }

  const sanitizedShop = shopify.utils.sanitizeShop(shop);
  if (!sanitizedShop) {
    return NextResponse.json({ error: 'Invalid shop parameter' }, { status: 400 });
  }

  try {
    // Build the auth URL
    const redirectUri = `${process.env.SHOPIFY_APP_URL}/api/auth/callback`;
    const scopes = process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_inventory,write_inventory';
    const apiKey = process.env.SHOPIFY_API_KEY;
    
    console.log('OAuth Scopes from env:', process.env.SHOPIFY_SCOPES);
    console.log('Using scopes:', scopes);
    
    // Generate a random nonce for security
    const nonce = Math.random().toString(36).substring(2, 15);
    
    // Build OAuth URL - properly encode the scopes
    const authUrl = `https://${sanitizedShop}/admin/oauth/authorize?` +
      `client_id=${apiKey}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${nonce}`;
    
    console.log('OAuth URL:', authUrl);
    
    // For embedded apps, we need to redirect in the parent frame (Shopify admin)
    // Return an HTML page that breaks out of the iframe
    if (embedded === '1') {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Redirecting...</title>
          </head>
          <body>
            <p>Redirecting to Shopify authorization...</p>
            <script>
              // Break out of iframe and redirect in parent window
              if (window.top === window.self) {
                // Not in iframe, redirect normally
                window.location.href = '${authUrl}';
              } else {
                // In iframe, redirect parent
                window.top.location.href = '${authUrl}';
              }
            </script>
          </body>
        </html>
      `;
      
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }
    
    // For non-embedded, do a normal redirect
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('OAuth begin error:', error);
    return NextResponse.json({ error: 'Failed to start OAuth flow' }, { status: 500 });
  }
}