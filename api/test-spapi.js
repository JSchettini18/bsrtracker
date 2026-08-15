import { getAccessToken, getBSR } from './lib/spapi.js';

// Usage:
//   GET /api/test-spapi              -> connectivity test (marketplaceParticipations)
//   GET /api/test-spapi?asin=B0XXXX  -> raw getBSR() result for that ASIN, with full
//                                       SP-API status + body on error
export default async function handler(req, res) {
  const asin = typeof req.query?.asin === 'string' ? req.query.asin.trim().toUpperCase() : '';

  if (asin) {
    console.log(`[test-spapi] getBSR test for ASIN ${asin}`);
    const startedAt = Date.now();
    try {
      const bsr = await getBSR(asin);
      return res.status(200).json({
        success: true,
        asin,
        durationMs: Date.now() - startedAt,
        bsr,
      });
    } catch (err) {
      console.error(`[test-spapi] getBSR FAILED for ${asin}:`, err?.message, '| status:', err?.status, '| body:', err?.body);
      let body = err?.body ?? null;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { /* keep as text */ }
      }
      return res.status(200).json({
        success: false,
        asin,
        durationMs: Date.now() - startedAt,
        step: err?.step ?? 'unknown',
        error: err?.message ?? String(err),
        status: err?.status ?? null,
        body,
        stack: err?.stack ?? null,
      });
    }
  }

  console.log('[test-spapi] Starting SP-API connectivity test...');

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error('[test-spapi] Failed to get access token:', err.message);
    return res.status(500).json({
      success: false,
      step: 'getAccessToken',
      error: err.message,
      status: err?.status ?? null,
      body: err?.body ?? null,
    });
  }

  const url = 'https://sellingpartnerapi-na.amazon.com/sellers/v1/marketplaceParticipations';
  console.log(`[test-spapi] GET ${url}`);
  console.log('[test-spapi] x-amz-access-token:', accessToken.slice(0, 20) + '...');

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    console.error('[test-spapi] Fetch failed:', err.message);
    return res.status(500).json({ success: false, step: 'fetch', error: err.message });
  }

  const bodyText = await response.text();
  console.log(`[test-spapi] Response status: ${response.status}`);
  console.log(`[test-spapi] Response body: ${bodyText}`);

  let bodyJson;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
    bodyJson = bodyText;
  }

  return res.status(200).json({
    success: response.ok,
    status: response.status,
    body: bodyJson,
  });
}
