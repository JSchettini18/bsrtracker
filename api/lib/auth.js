import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Endpoints in api/ are public URLs. Callers (Supabase pg_cron, manual curl) must send
// `Authorization: Bearer <secret>`, where the secret lives in Supabase Vault as `cron_secret`
// and is checked by the `check_cron_secret` RPC (callable only with the service key).
// Returns true when the request may proceed; otherwise it has already sent a 401.
export async function requireCronSecret(req, res) {
  const header = req.headers?.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (token) {
    const { data, error } = await supabase.rpc('check_cron_secret', { secret: token });
    if (error) console.error('[auth] check_cron_secret failed:', error.message);
    if (!error && data === true) return true;
  }

  res.status(401).json({ error: 'Unauthorized' });
  return false;
}
