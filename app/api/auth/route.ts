import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { shopify } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';
import { generateNonce, generatePKCE, validateShopDomain } from '@/lib/oauth-validation';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const shop = searchParams.get('shop');
  const embedded = searchParams.get('embedded');

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
  }

  // Validate shop domain format
  if (!validateShopDomain(shop)) {
    return NextResponse.json({ error: 'Invalid shop domain format' }, { status: 400 });
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

    // Generate cryptographically secure nonce for CSRF protection
    const nonce = generateNonce();

    // Store nonce in signed cookie for validation in callback
    const cookieStore = cookies();
    cookieStore.set('shopify-oauth-state', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/'
    });

    // Store shop domain for additional validation
    cookieStore.set('shopify-oauth-shop', sanitizedShop, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/'
    });

    // Generate PKCE parameters for enhanced security
    const pkce = generatePKCE();

    // Store PKCE verifier in cookie (challenge goes in URL)
    cookieStore.set('shopify-oauth-pkce', pkce.codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/'
    });

    // Build OAuth URL with all security parameters
    const authUrl = `https://${sanitizedShop}/admin/oauth/authorize?` +
      `client_id=${apiKey}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${nonce}&` +
      `code_challenge=${pkce.codeChallenge}&` +
      `code_challenge_method=${pkce.codeChallengeMethod}`;
    
    
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
    return NextResponse.json({ error: 'Failed to start OAuth flow' }, { status: 500 });
  }
}