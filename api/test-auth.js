import { getAccessToken } from './lib/spapi.js';

export default async function handler(req, res) {
  console.log('[test-auth] Starting auth test...');

  try {
    const token = await getAccessToken();

    return res.status(200).json({
      success: true,
      token_preview: token.slice(0, 20) + '...',
      token_length: token.length,
      env: {
        SP_API_CLIENT_ID: process.env.SP_API_CLIENT_ID ? process.env.SP_API_CLIENT_ID.slice(0, 20) + '...' : 'MISSING',
        SP_API_CLIENT_SECRET: process.env.SP_API_CLIENT_SECRET ? '***SET***' : 'MISSING',
        SP_API_REFRESH_TOKEN: process.env.SP_API_REFRESH_TOKEN ? process.env.SP_API_REFRESH_TOKEN.slice(0, 20) + '...' : 'MISSING',
        SP_API_MARKETPLACE_ID: process.env.SP_API_MARKETPLACE_ID || 'NOT SET (using default A2Q3Y263D00KWC)',
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.slice(0, 10) + '...' : 'MISSING',
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? '***SET***' : 'MISSING',
        AWS_REGION: process.env.AWS_REGION || 'NOT SET (using default us-east-1)',
      },
    });
  } catch (err) {
    console.error('[test-auth] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
      env: {
        SP_API_CLIENT_ID: process.env.SP_API_CLIENT_ID ? process.env.SP_API_CLIENT_ID.slice(0, 20) + '...' : 'MISSING',
        SP_API_CLIENT_SECRET: process.env.SP_API_CLIENT_SECRET ? '***SET***' : 'MISSING',
        SP_API_REFRESH_TOKEN: process.env.SP_API_REFRESH_TOKEN ? process.env.SP_API_REFRESH_TOKEN.slice(0, 20) + '...' : 'MISSING',
        SP_API_MARKETPLACE_ID: process.env.SP_API_MARKETPLACE_ID || 'NOT SET (using default A2Q3Y263D00KWC)',
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.slice(0, 10) + '...' : 'MISSING',
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? '***SET***' : 'MISSING',
        AWS_REGION: process.env.AWS_REGION || 'NOT SET (using default us-east-1)',
      },
    });
  }
}
