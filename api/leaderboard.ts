import type { VercelRequest, VercelResponse } from '@vercel/node';

// Vercel Serverless API - Leaderboard endpoint
// This provides a REST API fallback for leaderboard operations

interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL: string | null;
  highScore: number;
  totalKills: number;
  gamesPlayed: number;
  longestSnake: number;
  lastPlayed: number;
}

// In-memory fallback (in production, use Firebase Admin SDK)
const inMemoryLeaderboard: Map<string, LeaderboardEntry> = new Map();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Get leaderboard
      const entries = Array.from(inMemoryLeaderboard.values())
        .sort((a, b) => b.highScore - a.highScore)
        .slice(0, 50);

      return res.status(200).json({
        success: true,
        data: entries,
        count: entries.length,
      });
    }

    if (req.method === 'POST') {
      // Update score
      const { uid, displayName, photoURL, score, length, kills } = req.body;

      if (!uid || !displayName) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const existing = inMemoryLeaderboard.get(uid);

      if (existing) {
        inMemoryLeaderboard.set(uid, {
          ...existing,
          displayName,
          photoURL,
          highScore: Math.max(existing.highScore, score || 0),
          totalKills: (existing.totalKills || 0) + (kills || 0),
          gamesPlayed: (existing.gamesPlayed || 0) + 1,
          longestSnake: Math.max(existing.longestSnake || 0, length || 0),
          lastPlayed: Date.now(),
        });
      } else {
        inMemoryLeaderboard.set(uid, {
          uid,
          displayName,
          photoURL: photoURL || null,
          highScore: score || 0,
          totalKills: kills || 0,
          gamesPlayed: 1,
          longestSnake: length || 0,
          lastPlayed: Date.now(),
        });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Leaderboard API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
