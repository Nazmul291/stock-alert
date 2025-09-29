import { supabaseAdmin } from '@/lib/supabase';
import { APP_CONFIG } from '@/lib/app-config';

export interface PlanEnforcementResult {
  success: boolean;
  deactivatedCount: number;
  activeCount: number;
  maxAllowed: number;
  message: string;
}

/**
 * Enforce plan limits by deactivating excess products
 * Keeps the most recently updated products active
 */
export async function enforcePlanLimits(storeId: string, plan: string): Promise<PlanEnforcementResult> {
  const maxProducts = APP_CONFIG.plans.getMaxProducts(plan);

  if (maxProducts === -1) {
    // Unlimited plan - activate all products
    const { data: reactivated, error } = await supabaseAdmin
      .from('inventory_tracking')
      .update({ inventory_status: 'in_stock', updated_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('inventory_status', 'deactivated')
      .select('id');

    return {
      success: true,
      deactivatedCount: 0,
      activeCount: -1, // unlimited
      maxAllowed: -1,
      message: `All products activated for ${plan} plan`
    };
  }

  // Get current active products count
  const { data: activeProducts, error: countError } = await supabaseAdmin
    .from('inventory_tracking')
    .select('id, product_title, updated_at')
    .eq('store_id', storeId)
    .neq('inventory_status', 'deactivated')
    .order('updated_at', { ascending: false });

  if (countError) {
    console.error('[Plan Enforcement] Error fetching products:', countError);
    return {
      success: false,
      deactivatedCount: 0,
      activeCount: 0,
      maxAllowed: maxProducts,
      message: `Error enforcing plan limits: ${countError.message}`
    };
  }

  const activeCount = activeProducts?.length || 0;

  if (activeCount <= maxProducts) {
    // Within limits, no action needed
    return {
      success: true,
      deactivatedCount: 0,
      activeCount,
      maxAllowed: maxProducts,
      message: `Plan limits OK: ${activeCount}/${maxProducts} products active`
    };
  }

  // Exceed limits - deactivate oldest products
  const productsToDeactivate = activeProducts.slice(maxProducts);
  const productIds = productsToDeactivate.map(p => p.id);

  const { error: deactivateError } = await supabaseAdmin
    .from('inventory_tracking')
    .update({
      inventory_status: 'deactivated',
      updated_at: new Date().toISOString()
    })
    .in('id', productIds);

  if (deactivateError) {
    console.error('[Plan Enforcement] Error deactivating products:', deactivateError);
    return {
      success: false,
      deactivatedCount: 0,
      activeCount,
      maxAllowed: maxProducts,
      message: `Error deactivating products: ${deactivateError.message}`
    };
  }

  return {
    success: true,
    deactivatedCount: productIds.length,
    activeCount: maxProducts,
    maxAllowed: maxProducts,
    message: `Plan limits enforced: deactivated ${productIds.length} products, keeping ${maxProducts} active`
  };
}

/**
 * Handle plan downgrade - enforce new limits immediately
 */
export async function handlePlanDowngrade(storeId: string, newPlan: string): Promise<PlanEnforcementResult> {

  // Update store plan first
  await supabaseAdmin
    .from('stores')
    .update({ plan: newPlan })
    .eq('id', storeId);

  // Enforce new plan limits
  return await enforcePlanLimits(storeId, newPlan);
}

/**
 * Handle plan upgrade - reactivate deactivated products if within new limits
 */
export async function handlePlanUpgrade(storeId: string, newPlan: string): Promise<PlanEnforcementResult> {

  // Update store plan first
  await supabaseAdmin
    .from('stores')
    .update({ plan: newPlan })
    .eq('id', storeId);

  const maxProducts = APP_CONFIG.plans.getMaxProducts(newPlan);

  if (maxProducts === -1) {
    // Unlimited - reactivate all deactivated products
    const { data: reactivated, error } = await supabaseAdmin
      .from('inventory_tracking')
      .update({
        inventory_status: 'in_stock', // Reset to in_stock, will be updated by next webhook
        updated_at: new Date().toISOString()
      })
      .eq('store_id', storeId)
      .eq('inventory_status', 'deactivated')
      .select('id, product_title');

    return {
      success: !error,
      deactivatedCount: 0,
      activeCount: -1,
      maxAllowed: -1,
      message: `All ${reactivated?.length || 0} deactivated products reactivated for ${newPlan} plan`
    };
  }

  // Limited plan - reactivate up to new limit
  return await enforcePlanLimits(storeId, newPlan);
}

/**
 * Check if a store can add more products
 */
export async function canAddProduct(storeId: string): Promise<{ canAdd: boolean; reason?: string }> {
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('plan')
    .eq('id', storeId)
    .single();

  if (!store) {
    return { canAdd: false, reason: 'Store not found' };
  }

  const maxProducts = APP_CONFIG.plans.getMaxProducts(store.plan);

  if (maxProducts === -1) {
    return { canAdd: true }; // Unlimited
  }

  const { count: activeCount } = await supabaseAdmin
    .from('inventory_tracking')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .neq('inventory_status', 'deactivated');

  const currentCount = activeCount || 0;

  if (currentCount >= maxProducts) {
    return {
      canAdd: false,
      reason: `Plan limit reached: ${currentCount}/${maxProducts} products. Upgrade to Pro for unlimited products.`
    };
  }

  return { canAdd: true };
}