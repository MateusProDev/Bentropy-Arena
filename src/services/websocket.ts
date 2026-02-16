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
    this.generateBots(10);
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
      'ToxicFang', 'ShadowCoil', 'IronScale', 'NightViper',
      'BlazeTail', 'StormFang', 'CyberCobra', 'GhostNaga',
    ];

    const existingCount = this.bots.size;

    for (let i = 0; i < count; i++) {
      const idx = existingCount + i;
      const color = SNAKE_COLORS[idx % SNAKE_COLORS.length];
      const startX = Math.random() * (DEFAULT_CONFIG.worldSize - 1000) + 500;
      const startY = Math.random() * (DEFAULT_CONFIG.worldSize - 1000) + 500;
      const angle = Math.random() * Math.PI * 2;

      // Varied sizes: some small (15), some medium (30-60), a few big (80-120)
      const sizeRoll = Math.random();
      let baseLength: number;
      if (sizeRoll < 0.4) baseLength = Math.floor(Math.random() * 15) + 15;
      else if (sizeRoll < 0.8) baseLength = Math.floor(Math.random() * 30) + 30;
      else baseLength = Math.floor(Math.random() * 40) + 80;

      const segments: Vector2D[] = [];
      for (let j = 0; j < baseLength; j++) {
        segments.push({
          x: startX - Math.cos(angle) * j * 10,
          y: startY - Math.sin(angle) * j * 10,
        });
      }

      const bot: Player = {
        id: `bot_${Date.now()}_${idx}`,
        name: botNames[idx % botNames.length],
        photoURL: null,
        color,
        segments,
        direction: { x: Math.cos(angle), y: Math.sin(angle) },
        speed: DEFAULT_CONFIG.baseSpeed,
        score: Math.floor(baseLength * 3 + Math.random() * 50),
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

      const head = bot.segments[0];

      // --- Find nearest food (wider range for bigger bots) ---
      let nearestFood: Food | null = null;
      let nearestFoodDist = Infinity;
      const seekRange = 300 + bot.length * 3; // bigger snakes see farther

      for (const food of this.botFoods) {
        const dx = food.position.x - head.x;
        const dy = food.position.y - head.y;
        const dist = dx * dx + dy * dy;
        if (dist < nearestFoodDist) {
          nearestFoodDist = dist;
          nearestFood = food;
        }
      }

      // --- Avoid other snakes ---
      let avoidX = 0;
      let avoidY = 0;
      const avoidRadius = 60 + bot.length * 0.5;
      this.bots.forEach((other) => {
        if (other.id === bot.id || !other.alive) return;
        const checkSegs = Math.min(other.segments.length, 20);
        for (let i = 0; i < checkSegs; i++) {
          const seg = other.segments[i];
          const dx = head.x - seg.x;
          const dy = head.y - seg.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < avoidRadius && dist > 0) {
            const force = (avoidRadius - dist) / avoidRadius * 0.02;
            avoidX += (dx / dist) * force;
            avoidY += (dy / dist) * force;
          }
        }
      });

      // --- Decide direction ---
      if (Math.random() < 0.015) {
        // Random exploration
        const angle = Math.random() * Math.PI * 2;
        bot.direction = { x: Math.cos(angle), y: Math.sin(angle) };
      } else if (nearestFood && nearestFoodDist < seekRange * seekRange) {
        // Chase food
        const dx = nearestFood.position.x - head.x;
        const dy = nearestFood.position.y - head.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          const turnSpeed = 0.12;
          bot.direction.x += (dx / dist - bot.direction.x) * turnSpeed;
          bot.direction.y += (dy / dist - bot.direction.y) * turnSpeed;
        }
      }

      // Apply avoidance
      bot.direction.x += avoidX;
      bot.direction.y += avoidY;

      // Avoid walls (stronger push for bigger map)
      const wallMargin = 300;
      const wallForce = 0.08;
      if (head.x < wallMargin) bot.direction.x += wallForce * (1 - head.x / wallMargin);
      if (head.x > DEFAULT_CONFIG.worldSize - wallMargin) bot.direction.x -= wallForce * (1 - (DEFAULT_CONFIG.worldSize - head.x) / wallMargin);
      if (head.y < wallMargin) bot.direction.y += wallForce * (1 - head.y / wallMargin);
      if (head.y > DEFAULT_CONFIG.worldSize - wallMargin) bot.direction.y -= wallForce * (1 - (DEFAULT_CONFIG.worldSize - head.y) / wallMargin);

      // Normalize direction
      const dl = Math.sqrt(bot.direction.x ** 2 + bot.direction.y ** 2);
      if (dl > 0) {
        bot.direction.x /= dl;
        bot.direction.y /= dl;
      }

      // --- Boost logic: boost when chasing close food or when big ---
      const shouldBoost = (nearestFood && nearestFoodDist < 150 * 150 && bot.length > 20) ||
                          (bot.length > 60 && Math.random() < 0.03);
      bot.boosting = !!shouldBoost;
      if (bot.boosting && bot.length > 8) {
        bot.length -= DEFAULT_CONFIG.boostCost * 0.015;
      }

      // Move (bots are slower than players)
      const speed = (bot.boosting ? DEFAULT_CONFIG.boostSpeed : DEFAULT_CONFIG.baseSpeed) * 0.6;
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
        if (dx * dx + dy * dy < 500) {
          bot.score += food.value;
          bot.length += DEFAULT_CONFIG.growthRate;
          // Replace food
          this.botFoods[i] = {
            id: `food_${Date.now()}_${i}`,
            position: {
              x: Math.random() * (DEFAULT_CONFIG.worldSize - 200) + 100,
              y: Math.random() * (DEFAULT_CONFIG.worldSize - 200) + 100,
            },
            color: food.color,
            size: Math.random() * 4 + 4,
            value: Math.floor(Math.random() * 3) + 1,
          };
          break;
        }
      }

      bot.lastUpdate = Date.now();
    });

    // Respawn dead bots after a short delay
    deadBots.forEach((id) => {
      this.bots.delete(id);
    });
    // Keep bot count at 15
    const aliveBots = Array.from(this.bots.values()).filter(b => b.alive).length;
    const botsNeeded = 10 - aliveBots;
    if (botsNeeded > 0 && Math.random() < 0.1) {
      this.generateBots(Math.min(botsNeeded, 2));
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
