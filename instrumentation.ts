/**
 * Next.js Instrumentation
 * Runs once when the server starts (production and development)
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server-side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startHeartbeat } = await import('./lib/heartbeat');
    startHeartbeat();
  }
}
