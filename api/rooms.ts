import type { VercelRequest, VercelResponse } from '@vercel/node';

// Vercel Serverless API - Game rooms management

interface GameRoom {
  id: string;
  name: string;
  players: string[];
  maxPlayers: number;
  worldSize: number;
  createdAt: number;
}

const rooms: Map<string, GameRoom> = new Map();

// Create a default room
rooms.set('default', {
  id: 'default',
  name: 'Arena Principal',
  players: [],
  maxPlayers: 20,
  worldSize: 4000,
  createdAt: Date.now(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const roomList = Array.from(rooms.values()).map((room) => ({
        ...room,
        players: room.players.length,
      }));

      return res.status(200).json({
        success: true,
        data: roomList,
      });
    }

    if (req.method === 'POST') {
      const { action, roomId, playerId } = req.body;

      if (action === 'join' && roomId && playerId) {
        const room = rooms.get(roomId);
        if (!room) {
          return res.status(404).json({ success: false, error: 'Room not found' });
        }
        if (room.players.length >= room.maxPlayers) {
          return res.status(400).json({ success: false, error: 'Room is full' });
        }
        if (!room.players.includes(playerId)) {
          room.players.push(playerId);
        }
        return res.status(200).json({ success: true, room: { ...room, players: room.players.length } });
      }

      if (action === 'leave' && roomId && playerId) {
        const room = rooms.get(roomId);
        if (room) {
          room.players = room.players.filter((p) => p !== playerId);
        }
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Rooms API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
