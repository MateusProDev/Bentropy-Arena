// ============================================================
// Bentropy Arena - Game Room (Server-side game loop)
// Handles all players, bots, food, collisions, and state broadcasting
// ============================================================

import { WebSocket } from 'ws';

// ========================
// Types (matching client types)
// ========================

interface Vector2D {
  x: number;
  y: number;
}

interface Player {
  id: string;
  name: string;
  photoURL: string | null;
  color: string;
  segments: Vector2D[];
  direction: Vector2D;
  speed: number;
  score: number;
  length: number;
  alive: boolean;
  boosting: boolean;
  lastUpdate: number;
}

interface Food {
  id: string;
  position: Vector2D;
  color: string;
  size: number;
  value: number;
}

interface GameConfig {
  worldSize: number;
  maxPlayers: number;
  foodCount: number;
  baseSpeed: number;
  boostSpeed: number;
  boostCost: number;
  growthRate: number;
  tickRate: number;
  segmentSize: number;
  foodSize: number;
}

interface ServerPlayer {
  player: Player;
  ws: WebSocket | null; // null for bots
  inputDirection: Vector2D;
  inputBoosting: boolean;
  isBot: boolean;
  lastInputTime: number;
}

// ========================
// Constants
// ========================

const DEFAULT_CONFIG: GameConfig = {
  worldSize: 14000,
  maxPlayers: 50,
  foodCount: 1500,
  baseSpeed: 4,
  boostSpeed: 8,
  boostCost: 0.5,
  growthRate: 1,
  tickRate: 30,
  segmentSize: 10,
  foodSize: 6,
};

// Viewport radius: only send entities within this distance
const VIEW_RADIUS = 2500;
const VIEW_RADIUS_SQ = VIEW_RADIUS * VIEW_RADIUS;

const SNAKE_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
  '#e879f9', '#fb923c', '#22d3ee', '#a3e635', '#f472b6',
];

const BOT_NAMES = [
  'Cobra_AI', 'Python_Bot', 'Serpente_X', 'Viper_Pro',
  'Mamba_Zero', 'Anaconda_3', 'King_Snake', 'Naga_Elite',
  'SlitherKing', 'VenomByte', 'CoilMaster', 'FangStrike',
  'ToxicTail', 'ScaleStorm', 'HissHero', 'BiteForce',
];

const FOOD_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

// ========================
// GameRoom
// ========================

export class GameRoom {
  private players: Map<string, ServerPlayer> = new Map();
  private wsToPlayerId: Map<WebSocket, string> = new Map();
  private foods: Food[] = [];
  private config: GameConfig;
  private tick = 0;
  private loopInterval: ReturnType<typeof setInterval> | null = null;
  private botIdCounter = 0;
  private readonly minBots = 10;

