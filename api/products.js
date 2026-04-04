import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('[products] Fetching all products with latest BSR...');

  const { data: products, error } = await supabase
    .from('products')
    .select(`*, bsr_history (*)`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[products] Error fetching products:', error);
    return res.status(500).json({ error: error.message });
  }

  // Sort bsr_history descending and expose the most recent entry as latest_bsr
  const result = products.map((product) => {
    const history = (product.bsr_history || []).sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );

    return {
      ...product,
      latest_bsr: history[0] ?? null,
      bsr_history: history,
    };
  });

  console.log(`[products] Returning ${result.length} product(s)`);
  return res.status(200).json(result);
}
