import { createClient } from '@supabase/supabase-js';
import { getBSR } from './lib/spapi.js';

// Competitor collection runs in its own function so it never competes with the
// own-products collection for Vercel's execution time budget.
export const config = { maxDuration: 300 };

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const DELAY_BETWEEN_COMPETITORS_MS = 2000;
const RETRY_DELAYS = [10000, 15000]; // 10s after 1st 429, 15s after 2nd

// Logs any competitor failure with full detail (message + HTTP status + response body).
// Never swallow errors here: this is the single place where competitor problems get surfaced.
function logCompetitorFailure(asin, err, context) {
  const message = err?.message ?? String(err);
  const status = err?.status ?? 'n/a';
  const body = err?.body ?? 'n/a';
  console.error(
    `[collect-competitors] COMPETITOR FAILED ${asin}: ${message} | context=${context} | status=${status} | body=${typeof body === 'string' ? body : JSON.stringify(body)}`
  );
  if (err?.stack) console.error(`[collect-competitors] COMPETITOR FAILED ${asin} stack:`, err.stack);
  return { competitor_asin: asin, context, error: message, status, body };
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const startedAt = Date.now();
  console.log('[collect-competitors] ====== Starting competitors collection ======');

  let competitors = null;
  let competitorsError = null;

  try {
    const result = await supabase
      .from('competitors')
      .select('*')
      .eq('active', true);
    competitors = result.data;
    competitorsError = result.error;
    console.log(`[collect-competitors] Competitors query returned: data=${JSON.stringify(competitors?.length ?? 'null')}, error=${JSON.stringify(competitorsError)}`);
  } catch (fetchErr) {
    console.error('[collect-competitors] Exception fetching competitors:', fetchErr.message);
    competitorsError = fetchErr;
  }

  if (competitorsError) {
    console.error('[collect-competitors] Error fetching competitors:', competitorsError);
    return res.status(500).json({ error: competitorsError.message ?? String(competitorsError) });
  }

  const competitorResults = [];
  const competitorErrors = [];

  if (!competitors || competitors.length === 0) {
    console.log('[collect-competitors] No active competitors found — nothing to do');
  } else {
    console.log(`[collect-competitors] Found ${competitors.length} competitor(s) to process`);

    for (let i = 0; i < competitors.length; i++) {
      const comp = competitors[i];
      const compAsin = comp?.competitor_asin ?? '(unknown asin)';
      console.log(`[collect-competitors] --- [${i + 1}/${competitors.length}] Processing competitor ${compAsin} for parent ${comp?.parent_asin} (${comp?.name}) ---`);

      // Whole iteration is wrapped so that NO error (getBSR, insert, or anything unexpected)
      // can escape silently or abort the remaining competitors.
      try {
        let bsr = null;
        let attempt = 0;
        const maxAttempts = 3;
        let lastErr = null;

        while (attempt < maxAttempts) {
          attempt++;
          try {
            console.log(`[collect-competitors] getBSR attempt ${attempt}/${maxAttempts} for competitor ${compAsin}`);
            bsr = await getBSR(compAsin);
            console.log(`[collect-competitors] Competitor BSR fetched:`, bsr);
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            const is429 = err?.status === 429 || err?.message?.includes('429');
            if (is429 && attempt < maxAttempts) {
              const waitMs = RETRY_DELAYS[attempt - 1];
              console.log(`[collect-competitors] 429 on attempt ${attempt} for competitor ${compAsin} — waiting ${waitMs / 1000}s`);
              await delay(waitMs);
            } else {
              break;
            }
          }
        }

        if (!bsr) {
          const errInfo = logCompetitorFailure(
            compAsin,
            lastErr ?? new Error('getBSR returned empty result'),
            `getBSR after ${attempt} attempt(s)`
          );
          competitorErrors.push({ ...errInfo, attempts: attempt });
        } else {
          const { error: insertError } = await supabase
            .from('competitor_history')
            .insert({
              competitor_id: comp.id,
              main_rank: bsr.rankMain,
              sub_rank: bsr.rankSub,
              price: bsr.price,
              recorded_at: new Date().toISOString(),
            });

          if (insertError) {
            const err = new Error(`Failed to insert competitor_history: ${insertError.message}`);
            err.status = insertError.code ?? 'supabase';
            err.body = insertError;
            throw err;
          }

          console.log(`[collect-competitors] competitor_history saved for ${compAsin}`);
          competitorResults.push({ competitor_asin: compAsin, success: true, bsr });
        }
      } catch (err) {
        competitorErrors.push(logCompetitorFailure(compAsin, err, 'insert/unexpected'));
      }

      if (i < competitors.length - 1) {
        console.log(`[collect-competitors] Waiting ${DELAY_BETWEEN_COMPETITORS_MS / 1000}s before next competitor...`);
        await delay(DELAY_BETWEEN_COMPETITORS_MS);
      }
    }
  }

  const summary = {
    total: competitors?.length ?? 0,
    success: competitorResults.length,
    failed: competitorErrors.length,
    durationMs: Date.now() - startedAt,
    results: competitorResults,
    errors: competitorErrors,
  };

  console.log(`[collect-competitors] Done: ${summary.success} success, ${summary.failed} failed de ${summary.total} total (${Math.round(summary.durationMs / 1000)}s)`);
  return res.status(200).json(summary);
}
