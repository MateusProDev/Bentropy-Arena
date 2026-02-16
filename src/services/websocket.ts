// ============================================================
// Bentropy Arena - WebSocket Client
// Handles real-time multiplayer communication
// Falls back to local AI bots when WS server is unavailable
// ============================================================

import type { WSMessage, JoinPayload, Player, Food, Vector2D } from '../types/game';
import { DEFAULT_CONFIG, SNAKE_COLORS } from '../types/game';

type MessageHandler = (msg: WSMessage) => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnected = false;
  private isFallbackMode = false;

  // Bot simulation
  private bots: Map<string, Player> = new Map();
  private botFoods: Food[] = [];
  private botInterval: ReturnType<typeof setInterval> | null = null;

  constructor(url?: string) {
    this.url = url || import.meta.env.VITE_WS_URL || '';
  }

  public connect(joinPayload: JoinPayload): void {
    // No server URL configured → immediate fallback with local bots
    if (!this.url) {
      this.startFallbackMode(joinPayload);
      return;
    }

    // Prevent mixed content (ws:// from https:// page)
    if (window.location.protocol === 'https:' && this.url.startsWith('ws://')) {
      console.warn('[WS] Cannot use ws:// from https://, starting local mode');
      this.startFallbackMode(joinPayload);
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WS] Connected to server');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.send({ type: 'join', payload: joinPayload, timestamp: Date.now() });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          this.emit(msg.type, msg);
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected');
        this.isConnected = false;
        this.attemptReconnect(joinPayload);
      };

      this.ws.onerror = () => {
        console.warn('[WS] Connection failed, switching to local mode with AI bots');
        this.ws?.close();
        this.startFallbackMode(joinPayload);
      };
    } catch {
      console.warn('[WS] Cannot connect, starting fallback mode');
      this.startFallbackMode(joinPayload);
    }
  }

  private attemptReconnect(joinPayload: JoinPayload): void {
    if (this.isFallbackMode) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WS] Max reconnect attempts reached, switching to fallback mode');
      this.startFallbackMode(joinPayload);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect(joinPayload);
    }, delay);
  }

  // ========================
  // Fallback mode with AI bots
  // ========================

  private startFallbackMode(joinPayload: JoinPayload): void {
    if (this.isFallbackMode) return;
    this.isFallbackMode = true;
    console.log('[WS] Starting local fallback mode with AI bots');

    // Generate bots
    this.generateBots(8);
    this.generateFoods(DEFAULT_CONFIG.foodCount);

    // Simulation loop - 30fps
    this.botInterval = setInterval(() => {
      this.updateBots();
      this.emitFallbackState(joinPayload.playerId);
    }, 1000 / 60);
  }

  private generateBots(count: number): void {
    const botNames = [
      'Cobra_AI', 'Python_Bot', 'Serpente_X', 'Viper_Pro',
      'Mamba_Zero', 'Anaconda_3', 'King_Snake', 'Naga_Elite',
      'SlitherKing', 'VenomByte', 'CoilMaster', 'FangStrike',
    ];

    for (let i = 0; i < count; i++) {
      const color = SNAKE_COLORS[i % SNAKE_COLORS.length];
      const startX = Math.random() * (DEFAULT_CONFIG.worldSize - 600) + 300;
      const startY = Math.random() * (DEFAULT_CONFIG.worldSize - 600) + 300;
      const angle = Math.random() * Math.PI * 2;

      const segments: Vector2D[] = [];
      const baseLength = Math.floor(Math.random() * 20) + 10;
      for (let j = 0; j < baseLength; j++) {
        segments.push({
          x: startX - Math.cos(angle) * j * 12,
          y: startY - Math.sin(angle) * j * 12,
        });
      }

      const bot: Player = {
        id: `bot_${i}`,
        name: botNames[i % botNames.length],
        photoURL: null,
        color,
        segments,
        direction: { x: Math.cos(angle), y: Math.sin(angle) },
        speed: DEFAULT_CONFIG.baseSpeed,
        score: Math.floor(Math.random() * 100),
        length: baseLength,
        alive: true,
        boosting: false,
        lastUpdate: Date.now(),
      };

      this.bots.set(bot.id, bot);
    }
  }

  private generateFoods(count: number): void {
    this.botFoods = [];
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

    for (let i = 0; i < count; i++) {
      this.botFoods.push({
        id: `food_${i}`,
        position: {
          x: Math.random() * (DEFAULT_CONFIG.worldSize - 100) + 50,
          y: Math.random() * (DEFAULT_CONFIG.worldSize - 100) + 50,
        },
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 4 + 4,
        value: Math.floor(Math.random() * 3) + 1,
      });
    }
  }

  private updateBots(): void {
    const deadBots: string[] = [];

    this.bots.forEach((bot) => {
      if (!bot.alive) return;

      // Simple AI: Move towards nearest food, with some randomness
      const head = bot.segments[0];
      let nearestFood: Food | null = null;
      let nearestDist = Infinity;

      for (const food of this.botFoods) {
        const dx = food.position.x - head.x;
        const dy = food.position.y - head.y;
        const dist = dx * dx + dy * dy;
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestFood = food;
        }
      }

      // Avoid other snakes (including player)
      let avoidX = 0;
      let avoidY = 0;
      this.bots.forEach((other) => {
        if (other.id === bot.id || !other.alive) return;
        for (let i = 0; i < Math.min(other.segments.length, 15); i++) {
          const seg = other.segments[i];
          const dx = head.x - seg.x;
          const dy = head.y - seg.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80 && dist > 0) {
            avoidX += (dx / dist) * (80 - dist) * 0.01;
            avoidY += (dy / dist) * (80 - dist) * 0.01;
          }
        }
      });

      // Random direction change
      if (Math.random() < 0.02) {
        const angle = Math.random() * Math.PI * 2;
        bot.direction = { x: Math.cos(angle), y: Math.sin(angle) };
      } else if (nearestFood && nearestDist < 200 * 200) {
        const dx = nearestFood.position.x - head.x;
        const dy = nearestFood.position.y - head.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          bot.direction.x += (dx / dist - bot.direction.x) * 0.1;
          bot.direction.y += (dy / dist - bot.direction.y) * 0.1;
        }
      }

      // Apply avoidance
      bot.direction.x += avoidX;
      bot.direction.y += avoidY;

      // Avoid walls
      const margin = 150;
      if (head.x < margin) bot.direction.x += 0.1;
      if (head.x > DEFAULT_CONFIG.worldSize - margin) bot.direction.x -= 0.1;
      if (head.y < margin) bot.direction.y += 0.1;
      if (head.y > DEFAULT_CONFIG.worldSize - margin) bot.direction.y -= 0.1;

      // Normalize direction
      const dl = Math.sqrt(bot.direction.x ** 2 + bot.direction.y ** 2);
      if (dl > 0) {
        bot.direction.x /= dl;
        bot.direction.y /= dl;
      }

      // Move
      const speed = bot.boosting ? DEFAULT_CONFIG.boostSpeed : DEFAULT_CONFIG.baseSpeed;
      const newHead = {
        x: head.x + bot.direction.x * speed,
        y: head.y + bot.direction.y * speed,
      };

      // Clamp to world
      newHead.x = Math.max(30, Math.min(DEFAULT_CONFIG.worldSize - 30, newHead.x));
      newHead.y = Math.max(30, Math.min(DEFAULT_CONFIG.worldSize - 30, newHead.y));

      bot.segments.unshift(newHead);
      while (bot.segments.length > bot.length) {
        bot.segments.pop();
      }

      // Check bot collision with other bot bodies
      let botDied = false;
      this.bots.forEach((other) => {
        if (other.id === bot.id || !other.alive || botDied) return;
        for (let i = 1; i < other.segments.length; i++) {
          const seg = other.segments[i];
          const dx = newHead.x - seg.x;
          const dy = newHead.y - seg.y;
          if (dx * dx + dy * dy < DEFAULT_CONFIG.segmentSize * DEFAULT_CONFIG.segmentSize * 2.25) {
            botDied = true;
            break;
          }
        }
      });

      // Check world boundary collision for bots
      if (newHead.x <= 10 || newHead.x >= DEFAULT_CONFIG.worldSize - 10 ||
          newHead.y <= 10 || newHead.y >= DEFAULT_CONFIG.worldSize - 10) {
        botDied = true;
      }

      if (botDied) {
        bot.alive = false;
        deadBots.push(bot.id);
        // Drop food where the bot died
        const dropCount = Math.min(Math.floor(bot.length / 3), 15);
        for (let i = 0; i < dropCount; i++) {
          const seg = bot.segments[Math.floor(Math.random() * bot.segments.length)];
          if (seg) {
            this.botFoods.push({
              id: `food_drop_${Date.now()}_${bot.id}_${i}`,
              position: { x: seg.x + (Math.random() - 0.5) * 30, y: seg.y + (Math.random() - 0.5) * 30 },
              color: bot.color,
              size: Math.random() * 4 + 5,
              value: Math.floor(Math.random() * 3) + 2,
            });
          }
        }
        return;
      }

      // Eat food
      for (let i = this.botFoods.length - 1; i >= 0; i--) {
        const food = this.botFoods[i];
        const dx = newHead.x - food.position.x;
        const dy = newHead.y - food.position.y;
        if (dx * dx + dy * dy < 400) {
          bot.score += food.value;
          bot.length += 1;
          // Replace food
          this.botFoods[i] = {
            id: `food_${Date.now()}_${i}`,
            position: {
              x: Math.random() * (DEFAULT_CONFIG.worldSize - 100) + 50,
              y: Math.random() * (DEFAULT_CONFIG.worldSize - 100) + 50,
            },
            color: food.color,
            size: Math.random() * 4 + 4,
            value: Math.floor(Math.random() * 3) + 1,
          };
          break;
        }
      }

      // Random boost
      bot.boosting = Math.random() < 0.01;
      bot.lastUpdate = Date.now();
    });

    // Respawn dead bots after a short delay
    deadBots.forEach((id) => {
      this.bots.delete(id);
    });
    // Keep bot count at 8
    const aliveBots = Array.from(this.bots.values()).filter(b => b.alive).length;
    if (aliveBots < 8 && Math.random() < 0.05) {
      this.generateBots(1);
    }
  }

  private emitFallbackState(_localPlayerId: string): void {
    const players: Record<string, Player> = {};
    this.bots.forEach((bot, id) => {
      players[id] = bot;
    });

    this.emit('state', {
      type: 'state',
      payload: {
        players,
        foods: this.botFoods,
        tick: Date.now(),
      },
      timestamp: Date.now(),
    });
  }

  // ========================
  // Communication
  // ========================

  public send(msg: WSMessage): void {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public sendMove(playerId: string, direction: Vector2D, position: Vector2D, boosting?: boolean): void {
    this.send({
      type: 'move',
      payload: { playerId, direction, position, boosting: boosting ?? false },
      timestamp: Date.now(),
    });
  }

  public on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  public off(type: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
  }

  private emit(type: string, msg: WSMessage): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach((h) => h(msg));
    }
  }

  public removeFallbackFood(foodId: string): void {
    const idx = this.botFoods.findIndex(f => f.id === foodId);
    if (idx !== -1) {
      const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
      this.botFoods[idx] = {
        id: `food_r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        position: {
          x: Math.random() * (DEFAULT_CONFIG.worldSize - 100) + 50,
          y: Math.random() * (DEFAULT_CONFIG.worldSize - 100) + 50,
        },
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 4 + 4,
        value: Math.floor(Math.random() * 3) + 1,
      };
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.botInterval) {
      clearInterval(this.botInterval);
    }
    this.bots.clear();
    this.botFoods = [];
    this.isFallbackMode = false;
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
  }

  public get connected(): boolean {
    return this.isConnected;
  }

  public get fallbackMode(): boolean {
    return this.isFallbackMode;
  }
}

// Singleton
let wsClientInstance: WSClient | null = null;

export function getWSClient(): WSClient {
  if (!wsClientInstance) {
    wsClientInstance = new WSClient();
  }
  return wsClientInstance;
}

export function resetWSClient(): void {
  wsClientInstance?.disconnect();
  wsClientInstance = null;
}
