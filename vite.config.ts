import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_'),
    key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key) {
    let role = '';
    try {
      role = JSON.parse(
        Buffer.from(key.split('.')[1] ?? '', 'base64url').toString(),
      ).role;
    } catch {}
    if (key.startsWith('sb_secret_') || role === 'service_role')
      throw Error(
        'VITE_SUPABASE_PUBLISHABLE_KEY must be a public publishable/anon key, never a server secret.',
      );
  }
  return { plugins: [react()] };
});
