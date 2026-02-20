// ============================================================
// Bentropy Arena - WebSocket Game Server
// Production-hardened for 24/7 uptime
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import type { IncomingMessage } from 'http';
import { GameRoom } from './GameRoom.js';

const PORT = parseInt(process.env.PORT || '8080');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',');
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '100');
const MSG_RATE_LIMIT = 60; // max messages per second per client
const MSG_RATE_WINDOW = 1000; // ms

// ========================
// Process-level error resilience
// ========================
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message, err.stack);
  // Don't exit — keep serving. Railway will restart if we do exit.
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

// ========================
// Memory monitoring (log every 60s)
// ========================
const MEM_LOG_INTERVAL = 60_000;
setInterval(() => {
  const mem = process.memoryUsage();
  const rss = (mem.rss / 1024 / 1024).toFixed(1);
  const heap = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const heapTotal = (mem.heapTotal / 1024 / 1024).toFixed(1);
  const external = (mem.external / 1024 / 1024).toFixed(1);
  console.log(`[MEM] RSS=${rss}MB Heap=${heap}/${heapTotal}MB Ext=${external}MB Conns=${wss.clients.size}`);
}, MEM_LOG_INTERVAL).unref();

// Per-client rate limiting tracking
const clientMsgCounts = new WeakMap<WebSocket, { count: number; resetAt: number }>();

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
    const mem = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      players: room.humanCount,
      totalEntities: room.totalAliveCount,
      connections: wss.clients.size,
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: Math.floor(mem.rss / 1024 / 1024),
        heapUsed: Math.floor(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.floor(mem.heapTotal / 1024 / 1024),
      },
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

  // ── Connection limit ──
  if (wss.clients.size > MAX_CONNECTIONS) {
    console.warn(`[WS] Connection rejected — limit ${MAX_CONNECTIONS} reached`);
    ws.close(1013, 'Server full');
    return;
  }

  console.log(`[WS] New connection from origin: ${origin} (total: ${wss.clients.size})`);

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
  }, 25_000);

  ws.on('pong', () => {
    isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      // ── Rate limiting per client ──
      const now = Date.now();
      let rl = clientMsgCounts.get(ws);
      if (!rl) {
        rl = { count: 0, resetAt: now + MSG_RATE_WINDOW };
        clientMsgCounts.set(ws, rl);
      }
      if (now >= rl.resetAt) {
        rl.count = 0;
        rl.resetAt = now + MSG_RATE_WINDOW;
      }
      rl.count++;
      if (rl.count > MSG_RATE_LIMIT) {
        // Silently drop excess messages
        return;
      }

      const raw = data.toString();
      if (raw.length > 2048) return; // Drop oversized messages

      const msg = JSON.parse(raw);
      if (!msg || typeof msg.type !== 'string') return;

      room.handleMessage(ws, msg);
    } catch (_e) {
      // Malformed JSON — silently ignore (don't log spam)
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

// Graceful shutdown with timeout
function shutdown(signal: string): void {
  console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
  room.stop();

  // Close all WebSocket connections cleanly
  for (const client of wss.clients) {
    try { client.close(1001, 'Server shutting down'); } catch (_e) { /* ignore */ }
  }

  wss.close(() => {
    server.close(() => {
      console.log('[Server] Shutdown complete');
      process.exit(0);
    });
  });

  // Force exit after 5 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
