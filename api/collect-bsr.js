import { createClient } from '@supabase/supabase-js';
import { getBSR } from './lib/spapi.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  console.log('[collect-bsr] ====== Starting BSR collection ======');

  // Fetch all products
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('*');

  if (productsError) {
    console.error('[collect-bsr] Error fetching products:', productsError);
    return res.status(500).json({ error: productsError.message });
  }

  console.log(`[collect-bsr] Found ${products.length} product(s) to process`);

  const results = [];
  const errors = [];

  for (const product of products) {
    try {
      console.log(`[collect-bsr] --- Processing ${product.asin} (${product.name}) ---`);

      // 1. Fetch BSR from Amazon SP-API
      const bsr = await getBSR(product.asin);
      console.log(`[collect-bsr] BSR fetched:`, bsr);

      // 2. Fetch the last BSR reading for this product
      const { data: lastReading, error: lastError } = await supabase
        .from('bsr_history')
        .select('*')
        .eq('asin', product.asin)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastError) {
        console.error(`[collect-bsr] Error fetching last reading for ${product.asin}:`, lastError);
      } else {
        console.log(`[collect-bsr] Last reading:`, lastReading);
      }

      // 3. Save new BSR reading
      const { error: insertError } = await supabase
        .from('bsr_history')
        .insert({
          asin: product.asin,
          main_rank: bsr.rankMain,
          sub_rank: bsr.rankSub,
          recorded_at: new Date().toISOString(),
        });

      if (insertError) {
        throw new Error(`Failed to insert bsr_history: ${insertError.message}`);
      }

      console.log(`[collect-bsr] bsr_history saved for ${product.asin}`);

      // 4. Calculate variation and save alert (only when there is a previous reading)
      if (lastReading) {
        const rankBefore = lastReading.main_rank;
        const rankAfter = bsr.rankMain;
        const variationPct = parseFloat(
          (((rankAfter - rankBefore) / rankBefore) * 100).toFixed(2)
        );

        // Higher rank number = worse position
        const direction = rankAfter > rankBefore ? 'down' : 'up';

        const insight =
          rankAfter > rankBefore
            ? 'Ranking caiu — considere reduzir o preço para recuperar posição'
            : rankAfter < rankBefore
            ? 'Ranking melhorou — avalie aumentar o preço ou reduzir desconto'
            : 'Ranking estável — continue monitorando';

        console.log(
          `[collect-bsr] Variation for ${product.asin}: ${variationPct}% | direction: ${direction}`
        );

        const { error: alertError } = await supabase.from('alerts').insert({
          asin: product.asin,
          product_name: product.name,
          rank_before: rankBefore,
          rank_after: rankAfter,
          variation_pct: variationPct,
          direction,
          insight,
        });

        if (alertError) {
          console.error(`[collect-bsr] Error saving alert for ${product.asin}:`, alertError);
        } else {
          console.log(`[collect-bsr] Alert saved for ${product.asin}`);
        }
      } else {
        console.log(`[collect-bsr] No previous reading for ${product.asin} — skipping alert`);
      }

      results.push({ asin: product.asin, success: true, bsr });
    } catch (err) {
      console.error(`[collect-bsr] Failed to process ${product.asin}:`, err.message);
      errors.push({ asin: product.asin, error: err.message });
    }
  }

  const summary = {
    total: products.length,
    success: results.length,
    failed: errors.length,
    results,
    errors,
  };

  console.log('[collect-bsr] ====== Collection complete ======', summary);
  return res.status(200).json(summary);
}
