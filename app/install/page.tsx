import { redirect } from 'next/navigation';

export default async function InstallPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const params = await searchParams;
  
  // If shop parameter exists, start OAuth
  if (params.shop) {
    redirect(`/api/auth?shop=${params.shop}`);
  }
  
  // If no shop parameter, show installation instructions
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Install Stock Alert</h1>
          <p className="text-lg text-gray-600 mb-8">
            To install Stock Alert, please provide your Shopify store URL
          </p>
          
          <form action="/install" method="GET" className="space-y-4">
            <div>
              <input
                type="text"
                name="shop"
                placeholder="your-store.myshopify.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                pattern="[a-zA-Z0-9-]+\.myshopify\.com"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition"
            >
              Install App
            </button>
          </form>
          
          <p className="mt-4 text-sm text-gray-500">
            Enter your .myshopify.com domain
          </p>
        </div>
      </div>
    </div>
  );
}