import { supabaseAdmin } from './supabase';

const SIX_HOURS = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
let heartbeatTimer: NodeJS.Timeout | null = null;

/**
 * Performs a lightweight database query to keep connection alive
 */
async function performHeartbeat() {
  try {
    // Simple count query on stores table - minimal overhead
    const { count, error } = await supabaseAdmin
      .from('stores')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('[Heartbeat] Database query failed:', error.message);
    } else {
      console.info(`[Heartbeat] Database connection alive. Store count: ${count}`);
    }
  } catch (error) {
    console.error('[Heartbeat] Unexpected error:', error);
  }
}

/**
 * Schedules the next heartbeat using setTimeout
 */
function scheduleNextHeartbeat() {
  heartbeatTimer = setTimeout(async () => {
    await performHeartbeat();
    scheduleNextHeartbeat(); // Schedule the next one
  }, SIX_HOURS);
}

/**
 * Starts the heartbeat service
 */
export async function startHeartbeat() {
  try{
    await performHeartbeat(); // Run immediately on start
  }catch(error){
    console.error('[Heartbeat] Failed to start heartbeat service:', error);
  }finally{
    console.info('[Heartbeat] Service started');
    scheduleNextHeartbeat();
  }
}

/**
 * Stops the heartbeat service (for graceful shutdown)
 */
export function stopHeartbeat() {
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
    console.info('[Heartbeat] Service stopped');
  }
}
