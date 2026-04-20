const CLIENT_ID = process.env.SP_API_CLIENT_ID;
const CLIENT_SECRET = process.env.SP_API_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SP_API_REFRESH_TOKEN;
const MARKETPLACE_ID = process.env.SP_API_MARKETPLACE_ID || 'A2Q3Y263D00KWC';

const BASE_URL = 'https://sellingpartnerapi-na.amazon.com';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'x-amz-user-agent': 'python-requests/2.27.1',
};

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
  console.log('[spapi] Access token obtained:', data.access_token ? data.access_token.slice(0, 20) + '...' : 'EMPTY');
  return data.access_token;
}

export async function getBSR(asin) {
  console.log(`[spapi] ===== getBSR(${asin}) =====`);

  const accessToken = await getAccessToken();

  const url = new URL(`${BASE_URL}/products/pricing/v0/items/${asin}/offers`);
  url.searchParams.set('MarketplaceId', MARKETPLACE_ID);
  url.searchParams.set('ItemCondition', 'New');

  console.log(`[spapi] GET ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: { ...DEFAULT_HEADERS, 'x-amz-access-token': accessToken },
  });

  const bodyText = await response.text();
  console.log(`[spapi] Response status: ${response.status}`);
  console.log(`[spapi] Response body: ${bodyText}`);

  if (!response.ok) {
    throw new Error(`SP-API pricing error for ${asin}: ${response.status} ${bodyText}`);
  }

  const data = JSON.parse(bodyText);
  const summary = data.payload?.Summary ?? {};
  const rankings = summary.SalesRankings ?? [];
  const buyBoxPrices = summary.BuyBoxPrices ?? [];
  const price = buyBoxPrices[0]?.LandedPrice?.Amount ?? null;

  console.log(`[spapi] SalesRankings for ${asin}:`, JSON.stringify(rankings));
  console.log(`[spapi] Price for ${asin}:`, price);

  const result = {
    rankMain: rankings[0]?.Rank ?? 0,
    rankSub: rankings[1]?.Rank ?? 0,
    category: rankings[0]?.ProductCategoryId ?? '',
    subcategory: rankings[1]?.ProductCategoryId ?? '',
    price,
  };

  console.log(`[spapi] Parsed BSR for ${asin}:`, result);
  return result;
}
