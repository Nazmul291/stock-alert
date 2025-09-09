'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabase';

export async function updateStoreSettings(formData: FormData, shop: string) {
  console.log('updateStoreSettings called with shop:', shop);
  
  // Get store directly from database using shop parameter
  const { data: store, error: storeError } = await supabaseAdmin
    .from('stores')
    .select('id, access_token')
    .eq('shop_domain', shop)
    .single();

  console.log('Store lookup result:', { store, storeError });

  if (storeError) {
    console.error('Store lookup error:', storeError);
    throw new Error(`Failed to find store: ${storeError.message}`);
  }

  if (!store || !store.access_token) {
    throw new Error('Store not found or not authenticated');
  }

  const session = {
    shop,
    accessToken: store.access_token,
    storeId: store.id
  };
  
  const settings = {
    auto_hide_enabled: formData.get('auto_hide_enabled') === 'true',
    auto_republish_enabled: formData.get('auto_republish_enabled') === 'true',
    low_stock_threshold: parseInt(formData.get('low_stock_threshold') as string),
    email_notifications: formData.get('email_notifications') === 'true',
    slack_notifications: formData.get('slack_notifications') === 'true',
    slack_webhook_url: formData.get('slack_webhook_url') as string || null,
    notification_email: formData.get('notification_email') as string || null,
  };

  console.log('Upserting settings:', { store_id: session.storeId, ...settings });
  
  const { error } = await supabaseAdmin
    .from('store_settings')
    .upsert({
      store_id: session.storeId,
      ...settings,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'store_id'
    });

  if (error) {
    console.error('Settings upsert error:', error);
    throw new Error(`Failed to update settings: ${error.message}`);
  }
  
  console.log('Settings updated successfully');

  // Update setup progress
  const progressUpdates: any = {
    global_settings_configured: true,
  };

  // Check if notifications are configured
  if (settings.notification_email || settings.slack_webhook_url) {
    progressUpdates.notifications_configured = true;
  }

  await supabaseAdmin
    .from('setup_progress')
    .upsert({
      store_id: session.storeId,
      ...progressUpdates,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'store_id'
    });

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function updateProductSettings(
  productId: number,
  settings: {
    custom_threshold?: number | null;
    exclude_from_auto_hide: boolean;
    exclude_from_alerts: boolean;
  },
  shop: string
) {
  // Get store directly from database using shop parameter
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('id, access_token')
    .eq('shop_domain', shop)
    .single();

  if (!store || !store.access_token) {
    throw new Error('Store not found or not authenticated');
  }

  const session = {
    shop,
    accessToken: store.access_token,
    storeId: store.id
  };

  const { error } = await supabaseAdmin
    .from('product_settings')
    .upsert({
      store_id: session.storeId,
      product_id: productId,
      ...settings,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'store_id,product_id'
    });

  if (error) {
    throw new Error('Failed to update product settings');
  }

  // Update setup progress to mark product thresholds as configured
  await supabaseAdmin
    .from('setup_progress')
    .upsert({
      store_id: session.storeId,
      product_thresholds_configured: true,
      first_product_tracked: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'store_id'
    });

  revalidatePath('/products');
  return { success: true };
}