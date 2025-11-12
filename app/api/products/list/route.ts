import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireSessionToken } from '@/lib/session-token';

export async function GET(req: NextRequest) {
  try {
    // Require valid session token
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: authResult.error || 'Unauthorized'
      }, { status: 401 });
    }

    const shopDomain = authResult.shopDomain!;

    // Get pagination parameters
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
    const pageSize = parseInt(req.nextUrl.searchParams.get('pageSize') || '50');
    const searchTerm = req.nextUrl.searchParams.get('search') || '';

    // Get store from database
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('shop_domain', shopDomain)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Build query
    let query = supabaseAdmin
      .from('inventory_tracking')
      .select('*', { count: 'exact' })
      .eq('store_id', store.id)
      .order('product_title', { ascending: true });

    // Add search filter if provided
    if (searchTerm) {
      query = query.or(`product_title.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`);
    }

    // Add pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    // Execute query
    const { data: productsData, error, count } = await query;

    if (error) {
      throw error;
    }

    // Transform data for client
    const products = productsData?.map((item: any) => ({
      product_id: item.product_id,
      product_title: item.product_title,
      variants: [item], // Keep single item as array for compatibility
      total_quantity: item.current_quantity,
      inventory_status: item.inventory_status,
      sku: item.sku,
      is_hidden: item.is_hidden,
      last_checked_at: item.last_checked_at,
      settings: null,
    })) || [];

    // Get product settings for these products
    if (products.length > 0) {
      const productIds = products.map(p => p.product_id);
      const { data: settings } = await supabaseAdmin
        .from('product_settings')
        .select('*')
        .eq('store_id', store.id)
        .in('product_id', productIds);

      // Map settings to products
      if (settings) {
        const settingsMap = new Map(settings.map(s => [s.product_id, s]));
        products.forEach(p => {
          p.settings = settingsMap.get(p.product_id) || null;
        });
      }
    }

    // Calculate pagination metadata
    const totalPages = Math.ceil((count || 0) / pageSize);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return NextResponse.json({
      products,
      pagination: {
        page,
        pageSize,
        totalItems: count || 0,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}