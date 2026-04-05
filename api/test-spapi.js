import { getAccessToken } from './lib/spapi.js';

export default async function handler(req, res) {
  console.log('[test-spapi] Starting SP-API connectivity test...');

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error('[test-spapi] Failed to get access token:', err.message);
    return res.status(500).json({ success: false, step: 'getAccessToken', error: err.message });
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
