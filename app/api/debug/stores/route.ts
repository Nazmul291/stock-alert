import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    // Test database connection
    const { data: stores, error } = await supabaseAdmin
      .from('stores')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ 
        error: 'Database error', 
        details: error.message,
        code: error.code 
      }, { status: 500 });
    }

    // Mask sensitive data
    const sanitizedStores = stores?.map(store => ({
      id: store.id,
      shop_domain: store.shop_domain,
      has_access_token: !!store.access_token,
      scope: store.scope,
      plan: store.plan,
      created_at: store.created_at,
      updated_at: store.updated_at,
    }));

    return NextResponse.json({ 
      success: true,
      count: stores?.length || 0,
      stores: sanitizedStores || [],
      database_connected: true
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Unexpected error', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}