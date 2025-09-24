'use client';

interface TokenRefreshState {
  isRefreshing: boolean;
  refreshPromise: Promise<string | null> | null;
  lastRefreshTime: number;
  consecutiveFailures: number;
}

class TokenManager {
  private static instance: TokenManager;
  private state: TokenRefreshState = {
    isRefreshing: false,
    refreshPromise: null,
    lastRefreshTime: 0,
    consecutiveFailures: 0
  };

  private readonly REFRESH_COOLDOWN = 5000; // 5 seconds between refresh attempts
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly TOKEN_CACHE_KEY = 'cached_session_token';
  private readonly TOKEN_EXPIRY_KEY = 'cached_token_expiry';

  private constructor() {}

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  async getToken(appBridge: any, forceRefresh: boolean = false): Promise<string | null> {
    // Check if we're already refreshing
    if (this.state.isRefreshing && this.state.refreshPromise) {
      console.log('[TokenManager] Already refreshing, waiting for existing refresh...');
      return this.state.refreshPromise;
    }

    // Check cooldown period
    const now = Date.now();
    if (!forceRefresh && now - this.state.lastRefreshTime < this.REFRESH_COOLDOWN) {
      console.log('[TokenManager] In cooldown period, using cached token');
      return this.getCachedToken();
    }

    // Check if we've had too many failures
    if (this.state.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      console.error('[TokenManager] Max consecutive failures reached, need manual intervention');
      return null;
    }

    // Check cached token first (unless forcing refresh)
    if (!forceRefresh) {
      const cachedToken = this.getCachedToken();
      if (cachedToken && this.isTokenValid(cachedToken)) {
        return cachedToken;
      }
    }

    // Start refresh process
    this.state.isRefreshing = true;
    this.state.lastRefreshTime = now;

    this.state.refreshPromise = this.refreshToken(appBridge)
      .then(token => {
        if (token) {
          this.state.consecutiveFailures = 0;
          this.cacheToken(token);
        } else {
          this.state.consecutiveFailures++;
        }
        return token;
      })
      .finally(() => {
        this.state.isRefreshing = false;
        this.state.refreshPromise = null;
      });

    return this.state.refreshPromise;
  }

  private async refreshToken(appBridge: any): Promise<string | null> {
    try {
      // Try URL token first (fastest)
      const urlToken = this.getTokenFromURL();
      if (urlToken && this.isTokenValid(urlToken)) {
        return urlToken;
      }

      // Try various App Bridge methods
      const methods = [
        // Method 1: Modern App Bridge v4+ API
        async () => {
          if (window.ShopifyBridge?.getSessionToken) {
            return await window.ShopifyBridge.getSessionToken();
          }
          return null;
        },
        // Method 2: Legacy window.shopify.idToken
        async () => {
          if (window.shopify?.idToken) {
            return await window.shopify.idToken();
          }
          return null;
        },
        // Method 3: AppBridge object methods
        async () => {
          if (appBridge?.idToken) {
            return await appBridge.idToken();
          }
          if (appBridge?.getSessionToken) {
            return await appBridge.getSessionToken();
          }
          return null;
        }
      ];

      for (const method of methods) {
        try {
          const token = await method();
          if (token && this.isTokenValid(token)) {
            console.log('[TokenManager] Successfully obtained token');
            return token;
          }
        } catch (error) {
          // Try next method
        }
      }

      console.error('[TokenManager] All token refresh methods failed');
      return null;
    } catch (error) {
      console.error('[TokenManager] Error refreshing token:', error);
      return null;
    }
  }

  private getTokenFromURL(): string | null {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('id_token');
  }

  private getCachedToken(): string | null {
    if (typeof window === 'undefined') return null;

    const token = sessionStorage.getItem(this.TOKEN_CACHE_KEY);
    const expiry = sessionStorage.getItem(this.TOKEN_EXPIRY_KEY);

    if (token && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() < expiryTime) {
        return token;
      }
    }

    return null;
  }

  private cacheToken(token: string): void {
    if (typeof window === 'undefined') return;

    try {
      const payload = this.decodeToken(token);
      if (payload?.exp) {
        // Cache until 1 minute before expiry
        const expiryTime = (payload.exp * 1000) - 60000;
        sessionStorage.setItem(this.TOKEN_CACHE_KEY, token);
        sessionStorage.setItem(this.TOKEN_EXPIRY_KEY, expiryTime.toString());
      }
    } catch (error) {
      console.error('[TokenManager] Error caching token:', error);
    }
  }

  private isTokenValid(token: string): boolean {
    try {
      const payload = this.decodeToken(token);
      if (!payload) return false;

      const now = Math.floor(Date.now() / 1000);

      // Check if expired
      if (payload.exp && payload.exp < now) {
        return false;
      }

      // Check if not yet valid
      if (payload.nbf && payload.nbf > now) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch {
      return null;
    }
  }

  clearCache(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(this.TOKEN_CACHE_KEY);
    sessionStorage.removeItem(this.TOKEN_EXPIRY_KEY);
    this.state.consecutiveFailures = 0;
  }

  resetState(): void {
    this.state = {
      isRefreshing: false,
      refreshPromise: null,
      lastRefreshTime: 0,
      consecutiveFailures: 0
    };
    this.clearCache();
  }
}

export default TokenManager;

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
      createApp?: (config: any) => any;
      [key: string]: any;
    };
    ShopifyBridge?: {
      getSessionToken?: () => Promise<string>;
      createApp?: (config: any) => any;
      [key: string]: any;
    };
  }
}