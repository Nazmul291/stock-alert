declare global {
  interface Window {
    shopify: {
      ready: Promise<void>;
      idToken?: () => Promise<string>;
      config?: any;
      protocol?: any;
      origin?: string;
    };
    __SHOPIFY_APP__?: ShopifyAppInstance;
    __SHOPIFY_SESSION_TOKEN__?: string;
    __SHOPIFY_TOKEN_INTERVAL__?: NodeJS.Timeout;
  }
}

interface ShopifyAppInstance {
  ready: boolean;
  host?: string;
  apiKey?: string;
  idToken(): Promise<string>;
}

export {};