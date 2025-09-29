import crypto from 'crypto';

/**
 * Validates HMAC signature from Shopify OAuth callbacks
 * This is CRITICAL for security to prevent callback forgery
 */
export function validateOAuthHMAC(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get('hmac');
  if (!hmac) {
    console.error('[OAuth] No HMAC provided in callback');
    return false;
  }

  // Create a copy of params and remove hmac and signature
  const map: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key !== 'hmac' && key !== 'signature') {
      map[key] = value;
    }
  });

  // Sort keys and create message
  const message = Object.keys(map)
    .sort()
    .map(key => `${key}=${map[key]}`)
    .join('&');

  // Calculate expected HMAC
  const hash = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  const isValid = hash === hmac;

  if (!isValid) {
    console.error('[OAuth] HMAC validation failed');
    console.error('[OAuth] Expected:', hash);
    console.error('[OAuth] Received:', hmac);
  }

  return isValid;
}

/**
 * Validates shop domain against Shopify's requirements
 * Must be {shop-name}.myshopify.com format
 */
export function validateShopDomain(shop: string | null): boolean {
  if (!shop) return false;

  // Shopify shop domains must match this pattern
  const VALID_SHOP_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

  if (!VALID_SHOP_REGEX.test(shop)) {
    console.error('[OAuth] Invalid shop domain format:', shop);
    return false;
  }

  // Additional check: no consecutive hyphens
  if (shop.includes('--')) {
    console.error('[OAuth] Shop domain contains consecutive hyphens:', shop);
    return false;
  }

  // Additional check: doesn't start or end with hyphen (before .myshopify.com)
  const shopName = shop.replace('.myshopify.com', '');
  if (shopName.startsWith('-') || shopName.endsWith('-')) {
    console.error('[OAuth] Shop name starts or ends with hyphen:', shop);
    return false;
  }

  return true;
}

/**
 * Generates a cryptographically secure random nonce for OAuth state
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Creates an encoded state parameter with embedded data
 * This is an alternative to cookies for maintaining state
 */
export function createEncodedState(data: {
  nonce: string;
  shop: string;
  timestamp?: number;
}): string {
  const stateData = {
    ...data,
    timestamp: data.timestamp || Date.now(),
  };

  // Create a signed state to prevent tampering
  const jsonStr = JSON.stringify(stateData);
  const signature = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET || '')
    .update(jsonStr)
    .digest('hex')
    .substring(0, 16); // Use first 16 chars of signature

  // Combine data and signature
  const combined = `${jsonStr}::${signature}`;

  // Base64 encode for URL safety
  return Buffer.from(combined).toString('base64url');
}

/**
 * Decodes and validates an encoded state parameter
 */
export function decodeAndValidateState(encodedState: string): {
  valid: boolean;
  data?: { nonce: string; shop: string; timestamp: number };
  error?: string;
} {
  try {
    // Decode from base64
    const decoded = Buffer.from(encodedState, 'base64url').toString();
    const [jsonStr, signature] = decoded.split('::');

    if (!jsonStr || !signature) {
      return { valid: false, error: 'Invalid state format' };
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET || '')
      .update(jsonStr)
      .digest('hex')
      .substring(0, 16);

    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid state signature' };
    }

    // Parse data
    const data = JSON.parse(jsonStr);

    // Check timestamp (10 minute expiry)
    const age = Date.now() - data.timestamp;
    if (age > 600000) {
      return { valid: false, error: 'State expired' };
    }

    return { valid: true, data };
  } catch (error) {
    return { valid: false, error: 'Failed to decode state' };
  }
}

/**
 * Generates PKCE code verifier and challenge for enhanced OAuth security
 * This is optional but recommended for additional security
 */
export function generatePKCE() {
  // Generate code verifier (43-128 characters)
  const verifier = base64URLEncode(crypto.randomBytes(32));

  // Generate code challenge from verifier
  const challenge = base64URLEncode(
    crypto.createHash('sha256').update(verifier).digest()
  );

  return {
    codeVerifier: verifier,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256'
  };
}

/**
 * Base64 URL encoding for PKCE
 */
function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Validates the complete OAuth callback request
 * This should be called at the beginning of the callback handler
 */
export function validateOAuthCallback(
  params: URLSearchParams,
  secret: string,
  expectedState: string | undefined
): { valid: boolean; error?: string } {
  // 1. Validate HMAC
  if (!validateOAuthHMAC(params, secret)) {
    return { valid: false, error: 'Invalid HMAC signature' };
  }

  // 2. Validate state parameter
  const state = params.get('state');
  if (!state || state !== expectedState) {
    return { valid: false, error: 'Invalid state parameter' };
  }

  // 3. Validate shop domain
  const shop = params.get('shop');
  if (!validateShopDomain(shop)) {
    return { valid: false, error: 'Invalid shop domain' };
  }

  // 4. Ensure required parameters exist
  const code = params.get('code');
  if (!code) {
    return { valid: false, error: 'Missing authorization code' };
  }

  return { valid: true };
}