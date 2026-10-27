import { createClient } from '@supabase/supabase-js';
const config = import.meta.env as Record<string, string | undefined>;
const url = config.VITE_SUPABASE_URL,
  key = config.VITE_SUPABASE_PUBLISHABLE_KEY;
// Publishable/anon keys are public browser configuration. Never put service_role here.
function makeClient() {
  if (!url || !key || key.startsWith('sb_secret_')) return null;
  try {
    if (key.split('.').length === 3) {
      const claims = JSON.parse(
        atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
      );
      if (claims.role === 'service_role') return null;
    }
    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'lbd-supabase-auth',
      },
    });
  } catch {
    return null;
  }
}
export const supabase = makeClient();
