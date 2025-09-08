import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import HomeContent from './home-content';
import { supabaseAdmin } from '@/lib/supabase';

// Server Component - handles redirects on the server
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ 
    shop?: string; 
    embedded?: string;
    host?: string;
    id_token?: string;
    session?: string;
    timestamp?: string;
    locale?: string;
    hmac?: string;
  }>;
}) {
  // Await searchParams as required in Next.js 15
  const params = await searchParams;
  
  // Check if we're in embedded context
  const isEmbedded = params.embedded === '1' || params.host;
  
  // If embedded, check if we have a valid session
  if (isEmbedded && params.shop) {
    // Check if store exists in database (has completed OAuth)
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id, access_token')
      .eq('shop_domain', params.shop)
      .single();
    
    // If no store or no access token, need to complete OAuth
    if (!store || !store.access_token) {
      console.log('Store not found or no access token, redirecting to OAuth');
      redirect(`/api/auth?shop=${params.shop}&embedded=1`);
    }
    
    // Fetch setup progress
    let setupProgress = null;
    try {
      const { data: progress } = await supabaseAdmin
        .from('setup_progress')
        .select('*')
        .eq('store_id', store.id)
        .single();
      
      if (!progress) {
        // Create initial setup progress
        const { data: newProgress } = await supabaseAdmin
          .from('setup_progress')
          .insert({
            store_id: store.id,
            app_installed: true,
            global_settings_configured: false,
            notifications_configured: false,
            product_thresholds_configured: false,
            first_product_tracked: false
          })
          .select()
          .single();
        setupProgress = newProgress;
      } else {
        setupProgress = progress;
      }
    } catch (error) {
      console.error('Error fetching setup progress:', error);
    }
    
    // All good, show the home page
    return <HomeContent searchParams={params} setupProgress={setupProgress} />;
  }
  
  // Default landing page for non-embedded context
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Stock Alert</h1>
          <p className="text-lg text-gray-600 mb-8">
            Automated inventory management for Shopify stores
          </p>
          
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-2">Get Started</h2>
              <p className="text-gray-600 mb-4">
                Install Stock Alert to start managing your inventory automatically
              </p>
              <a
                href="/install"
                className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition"
              >
                Install Now
              </a>
              <p className="text-sm text-gray-500 mt-4">
                Or install from the Shopify App Store
              </p>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-900">Features</h3>
              <ul className="mt-2 text-sm text-blue-800 space-y-1">
                <li>✓ Auto-hide sold out products</li>
                <li>✓ Low stock alerts via email & Slack</li>
                <li>✓ Custom thresholds per product</li>
                <li>✓ Real-time inventory tracking</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}