// ============================================================
// Bentropy Arena - WebSocket Game Server
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { GameRoom } from './GameRoom.js';

const PORT = parseInt(process.env.PORT || '8080');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',');

// HTTP server for health checks
const server = createServer((req, res) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      players: room.humanCount,
      totalEntities: room.totalAliveCount,
      uptime: Math.floor(process.uptime()),
    }));
    return;
  }

  if (req.url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(room.getStats()));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// WebSocket server
const wss = new WebSocketServer({ server });
const room = new GameRoom();

wss.on('connection', (ws: WebSocket, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  console.log(`[WS] New connection from ${ip}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      room.handleMessage(ws, msg);
    } catch (e) {
      console.error('[WS] Invalid message:', e);
    }
  });

  ws.on('close', () => {
    room.handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    room.handleDisconnect(ws);
  });
});

// Start game loop
room.start();

// Start server
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     🐍 Bentropy Arena - Game Server      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Port: ${PORT}                              ║`);
  console.log(`║  WebSocket: ws://localhost:${PORT}           ║`);
  console.log(`║  Health: http://localhost:${PORT}/health      ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  room.stop();
  wss.close();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  room.stop();
  wss.close();
  server.close();
  process.exit(0);
});
