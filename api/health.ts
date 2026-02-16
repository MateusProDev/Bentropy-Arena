import type { VercelRequest, VercelResponse } from '@vercel/node';

// Health check endpoint
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(200).json({
    status: 'ok',
    name: 'Bentropy Arena API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/health - Health check',
      'GET /api/leaderboard - Get leaderboard',
      'POST /api/leaderboard - Update score',
      'GET /api/rooms - List game rooms',
      'POST /api/rooms - Join/leave rooms',
    ],
  });
}