  constructor(config?: Partial<GameConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ========================
  // Public getters
  // ========================

  get humanCount(): number {
    return Array.from(this.players.values()).filter(p => !p.isBot).length;
  }

  get totalAliveCount(): number {
    return Array.from(this.players.values()).filter(p => p.player.alive).length;
  }

  public getStats() {
    const humans = Array.from(this.players.values()).filter(p => !p.isBot);
    const bots = Array.from(this.players.values()).filter(p => p.isBot);
    return {
      humans: humans.length,
      humansAlive: humans.filter(p => p.player.alive).length,
      bots: bots.length,
      botsAlive: bots.filter(p => p.player.alive).length,
      foods: this.foods.length,
      tick: this.tick,
      worldSize: this.config.worldSize,
    };
  }

  // ========================
  // Lifecycle
  // ========================

  public start(): void {
    this.generateFoods(this.config.foodCount);
    this.spawnBots(this.minBots);

    this.loopInterval = setInterval(() => {
      this.update();
      this.broadcast();
    }, 1000 / this.config.tickRate);

    console.log(`[Room] Game loop started at ${this.config.tickRate} tps`);
    console.log(`[Room] World: ${this.config.worldSize}x${this.config.worldSize}, Food: ${this.config.foodCount}`);
  }

  public stop(): void {
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    console.log('[Room] Game loop stopped');
  }

  // ========================
  // Message handling
  // ========================

  public handleMessage(ws: WebSocket, msg: { type: string; payload: any; timestamp: number }): void {
    switch (msg.type) {
      case 'join':
        this.handleJoin(ws, msg.payload);
        break;
      case 'move':
        this.handleMove(ws, msg.payload);
        break;
      case 'ping':
        this.sendTo(ws, { type: 'pong', payload: { serverTime: Date.now() }, timestamp: Date.now() });
        break;
    }
  }

  public handleDisconnect(ws: WebSocket): void {
    const playerId = this.wsToPlayerId.get(ws);
    if (!playerId) return;

    const sp = this.players.get(playerId);
    if (sp) {
      console.log(`[Room] Player "${sp.player.name}" disconnected`);
      // Drop food where the player was
      if (sp.player.alive) {
        this.dropFood(sp.player);
      }
      this.players.delete(playerId);
    }
    this.wsToPlayerId.delete(ws);

    // Refill bots
    this.maintainBots();
    console.log(`[Room] Players: ${this.humanCount} humans, ${this.totalAliveCount} total alive`);
  }

  // ========================
  // Player management
  // ========================

  private handleJoin(ws: WebSocket, payload: any): void {
    const { playerId, playerName, color, photoURL } = payload;

    // Disconnect old session if reconnecting
    if (this.players.has(playerId)) {
      const old = this.players.get(playerId)!;
      if (old.ws) {
        this.wsToPlayerId.delete(old.ws);
        try { old.ws.close(); } catch (_e) { /* ignore */ }
      }
      this.players.delete(playerId);
    }

    const player = this.createPlayer(playerId, playerName, color, photoURL);
    const sp: ServerPlayer = {
      player,
      ws,
      inputDirection: { ...player.direction },
      inputBoosting: false,
      isBot: false,
      lastInputTime: Date.now(),
    };

    this.players.set(playerId, sp);
    this.wsToPlayerId.set(ws, playerId);

    // Send welcome with config
    this.sendTo(ws, {
      type: 'welcome',
      payload: {
        playerId,
        config: this.config,
      },
      timestamp: Date.now(),
    });

    console.log(`[Room] Player "${playerName}" (${playerId.slice(0, 8)}...) joined`);
    console.log(`[Room] Players: ${this.humanCount} humans, ${this.totalAliveCount} total alive`);

    // Reduce bots as humans join
    this.maintainBots();
  }

  private handleMove(ws: WebSocket, payload: any): void {
    const playerId = this.wsToPlayerId.get(ws);
    if (!playerId) return;

    const sp = this.players.get(playerId);
    if (!sp || !sp.player.alive) return;

    if (payload.direction) {
      const { x, y } = payload.direction;
      const len = Math.sqrt(x * x + y * y);
      if (len > 0) {
        sp.inputDirection = { x: x / len, y: y / len };
      }
    }

    if (payload.boosting !== undefined) {
      sp.inputBoosting = !!payload.boosting;
    }

    sp.lastInputTime = Date.now();
  }

  // ========================
  // Main game loop
  // ========================

  private update(): void {
    this.tick++;
    const deadPlayers: Set<string> = new Set();

    // === Phase 1: Move all players ===
    this.players.forEach((sp, id) => {
      if (!sp.player.alive) return;

      // Update bot AI
      if (sp.isBot) {
        this.updateBotAI(sp);
      }

      // Smooth direction interpolation
      const lerp = 0.15;
      const dir = sp.player.direction;
      const target = sp.inputDirection;
      dir.x += (target.x - dir.x) * lerp;
      dir.y += (target.y - dir.y) * lerp;
      const nd = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
      if (nd > 0) {
        dir.x /= nd;
        dir.y /= nd;
      }

      // Boost
      sp.player.boosting = sp.inputBoosting;
      const speed = sp.player.boosting ? this.config.boostSpeed : this.config.baseSpeed;
      if (sp.player.boosting && sp.player.length > 5) {
        sp.player.length -= this.config.boostCost * 0.02;
      }

      // Move head
      const head = sp.player.segments[0];
      const newHead = {
        x: head.x + dir.x * speed,
        y: head.y + dir.y * speed,
      };

      sp.player.segments.unshift(newHead);
      while (sp.player.segments.length > sp.player.length) {
        sp.player.segments.pop();
      }

      // Wall collision
      if (
        newHead.x <= 10 || newHead.x >= this.config.worldSize - 10 ||
        newHead.y <= 10 || newHead.y >= this.config.worldSize - 10
      ) {
        this.killPlayer(sp, null, deadPlayers);
        deadPlayers.add(id);
        return;
      }

      // Food collision
      for (let i = this.foods.length - 1; i >= 0; i--) {
        const food = this.foods[i];
        const dx = newHead.x - food.position.x;
        const dy = newHead.y - food.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.config.segmentSize + this.config.foodSize) {
          sp.player.score += food.value;
          sp.player.length += this.config.growthRate;
          // Respawn food at new location
          this.foods[i] = this.createFood();
          break;
        }
      }

      sp.player.lastUpdate = Date.now();
    });

    // === Phase 2: Check player-player collisions ===
    this.players.forEach((sp, id) => {
      if (!sp.player.alive || deadPlayers.has(id)) return;
      const head = sp.player.segments[0];
      if (!head) return;

      this.players.forEach((other, otherId) => {
        if (otherId === id || !other.player.alive || deadPlayers.has(otherId)) return;

        // Head-to-head collision
        const otherHead = other.player.segments[0];
        if (otherHead) {
          const dx = head.x - otherHead.x;
          const dy = head.y - otherHead.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < this.config.segmentSize * 1.8) {
            // Smaller dies, equal both die
            if (sp.player.length <= other.player.length) {
              this.killPlayer(sp, other.player.name, deadPlayers);
              deadPlayers.add(id);
            }
            if (other.player.length <= sp.player.length) {
              this.killPlayer(other, sp.player.name, deadPlayers);
              deadPlayers.add(otherId);
            }
            return;
          }
        }

        // Head vs body
        for (let i = 1; i < other.player.segments.length; i++) {
          const seg = other.player.segments[i];
          const dx = head.x - seg.x;
          const dy = head.y - seg.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < this.config.segmentSize * 1.5) {
            this.killPlayer(sp, other.player.name, deadPlayers);
            deadPlayers.add(id);
            // Reward the killer
            other.player.score += Math.floor(sp.player.score * 0.3);
            return;
          }
        }
      });

      // Self-collision
      if (!deadPlayers.has(id) && sp.player.alive && sp.player.segments.length > 30) {
        for (let i = 20; i < sp.player.segments.length; i++) {
          const seg = sp.player.segments[i];
          const dx = head.x - seg.x;
          const dy = head.y - seg.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < this.config.segmentSize * 0.8) {
            this.killPlayer(sp, null, deadPlayers);
            deadPlayers.add(id);
            return;
          }
        }
      }
    });

    // === Phase 3: Handle deaths ===
    deadPlayers.forEach((id) => {
      const sp = this.players.get(id);
      if (sp) {
        this.dropFood(sp.player);
        if (sp.isBot) {
          this.players.delete(id);
        }
      }
    });

    // === Phase 4: Maintain bots ===
    if (this.tick % 90 === 0) {
      this.maintainBots();
    }

    // === Phase 5: Maintain food count ===
    while (this.foods.length < this.config.foodCount * 0.8) {
      this.foods.push(this.createFood());
    }
  }

  // ========================
  // Kill & Death
  // ========================

  private killPlayer(sp: ServerPlayer, killedBy: string | null, _deadSet: Set<string>): void {
    sp.player.alive = false;

    // Notify the player
    if (sp.ws && sp.ws.readyState === WebSocket.OPEN) {
      this.sendTo(sp.ws, {
        type: 'death',
        payload: {
          playerId: sp.player.id,
          killedBy,
          score: Math.floor(sp.player.score),
          length: Math.floor(sp.player.length),
        },
        timestamp: Date.now(),
      });
    }
  }

  // ========================
  // Broadcasting
  // ========================

  private broadcast(): void {
    // Broadcast state every other tick (15fps state updates to save bandwidth)
    if (this.tick % 2 !== 0) return;

    const now = Date.now();

    this.players.forEach((sp, currentPlayerId) => {
      if (!sp.ws || sp.ws.readyState !== WebSocket.OPEN || !sp.player.alive) return;

      const head = sp.player.segments[0];
      if (!head) return;

      // Cull players + LOD: send fewer segments for distant snakes
      const playerData: Record<string, any> = {};
      this.players.forEach((other, id) => {
        if (!other.player.alive) return;
        const otherHead = other.player.segments[0];
        if (!otherHead) return;
        const dx = head.x - otherHead.x;
        const dy = head.y - otherHead.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > VIEW_RADIUS_SQ) return;

        const isSelf = id === currentPlayerId;
        const maxSegs = isSelf
          ? other.player.segments.length
          : distSq < 800 * 800
            ? other.player.segments.length
            : distSq < 1500 * 1500
              ? Math.min(other.player.segments.length, 80)
              : Math.min(other.player.segments.length, 30);

        playerData[id] = {
          id: other.player.id,
          name: other.player.name,
          photoURL: other.player.photoURL,
          color: other.player.color,
          segments: other.player.segments.slice(0, maxSegs),
          direction: other.player.direction,
          score: other.player.score,
          length: other.player.length,
          alive: other.player.alive,
          boosting: other.player.boosting,
          speed: other.player.speed,
          lastUpdate: other.player.lastUpdate,
        };
      });

      // Cull foods: only nearby
      const nearbyFoods: Food[] = [];
      for (const food of this.foods) {
        const dx = food.position.x - head.x;
        const dy = food.position.y - head.y;
        if (dx * dx + dy * dy <= VIEW_RADIUS_SQ) {
          nearbyFoods.push(food);
        }
      }

      try {
        sp.ws.send(JSON.stringify({
          type: 'state',
          payload: { players: playerData, foods: nearbyFoods, tick: this.tick },
          timestamp: now,
        }));
      } catch (_e) { /* ignore send errors */ }
    });
  }

  private sendTo(ws: WebSocket, msg: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // ========================
  // Bots
  // ========================

  private spawnBots(count: number): void {
    for (let i = 0; i < count; i++) {
      this.spawnBot();
    }
  }

  private spawnBot(): void {
    const id = `bot_${this.botIdCounter++}`;
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const color = SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)];
    const player = this.createPlayer(id, name, color, null);
    // Give bots random starting size
    const extraLength = Math.floor(Math.random() * 20);
    player.length += extraLength;
    player.score = Math.floor(Math.random() * 50);

    // Fill segments to match length
    const angle = Math.atan2(player.direction.y, player.direction.x);
    for (let i = player.segments.length; i < player.length; i++) {
      const last = player.segments[player.segments.length - 1];
      player.segments.push({
        x: last.x - Math.cos(angle) * this.config.segmentSize,
        y: last.y - Math.sin(angle) * this.config.segmentSize,
      });
    }

    const sp: ServerPlayer = {
      player,
      ws: null,
      inputDirection: { ...player.direction },
      inputBoosting: false,
      isBot: true,
      lastInputTime: Date.now(),
    };

    this.players.set(id, sp);
  }

  private maintainBots(): void {
    const humanCount = this.humanCount;
    const aliveBots = Array.from(this.players.values()).filter(p => p.isBot && p.player.alive).length;
    const totalAlive = this.totalAliveCount;

    // Target: keep arena populated. More humans = fewer bots needed.
    const targetBots = Math.max(this.minBots - humanCount, 2);

    if (aliveBots < targetBots && totalAlive < this.config.maxPlayers) {
      this.spawnBot();
    }

    // Clean up dead bots
    const deadBots = Array.from(this.players.entries())
      .filter(([, sp]) => sp.isBot && !sp.player.alive);
    deadBots.forEach(([id]) => this.players.delete(id));
  }

  private updateBotAI(sp: ServerPlayer): void {
    const head = sp.player.segments[0];
    if (!head) return;

    // Find nearest food
    let nearestFood: Food | null = null;
    let nearestDist = Infinity;
    for (const food of this.foods) {
      const dx = food.position.x - head.x;
      const dy = food.position.y - head.y;
      const dist = dx * dx + dy * dy;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestFood = food;
      }
    }

    // Avoid other snakes
    let avoidX = 0;
    let avoidY = 0;
    this.players.forEach((other) => {
      if (other === sp || !other.player.alive) return;
      for (let i = 0; i < Math.min(other.player.segments.length, 10); i++) {
        const seg = other.player.segments[i];
        const dx = head.x - seg.x;
        const dy = head.y - seg.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100 && dist > 0) {
          avoidX += (dx / dist) * (100 - dist) * 0.008;
          avoidY += (dy / dist) * (100 - dist) * 0.008;
        }
      }
    });

    // Random direction change
    if (Math.random() < 0.02) {
      const angle = Math.random() * Math.PI * 2;
      sp.inputDirection = { x: Math.cos(angle), y: Math.sin(angle) };
    } else if (nearestFood && nearestDist < 200 * 200) {
      const dx = nearestFood.position.x - head.x;
      const dy = nearestFood.position.y - head.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        sp.inputDirection.x += (dx / dist - sp.inputDirection.x) * 0.1;
        sp.inputDirection.y += (dy / dist - sp.inputDirection.y) * 0.1;
      }
    }

    // Apply avoidance
    sp.inputDirection.x += avoidX;
    sp.inputDirection.y += avoidY;

    // Avoid walls
    const margin = 200;
    if (head.x < margin) sp.inputDirection.x += 0.15;
    if (head.x > this.config.worldSize - margin) sp.inputDirection.x -= 0.15;
    if (head.y < margin) sp.inputDirection.y += 0.15;
    if (head.y > this.config.worldSize - margin) sp.inputDirection.y -= 0.15;

    // Normalize
    const dl = Math.sqrt(sp.inputDirection.x ** 2 + sp.inputDirection.y ** 2);
    if (dl > 0) {
      sp.inputDirection.x /= dl;
      sp.inputDirection.y /= dl;
    }

    // Random boost
    sp.inputBoosting = Math.random() < 0.005;
  }

  // ========================
  // Entity creation helpers
  // ========================

  private createPlayer(id: string, name: string, color: string, photoURL: string | null): Player {
    const startX = Math.random() * (this.config.worldSize - 600) + 300;
    const startY = Math.random() * (this.config.worldSize - 600) + 300;
    const angle = Math.random() * Math.PI * 2;

    const segments: Vector2D[] = [];
    for (let i = 0; i < 10; i++) {
      segments.push({
        x: startX - Math.cos(angle) * i * this.config.segmentSize,
        y: startY - Math.sin(angle) * i * this.config.segmentSize,
      });
    }

    return {
      id,
      name,
      photoURL,
      color,
      segments,
      direction: { x: Math.cos(angle), y: Math.sin(angle) },
      speed: this.config.baseSpeed,
      score: 0,
      length: 10,
      alive: true,
      boosting: false,
      lastUpdate: Date.now(),
    };
  }

  private createFood(): Food {
    return {
      id: `food_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      position: {
        x: Math.random() * (this.config.worldSize - 100) + 50,
        y: Math.random() * (this.config.worldSize - 100) + 50,
      },
      color: FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)],
      size: Math.random() * 4 + 4,
      value: Math.floor(Math.random() * 3) + 1,
    };
  }

  private generateFoods(count: number): void {
    this.foods = [];
    for (let i = 0; i < count; i++) {
      this.foods.push(this.createFood());
    }
  }

  private dropFood(player: Player): void {
    const dropCount = Math.min(Math.floor(player.length / 3), 20);
    for (let i = 0; i < dropCount; i++) {
      const segIdx = Math.floor(Math.random() * player.segments.length);
      const seg = player.segments[segIdx];
      if (seg) {
        this.foods.push({
          id: `food_drop_${Date.now()}_${player.id}_${i}`,
          position: {
            x: seg.x + (Math.random() - 0.5) * 40,
            y: seg.y + (Math.random() - 0.5) * 40,
          },
          color: player.color,
          size: Math.random() * 4 + 5,
          value: Math.floor(Math.random() * 3) + 2,
        });
      }
    }
  }
}
