import { createClient } from '@supabase/supabase-js';

// Use placeholder values during build if env vars are missing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export type Store = {
  id: string;
  shop_domain: string;
  access_token: string;
  scope?: string;
  plan: 'free' | 'pro';
  email?: string;
  created_at: string;
  updated_at: string;
};

export type StoreSettings = {
  id: string;
  store_id: string;
  auto_hide_enabled: boolean;
  auto_republish_enabled: boolean;
  low_stock_threshold: number;
  email_notifications: boolean;
  slack_notifications: boolean;
  slack_webhook_url?: string;
  notification_email?: string;
  created_at: string;
  updated_at: string;
};

export type ProductSettings = {
  id: string;
  store_id: string;
  product_id: number;
  product_title?: string;
  custom_threshold?: number;
  exclude_from_auto_hide: boolean;
  exclude_from_alerts: boolean;
  created_at: string;
  updated_at: string;
};

export type InventoryTracking = {
  id: string;
  store_id: string;
  product_id: number;
  variant_id: number;
  product_title?: string;
  variant_title?: string;
  sku?: string;
  current_quantity: number;
  previous_quantity?: number;
  last_checked_at: string;
  last_alert_sent_at?: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
};

export type AlertHistory = {
  id: string;
  store_id: string;
  product_id: number;
  variant_id?: number;
  alert_type: 'low_stock' | 'out_of_stock' | 'restocked';
  alert_channel: 'email' | 'slack';
  quantity_at_alert?: number;
  threshold_at_alert?: number;
  message?: string;
  sent_at: string;
  created_at: string;
};

export type SetupProgress = {
  id: string;
  store_id: string;
  app_installed: boolean;
  global_settings_configured: boolean;
  notifications_configured: boolean;
  product_thresholds_configured: boolean;
  first_product_tracked: boolean;
  created_at: string;
  updated_at: string;
};