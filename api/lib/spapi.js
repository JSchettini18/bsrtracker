const CLIENT_ID = process.env.SP_API_CLIENT_ID;
const CLIENT_SECRET = process.env.SP_API_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SP_API_REFRESH_TOKEN;
const MARKETPLACE_ID = process.env.SP_API_MARKETPLACE_ID || 'A2Q3Y263D00KWC';

export async function getAccessToken() {
  console.log('[spapi] Requesting access token...');

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: REFRESH_TOKEN,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const response = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${text}`);
  }

  const data = await response.json();
  console.log('[spapi] Access token obtained successfully');
  return data.access_token;
}

export async function getBSR(asin) {
  console.log(`[spapi] Fetching BSR for ASIN: ${asin}`);

  const accessToken = await getAccessToken();

  const url = new URL(
    `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items/${asin}`
  );
  url.searchParams.set('marketplaceIds', MARKETPLACE_ID);
  url.searchParams.set('includedData', 'salesRanks');

  console.log(`[spapi] GET ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SP-API error for ${asin}: ${response.status} ${text}`);
  }

  const data = await response.json();
  console.log(`[spapi] Raw salesRanks for ${asin}:`, JSON.stringify(data.salesRanks));

  const salesRanks = data.salesRanks?.[0];

  if (!salesRanks) {
    throw new Error(`No salesRanks data returned for ASIN ${asin}`);
  }

  const displayGroupRanks = salesRanks.displayGroupRanks || [];
  const classificationRanks = salesRanks.classificationRanks || [];

  const main = displayGroupRanks[0];
  const sub = classificationRanks[0];

  const result = {
    rankMain: main?.rank ?? 0,
    rankSub: sub?.rank ?? 0,
    category: main?.title ?? '',
    subcategory: sub?.title ?? '',
  };

  console.log(`[spapi] Parsed BSR for ${asin}:`, result);
  return result;
}
