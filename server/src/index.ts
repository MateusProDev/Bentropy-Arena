// ============================================================
// Bentropy Arena - WebSocket Game Server
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage } from 'http';
import { Socket } from 'net';
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

// WebSocket server with origin verification
const wss = new WebSocketServer({ 
  server,
  clientTracking: true,
  perMessageDeflate: false, // Disable compression for lower latency
  maxPayload: 100 * 1024, // 100kb max payload
  verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
    const origin = info.origin || info.req.headers.origin || '';
    console.log(`[WS] Connection attempt from origin: ${origin}`);
    
    // Allow all origins if configured with *
    if (ALLOWED_ORIGINS.includes('*')) {
      console.log('[WS] Origin accepted (wildcard)');
      return true;
    }
    
    // Check if origin is in allowed list
    const allowed = ALLOWED_ORIGINS.some(allowedOrigin => {
      // Remove trailing slash for comparison
      const normalizedAllowed = allowedOrigin.replace(/\/$/, '');
      const normalizedOrigin = origin.replace(/\/$/, '');
      return normalizedOrigin === normalizedAllowed;
    });
    
    if (allowed) {
      console.log('[WS] Origin accepted:', origin);
    } else {
      console.warn('[WS] Origin rejected:', origin, 'Allowed:', ALLOWED_ORIGINS);
    }
    
    return allowed;
  }
});
const room = new GameRoom();

wss.on('connection', (ws: WebSocket, req) => {
  const origin = req.headers.origin || 'unknown';
  console.log(`[WS] New connection from origin: ${origin}`);

  // Keep-alive ping every 25 seconds to prevent Railway from closing idle connections
  let isAlive = true;
  const pingInterval = setInterval(() => {
    if (!isAlive) {
      clearInterval(pingInterval);
      ws.terminate();
      return;
    }
    isAlive = false;
    ws.ping();
  }, 25000);

  ws.on('pong', () => {
    isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      room.handleMessage(ws, msg);
    } catch (e) {
      console.error('[WS] Invalid message:', e);
    }
  });

  ws.on('close', (code) => {
    if (code !== 1000 && code !== 1001) {
      console.log(`[WS] Connection closed - Code: ${code}`);
    }
    clearInterval(pingInterval);
    room.handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    clearInterval(pingInterval);
    room.handleDisconnect(ws);
  });
});

// Start game loop
room.start();

// Configure server timeouts
server.timeout = 0; // Disable HTTP timeout for WebSocket connections
server.keepAliveTimeout = 65000; // 65 seconds
server.headersTimeout = 66000; // 66 seconds

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
