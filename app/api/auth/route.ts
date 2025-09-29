import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { shopify } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';
import { generateNonce, generatePKCE, validateShopDomain, createEncodedState } from '@/lib/oauth-validation';
import { APP_CONFIG } from '@/lib/app-config';

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

    // Use configuration to determine scopes
    // You can set SHOPIFY_SCOPES env var to override, or it will use all scopes
    const scopes = APP_CONFIG.scopes.getAllRequested();
    const apiKey = process.env.SHOPIFY_API_KEY;


    // Generate cryptographically secure nonce for CSRF protection
    const nonce = generateNonce();

    // Create encoded state that embeds the nonce and shop
    // This is more reliable than cookies for OAuth redirects
    const encodedState = createEncodedState({
      nonce,
      shop: sanitizedShop,
    });


    // Still try to set cookies as a backup (some browsers may support them)
    const cookieStore = await cookies();

    // For OAuth flow, we need 'none' sameSite for cross-site cookies to work
    // This is safe because we validate HMAC and state
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: true, // Always use secure in OAuth flow
      sameSite: 'none' as const, // Required for OAuth redirects
      maxAge: 600, // 10 minutes
      path: '/',
      domain: isProduction ? '.nazmulcodes.org' : undefined // Allow subdomain access
    };

    // Still set cookies as fallback
    cookieStore.set('shopify-oauth-state', nonce, cookieOptions);
    cookieStore.set('shopify-oauth-shop', sanitizedShop, cookieOptions);

    // Generate PKCE parameters for enhanced security
    const pkce = generatePKCE();

    // Store PKCE verifier in cookie and encoded state
    cookieStore.set('shopify-oauth-pkce', pkce.codeVerifier, cookieOptions);

    // For PKCE, we'll need to store it server-side since it's too large for state
    // For now, we'll proceed without PKCE if cookies fail

    // Build OAuth URL with all security parameters
    const authUrl = `https://${sanitizedShop}/admin/oauth/authorize?` +
      `client_id=${apiKey}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${encodedState}&` +
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