// ============================================================
// Bentropy Arena - Game Room v3 (Server)
// Spatial hashing, state-machine bot AI, O(1) collisions
// ============================================================

import { WebSocket } from 'ws';

// ========================
// Spatial Hash Grid (pooled — zero allocation per tick)
// ========================
class SpatialHash {
  private cells: Map<number, string[]> = new Map();
  private cellLengths: Map<number, number> = new Map();
  private cs: number;
  // Reusable query result buffer
  private _queryBuf: string[] = [];

  constructor(cs: number) { this.cs = cs; }

  private k(cx: number, cy: number): number {
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  clear(): void {
    // Don't delete cells — just reset their logical lengths to 0
    this.cellLengths.forEach((_len, key) => {
      this.cellLengths.set(key, 0);
    });
  }

  insert(x: number, y: number, id: string): void {
    const cx = (x / this.cs) | 0, cy = (y / this.cs) | 0;
    const k = this.k(cx, cy);
    let cell = this.cells.get(k);
    let len = this.cellLengths.get(k) ?? 0;
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    if (len < cell.length) {
      cell[len] = id;
    } else {
      cell.push(id);
    }
    this.cellLengths.set(k, len + 1);
  }

  /** Returns a shared buffer — caller must consume before next query call */
  query(x: number, y: number, radius: number): string[] {
    const result = this._queryBuf;
    let ri = 0;
    const minCx = ((x - radius) / this.cs) | 0, maxCx = ((x + radius) / this.cs) | 0;
    const minCy = ((y - radius) / this.cs) | 0, maxCy = ((y + radius) / this.cs) | 0;
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const k = this.k(cx, cy);
        const cell = this.cells.get(k);
        if (!cell) continue;
        const len = this.cellLengths.get(k)!;
        for (let i = 0; i < len; i++) {
          if (ri < result.length) result[ri] = cell[i];
          else result.push(cell[i]);
          ri++;
        }
      }
    }
    result.length = ri;
    return result;
  }
}

// ========================
// Food Spatial Hash (index-based for O(1) nearest-food queries)
// ========================
class FoodSpatialHash {
  private cells: Map<number, number[]> = new Map();
  private cs: number;
  constructor(cs: number) { this.cs = cs; }
  private k(cx: number, cy: number): number {
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }
  clear(): void { this.cells.clear(); }
  build(foods: Food[]): void {
    this.cells.clear();
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      const cx = (f.position.x / this.cs) | 0, cy = (f.position.y / this.cs) | 0;
      const k = this.k(cx, cy);
      let c = this.cells.get(k);
      if (!c) { c = []; this.cells.set(k, c); }
      c.push(i);
    }
  }
  queryNearest(x: number, y: number, r: number, foods: Food[]): number {
    let bestIdx = -1, bestDist = r * r;
    const minCx = ((x - r) / this.cs) | 0, maxCx = ((x + r) / this.cs) | 0;
    const minCy = ((y - r) / this.cs) | 0, maxCy = ((y + r) / this.cs) | 0;
    for (let cx = minCx; cx <= maxCx; cx++)
      for (let cy = minCy; cy <= maxCy; cy++) {
        const c = this.cells.get(this.k(cx, cy));
        if (!c) continue;
        for (const idx of c) {
          const f = foods[idx];
          const dx = f.position.x - x, dy = f.position.y - y;
          const d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; bestIdx = idx; }
        }
      }
    return bestIdx;
  }
  queryInRange(x: number, y: number, r: number, foods: Food[]): number[] {
    const out: number[] = [];
    const rSq = r * r;
    const minCx = ((x - r) / this.cs) | 0, maxCx = ((x + r) / this.cs) | 0;
    const minCy = ((y - r) / this.cs) | 0, maxCy = ((y + r) / this.cs) | 0;
    for (let cx = minCx; cx <= maxCx; cx++)
      for (let cy = minCy; cy <= maxCy; cy++) {
        const c = this.cells.get(this.k(cx, cy));
        if (!c) continue;
        for (const idx of c) {
          const f = foods[idx];
          const dx = f.position.x - x, dy = f.position.y - y;
          if (dx * dx + dy * dy < rSq) out.push(idx);
        }
      }
    return out;
  }
}

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

// Bot behaviour states
type BotState = 'explore' | 'hunt' | 'flee' | 'ambush';

interface BotMemory {
  state: BotState;
  stateTimer: number;        // ticks until re-evaluate
  targetFoodIdx: number;     // index into foods array
  targetPlayerId: string;    // player to ambush/chase
  exploreAngle: number;      // wander direction
  exploreTurns: number;      // how long to hold that angle
  personalityAggression: number; // 0-1 (flee vs hunt preference)
  personalitySpeed: number;      // base speed modifier 0.8-1.2
}

interface ServerPlayer {
  player: Player;
  ws: WebSocket | null; // null for bots
  inputDirection: Vector2D;
  inputBoosting: boolean;
  isBot: boolean;
  lastInputTime: number;
  botMemory?: BotMemory;
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
const VIEW_RADIUS = 4000;
const VIEW_RADIUS_SQ = VIEW_RADIUS * VIEW_RADIUS;

// Hard cap on snake length to prevent memory issues
const MAX_SNAKE_LENGTH = 2000;

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
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private loopRunning = false;
  private botIdCounter = 0;
  private readonly minBots = 14;
  // Spatial hash: cell size = 2x segment collision radius for efficiency
  private spatialHash = new SpatialHash(160);
  // Head spatial hash for O(1) head-to-head collision
  private headHash = new SpatialHash(100);
  // Food spatial hash for O(1) bot food queries
  private foodHash = new FoodSpatialHash(300);
  private foodHashDirty = true;
  // Food ID → index map for O(1) lookup in handleFoodEaten
  private foodIdMap: Map<string, number> = new Map();
  // Monotonic food ID counter (avoids Date.now + Math.random per food)
  private foodIdCounter = 0;
  // Pre-built per-tick head position index for fast O(1) lookup
  private readonly botRespawnQueue: Array<{ at: number }> = [];
  // Pooled sets to avoid per-tick allocation
  private readonly _deadPlayers = new Set<string>();
  private readonly _checked = new Set<string>();
  private readonly _seenIds = new Set<string>();

  // Cached player counts — updated once per tick via _refreshCounts()
  private _humanCount = 0;
  private _botCount = 0;
  private _humansAlive = 0;
  private _botsAlive = 0;
  private _countsDirty = true;

  constructor(config?: Partial<GameConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ========================
  // Public getters (cached — O(1))
  // ========================

  private _refreshCounts(): void {
    if (!this._countsDirty) return;
    let hc = 0, bc = 0, ha = 0, ba = 0;
    this.players.forEach((sp) => {
      if (sp.isBot) {
        bc++;
        if (sp.player.alive) ba++;
      } else {
        hc++;
        if (sp.player.alive) ha++;
      }
    });
    this._humanCount = hc;
    this._botCount = bc;
    this._humansAlive = ha;
    this._botsAlive = ba;
    this._countsDirty = false;
  }

  get humanCount(): number {
    this._refreshCounts();
    return this._humanCount;
  }

  get totalAliveCount(): number {
    this._refreshCounts();
    return this._humansAlive + this._botsAlive;
  }

  public getStats() {
    this._refreshCounts();
    return {
      humans: this._humanCount,
      humansAlive: this._humansAlive,
      bots: this._botCount,
      botsAlive: this._botsAlive,
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

    const tickMs = 1000 / this.config.tickRate;
    let lastTick = performance.now();
    this.loopRunning = true;

    const loop = () => {
      if (!this.loopRunning) return;
      const now = performance.now();
      const elapsed = now - lastTick;

      try {
        this.update();
        this.broadcast();
      } catch (err) {
        console.error('[Room] Tick error (recovered):', err);
      }

      lastTick = now;
      // Compensate for drift: subtract processing time from next delay
      const processingTime = performance.now() - now;
      const nextDelay = Math.max(1, tickMs - processingTime);
      this.loopTimer = setTimeout(loop, nextDelay);
    };

    this.loopTimer = setTimeout(loop, tickMs);

    console.log(`[Room] Game loop started at ${this.config.tickRate} tps (precision timer)`);
    console.log(`[Room] World: ${this.config.worldSize}x${this.config.worldSize}, Food: ${this.config.foodCount}`);
  }

  public stop(): void {
    this.loopRunning = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
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
      case 'food_eaten':
        this.handleFoodEaten(ws, msg.payload);
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
    this._countsDirty = true;

    // Refill bots
    this.maintainBots();
    console.log(`[Room] Players: ${this.humanCount} humans, ${this.totalAliveCount} total alive`);
  }

  // ========================
  // Player management
  // ========================

  private handleJoin(ws: WebSocket, payload: any): void {
    if (!payload || typeof payload !== 'object') return;
    const { playerId, playerName, color, photoURL } = payload;
    if (typeof playerId !== 'string' || typeof playerName !== 'string') return;
    if (playerId.length > 128 || playerName.length > 32) return;

    // Disconnect old session if reconnecting
    if (this.players.has(playerId)) {
      const old = this.players.get(playerId)!;
      if (old.ws) {
        this.wsToPlayerId.delete(old.ws);
        try { old.ws.close(); } catch (_e) { /* ignore */ }
      }
      this.players.delete(playerId);
    }

    // Spawn human players near the center so they encounter each other
    const player = this.createPlayerNearCenter(playerId, playerName, color, photoURL);
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
    this._countsDirty = true;

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

  private handleFoodEaten(ws: WebSocket, payload: any): void {
    const playerId = this.wsToPlayerId.get(ws);
    if (!playerId) return;
    const sp = this.players.get(playerId);
    if (!sp || !sp.player.alive) return;

    const { foodId } = payload;
    if (typeof foodId !== 'string') return;

    const foodIdx = this.foodIdMap.get(foodId);
    if (foodIdx !== undefined && foodIdx < this.foods.length) {
      const food = this.foods[foodIdx];
      if (food.id === foodId) {
        sp.player.score += food.value;
        sp.player.length = Math.min(sp.player.length + this.config.growthRate, MAX_SNAKE_LENGTH);
        // Replace with new food
        const newFood = this.createFood();
        this.foods[foodIdx] = newFood;
        this.foodIdMap.delete(foodId);
        this.foodIdMap.set(newFood.id, foodIdx);
        this.foodHashDirty = true;
      }
    }
  }

  private handleMove(ws: WebSocket, payload: any): void {
    if (!payload || typeof payload !== 'object') return;
    const playerId = this.wsToPlayerId.get(ws);
    if (!playerId) return;

    const sp = this.players.get(playerId);
    if (!sp || !sp.player.alive) return;

    if (payload.direction && typeof payload.direction.x === 'number' && typeof payload.direction.y === 'number') {
      const { x, y } = payload.direction;
      if (!isFinite(x) || !isFinite(y)) return;
      const len = Math.sqrt(x * x + y * y);
      if (len > 0) {
        sp.inputDirection = { x: x / len, y: y / len };
      }
    }

    // Use client-reported position for viewport culling (reduces divergence)
    if (payload.position && typeof payload.position.x === 'number' && isFinite(payload.position.x) && isFinite(payload.position.y)) {
      sp.player.segments[0] = {
        x: Math.max(0, Math.min(this.config.worldSize, payload.position.x)),
        y: Math.max(0, Math.min(this.config.worldSize, payload.position.y)),
      };
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
    const now = Date.now();
    this._deadPlayers.clear();
    const deadPlayers = this._deadPlayers;

    // ══ Phase 0: Rebuild spatial hashes ══
    this.spatialHash.clear();
    this.headHash.clear();
    this.players.forEach((sp) => {
      if (!sp.player.alive) return;
      const segs = sp.player.segments;
      const limit = Math.min(segs.length, 80);
      for (let i = 1; i < limit; i++) {
        this.spatialHash.insert(segs[i].x, segs[i].y, sp.player.id);
      }
      // Insert head into head hash for O(1) head-to-head detection
      this.headHash.insert(segs[0].x, segs[0].y, sp.player.id);
    });
    // Rebuild food hash if dirty
    if (this.foodHashDirty) {
      this.foodHash.build(this.foods);
      this.foodHashDirty = false;
    }

    // ══ Phase 1: Move all players ══
    this.players.forEach((sp, id) => {
      if (!sp.player.alive) return;

      if (sp.isBot) {
        // ── BOT: server-side physics with personality speed ───
        this.updateBotAI(sp);

        const mem = sp.botMemory;
        const speedMod = mem ? mem.personalitySpeed : 1.0;

        const lerp = 0.18;
        const dir = sp.player.direction;
        const target = sp.inputDirection;
        dir.x += (target.x - dir.x) * lerp;
        dir.y += (target.y - dir.y) * lerp;
        const nd = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        if (nd > 0) { dir.x /= nd; dir.y /= nd; }

        sp.player.boosting = sp.inputBoosting;
        const baseSpd = sp.player.boosting ? this.config.boostSpeed : this.config.baseSpeed;
        const speed = baseSpd * speedMod;
        if (sp.player.boosting && sp.player.length > 8) {
          sp.player.length -= this.config.boostCost * 0.02;
        }

        const head = sp.player.segments[0];
        let nx = head.x + dir.x * speed;
        let ny = head.y + dir.y * speed;

        // ── Soft wall bounce: flip direction, don't kill ──────
        const wallMin = 15, wallMax = this.config.worldSize - 15;
        if (nx < wallMin) { nx = wallMin; dir.x = Math.abs(dir.x); }
        if (nx > wallMax) { nx = wallMax; dir.x = -Math.abs(dir.x); }
        if (ny < wallMin) { ny = wallMin; dir.y = Math.abs(dir.y); }
        if (ny > wallMax) { ny = wallMax; dir.y = -Math.abs(dir.y); }

        sp.player.segments.unshift({ x: nx, y: ny });
        while (sp.player.segments.length > Math.ceil(sp.player.length)) {
          sp.player.segments.pop();
        }

        // Bot food collision via spatial hash: O(1)
        const botEatR = this.config.segmentSize + this.config.foodSize;
        const eatIdx = this.foodHash.queryNearest(nx, ny, botEatR, this.foods);
        if (eatIdx >= 0) {
          const food = this.foods[eatIdx];
          const dx = nx - food.position.x, dy = ny - food.position.y;
          if (dx * dx + dy * dy < botEatR * botEatR) {
            sp.player.score += food.value;
            sp.player.length = Math.min(sp.player.length + this.config.growthRate, MAX_SNAKE_LENGTH);
            // Replace food and update ID map
            this.foodIdMap.delete(food.id);
            const newFood = this.createFood();
            this.foods[eatIdx] = newFood;
            this.foodIdMap.set(newFood.id, eatIdx);
            this.foodHashDirty = true;
          }
        }

      } else {
        // ── HUMAN: client-authoritative movement ─────────────
        const head = sp.player.segments[0];
        if (!head) return;

        const dir = sp.player.direction;
        const target = sp.inputDirection;
        dir.x += (target.x - dir.x) * 0.25;
        dir.y += (target.y - dir.y) * 0.25;
        const nd2 = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        if (nd2 > 0) { dir.x /= nd2; dir.y /= nd2; }

        sp.player.boosting = sp.inputBoosting;

        const prev = sp.player.segments[1];
        if (!prev || Math.hypot(head.x - prev.x, head.y - prev.y) > this.config.segmentSize * 0.5) {
          sp.player.segments.splice(1, 0, { x: head.x, y: head.y });
        }
        while (sp.player.segments.length > Math.ceil(sp.player.length) + 5) {
          sp.player.segments.pop();
        }

        // Wall boundary check for humans
        if (
          head.x <= 10 || head.x >= this.config.worldSize - 10 ||
          head.y <= 10 || head.y >= this.config.worldSize - 10
        ) {
          this.killPlayer(sp, null, deadPlayers);
          deadPlayers.add(id);
          return;
        }
      }

      sp.player.lastUpdate = now;
    });

    // ══ Phase 2: Collision via spatial hash (O(1) per player) ══
    this.players.forEach((sp, id) => {
      if (!sp.player.alive || deadPlayers.has(id)) return;
      const head = sp.player.segments[0];
      if (!head) return;

      const thick = 1 + Math.log2(1 + Math.max(0, sp.player.length - 10) / 12) * 0.9;
      const myRadius = this.config.segmentSize * thick;

      // Query only nearby cells — O(1) average
      const queryR = myRadius * 4;
      const nearbyIds = this.spatialHash.query(head.x, head.y, queryR);
      this._checked.clear();

      for (const tid of nearbyIds) {
        if (tid === id || this._checked.has(tid) || deadPlayers.has(tid)) continue;
        this._checked.add(tid);

        const other = this.players.get(tid);
        if (!other || !other.player.alive) continue;

        const oThick = 1 + Math.log2(1 + Math.max(0, other.player.length - 10) / 12) * 0.9;
        const oRadius = this.config.segmentSize * oThick;
        const collDistSq = (myRadius * 0.5 + oRadius * 0.8) ** 2;

        // Check specific segments near head
        for (let i = 1; i < other.player.segments.length; i++) {
          const seg = other.player.segments[i];
          const dx = head.x - seg.x;
          const dy = head.y - seg.y;
          if (dx * dx + dy * dy < collDistSq) {
            this.killPlayer(sp, other.player.name, deadPlayers);
            deadPlayers.add(id);
            other.player.score += Math.floor(sp.player.score * 0.3);
            break;
          }
        }
      }

      // Head-to-head check via head spatial hash: O(1)
      if (!deadPlayers.has(id)) {
        const headCollR = this.config.segmentSize * 1.8;
        const headCollRSq = headCollR * headCollR;
        const nearHeads = this.headHash.query(head.x, head.y, headCollR);
        for (const otherId of nearHeads) {
          if (otherId === id || deadPlayers.has(otherId)) continue;
          const other = this.players.get(otherId);
          if (!other || !other.player.alive) continue;
          const otherHead = other.player.segments[0];
          if (!otherHead) continue;
          const hdx = head.x - otherHead.x;
          const hdy = head.y - otherHead.y;
          if (hdx * hdx + hdy * hdy < headCollRSq) {
            if (sp.player.length <= other.player.length) {
              this.killPlayer(sp, other.player.name, deadPlayers);
              deadPlayers.add(id);
            }
            if (!deadPlayers.has(otherId) && other.player.length <= sp.player.length) {
              this.killPlayer(other, sp.player.name, deadPlayers);
              deadPlayers.add(otherId);
            }
          }
        }
      }
    });

    // ══ Phase 3: Handle deaths ══
    deadPlayers.forEach((id) => {
      const sp = this.players.get(id);
      if (sp) {
        this.dropFood(sp.player);
        if (sp.isBot) {
          // Put bot in respawn queue instead of deleting immediately
          this.botRespawnQueue.push({ at: now + 2000 + Math.random() * 3000 });
          this.players.delete(id);
          this._countsDirty = true;
        }
      }
    });

    // ══ Phase 4: Process bot respawn queue (swap-remove to avoid splice) ══
    for (let qi = this.botRespawnQueue.length - 1; qi >= 0; qi--) {
      if (now >= this.botRespawnQueue[qi].at) {
        // Swap with last element and pop — O(1) instead of O(n) splice
        this.botRespawnQueue[qi] = this.botRespawnQueue[this.botRespawnQueue.length - 1];
        this.botRespawnQueue.pop();
        this.spawnBot();
      }
    }

    // ══ Phase 5: Maintain bots every 60 ticks ══
    if (this.tick % 60 === 0) {
      this.maintainBots();
    }

    // ══ Phase 6: Refill food in batches of 50 (avoids GC spike) ══
    const foodTarget = (this.config.foodCount * 0.85) | 0;
    const maxFoods = this.config.foodCount * 2; // Hard cap to prevent unbounded growth
    if (this.foods.length < foodTarget) {
      const batch = Math.min(50, foodTarget - this.foods.length);
      for (let i = 0; i < batch; i++) {
        const food = this.createFood();
        const idx = this.foods.length;
        this.foods.push(food);
        this.foodIdMap.set(food.id, idx);
      }
      this.foodHashDirty = true;
    } else if (this.foods.length > maxFoods) {
      // Trim excess foods (from deaths dropping too many)
      while (this.foods.length > this.config.foodCount) {
        const removed = this.foods.pop()!;
        this.foodIdMap.delete(removed.id);
      }
      this.foodHashDirty = true;
    }
  }

  // ========================
  // Kill & Death
  // ========================

  private killPlayer(sp: ServerPlayer, killedBy: string | null, _deadSet: Set<string>): void {
    sp.player.alive = false;
    this._countsDirty = true;

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
  // Broadcasting (optimized: food spatial hash culling, reduced allocations)
  // ========================

  private broadcast(): void {
    // Broadcast state every other tick (15fps state updates to save bandwidth)
    if (this.tick % 2 !== 0) return;

    const now = Date.now();

    // Pre-build alive players list once (avoids repeated Map iteration)
    const alivePlayers: Array<{ id: string; sp: ServerPlayer }> = [];
    this.players.forEach((sp, id) => {
      if (sp.player.alive && sp.player.segments.length > 0) {
        alivePlayers.push({ id, sp });
      }
    });

    this.players.forEach((sp, currentPlayerId) => {
      if (!sp.ws || sp.ws.readyState !== WebSocket.OPEN || !sp.player.alive) return;

      const head = sp.player.segments[0];
      if (!head) return;

      // Cull players + LOD: send fewer segments for distant snakes
      const playerData: Record<string, any> = {};
      const hx = head.x, hy = head.y;

      for (let ai = 0; ai < alivePlayers.length; ai++) {
        const { id, sp: other } = alivePlayers[ai];
        const otherHead = other.player.segments[0];
        const dx = hx - otherHead.x;
        const dy = hy - otherHead.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > VIEW_RADIUS_SQ) continue;

        const isSelf = id === currentPlayerId;
        const segLen = other.player.segments.length;
        const maxSegs = isSelf
          ? segLen
          : distSq < 640_000  // 800²
            ? segLen
            : distSq < 2_250_000  // 1500²
              ? Math.min(segLen, 80)
              : Math.min(segLen, 30);

        playerData[id] = {
          id: other.player.id,
          name: other.player.name,
          photoURL: other.player.photoURL,
          color: other.player.color,
          segments: maxSegs < segLen ? other.player.segments.slice(0, maxSegs) : other.player.segments,
          direction: other.player.direction,
          score: other.player.score,
          length: other.player.length,
          alive: true,
          boosting: other.player.boosting,
          speed: other.player.speed,
          lastUpdate: other.player.lastUpdate,
        };
      }

      // Cull foods via food spatial hash — O(1) instead of O(n) linear scan
      const nearFoodIdxs = this.foodHash.queryInRange(hx, hy, VIEW_RADIUS, this.foods);
      const nearbyFoods: Food[] = new Array(nearFoodIdxs.length);
      for (let fi = 0; fi < nearFoodIdxs.length; fi++) {
        nearbyFoods[fi] = this.foods[nearFoodIdxs[fi]];
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

    // Varied starting sizes: small / medium / large
    const roll = Math.random();
    let startLength = roll < 0.45 ? 10 + ((Math.random()*20)|0)
                    : roll < 0.80 ? 30 + ((Math.random()*40)|0)
                    : 70 + ((Math.random()*50)|0);

    const player = this.createPlayer(id, name, color, null);
    player.length = startLength;
    player.score = Math.floor(startLength * 2.5 + Math.random() * 60);

    const angle = Math.atan2(player.direction.y, player.direction.x);
    for (let i = player.segments.length; i < startLength; i++) {
      const last = player.segments[player.segments.length - 1];
      player.segments.push({
        x: last.x - Math.cos(angle) * this.config.segmentSize,
        y: last.y - Math.sin(angle) * this.config.segmentSize,
      });
    }

    // Bot personality — unique per bot
    const aggression = 0.2 + Math.random() * 0.8;
    const mem: BotMemory = {
      state: 'explore',
      stateTimer: 0,
      targetFoodIdx: -1,
      targetPlayerId: '',
      exploreAngle: Math.random() * Math.PI * 2,
      exploreTurns: 30 + ((Math.random() * 60) | 0),
      personalityAggression: aggression,
      personalitySpeed: 0.85 + Math.random() * 0.35,
    };

    const sp: ServerPlayer = {
      player,
      ws: null,
      inputDirection: { ...player.direction },
      inputBoosting: false,
      isBot: true,
      lastInputTime: Date.now(),
      botMemory: mem,
    };

    this.players.set(id, sp);
    this._countsDirty = true;
  }

  private maintainBots(): void {
    // Remove dead bots that weren't queued for respawn
    this.players.forEach((sp, id) => {
      if (sp.isBot && !sp.player.alive) this.players.delete(id);
    });
    this._countsDirty = true;

    const aliveBots = Array.from(this.players.values()).filter(p => p.isBot && p.player.alive).length;
    const pendingRespawns = this.botRespawnQueue.length;
    const effective = aliveBots + pendingRespawns;
    const deficit = this.minBots - effective;
    for (let i = 0; i < deficit && this.totalAliveCount + i < this.config.maxPlayers; i++) {
      this.spawnBot();
    }
  }

  private updateBotAI(sp: ServerPlayer): void {
    const head = sp.player.segments[0];
    const mem = sp.botMemory;
    if (!head || !mem) return;

    mem.stateTimer--;
    const ws = this.config.worldSize;

    // ── Phase A: State transition ────────────────────────────
    if (mem.stateTimer <= 0) {
      // Re-evaluate state every N ticks
      mem.stateTimer = 20 + ((Math.random() * 25) | 0);

      // Check danger: is there a large snake nearby? (use head hash — O(1) instead of iterating all)
      let nearestThreatDist = Infinity;
      let nearestThreatDirX = 0;
      let nearestThreatDirY = 0;
      let hasThreat = false;
      const threatR = 500;
      const nearbyHeadIds = this.headHash.query(head.x, head.y, threatR);
      for (let ni = 0; ni < nearbyHeadIds.length; ni++) {
        const otherId = nearbyHeadIds[ni];
        if (otherId === sp.player.id) continue;
        const other = this.players.get(otherId);
        if (!other || !other.player.alive) continue;
        const oh = other.player.segments[0];
        if (!oh) continue;
        const dx = oh.x - head.x;
        const dy = oh.y - head.y;
        const dist2 = dx*dx + dy*dy;
        // Threat if other is bigger and close
        if (other.player.length > sp.player.length * 0.8 && dist2 < threatR*threatR && dist2 < nearestThreatDist) {
          nearestThreatDist = dist2;
          nearestThreatDirX = dx;
          nearestThreatDirY = dy;
          hasThreat = true;
        }
      }

      if (nearestThreatDist < 200*200 && mem.personalityAggression < 0.6) {
        mem.state = 'flee';
        mem.stateTimer = 40;
      } else if (nearestThreatDist < 400*400 && mem.personalityAggression > 0.7 && sp.player.length > 40) {
        // Large, aggressive bot — try to cut off prey
        mem.state = 'ambush';
        mem.stateTimer = 35;
      } else if (Math.random() < 0.12) {
        // Randomly switch to explore to break loops
        mem.state = 'explore';
        mem.exploreAngle = Math.atan2(sp.inputDirection.y, sp.inputDirection.x) + (Math.random()-0.5)*1.2;
        mem.exploreTurns = 25 + ((Math.random()*50)|0);
        mem.stateTimer = mem.exploreTurns;
      } else {
        mem.state = 'hunt';
        mem.stateTimer = 30;
      }

      // Rare: stash away threat direction for flee state
      if (hasThreat) {
        const nd = Math.sqrt(nearestThreatDirX**2 + nearestThreatDirY**2);
        if (nd > 0) { nearestThreatDirX /= nd; nearestThreatDirY /= nd; }
        if (mem.state === 'flee') {
          // Run AWAY from threat
          sp.inputDirection.x = -nearestThreatDirX;
          sp.inputDirection.y = -nearestThreatDirY;
        }
      }
    }

    // ── Phase B: Execute current state ──────────────────────
    const wallMargin = 350;
    const wallStr = 0.3;

    if (mem.state === 'explore') {
      // Walk in explore angle, soft turns
      sp.inputDirection.x += (Math.cos(mem.exploreAngle) - sp.inputDirection.x) * 0.05;
      sp.inputDirection.y += (Math.sin(mem.exploreAngle) - sp.inputDirection.y) * 0.05;
      // Drift explore angle slightly each tick
      mem.exploreAngle += (Math.random() - 0.5) * 0.04;

    } else if (mem.state === 'hunt' || mem.state === 'ambush') {
      // Find nearest food via food spatial hash: O(1)
      const nearIdx = this.foodHash.queryNearest(head.x, head.y, 600, this.foods);
      if (nearIdx >= 0) {
        const f = this.foods[nearIdx];
        const dx = f.position.x - head.x;
        const dy = f.position.y - head.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 0) {
          const steer = dist < 200 ? 0.22 : 0.07;
          sp.inputDirection.x += (dx/dist - sp.inputDirection.x) * steer;
          sp.inputDirection.y += (dy/dist - sp.inputDirection.y) * steer;
        }
      }

      if (mem.state === 'ambush') {
        // Add lateral oscillation to create coiling trap
        const perp = { x: -sp.inputDirection.y, y: sp.inputDirection.x };
        const osc = Math.sin(this.tick * 0.15) * 0.18;
        sp.inputDirection.x += perp.x * osc;
        sp.inputDirection.y += perp.y * osc;
      }

    } else if (mem.state === 'flee') {
      // Already set direction in transition — just maintain it with slight variation
      sp.inputDirection.x += (Math.random()-0.5) * 0.06;
      sp.inputDirection.y += (Math.random()-0.5) * 0.06;
      sp.inputBoosting = true; // Flee at speed!
    }

    // ── Phase C: Safety steering (always applied) ───────────
    // Avoid snake bodies near head (use spatial hash)
    const dangerR = 130 + sp.player.length * 0.4;
    let avoidX = 0, avoidY = 0;
    const nearbyCandidates = this.spatialHash.query(head.x, head.y, dangerR);
    this._seenIds.clear();
    for (const cid of nearbyCandidates) {
      if (cid === sp.player.id || this._seenIds.has(cid)) continue;
      this._seenIds.add(cid);
      const other = this.players.get(cid);
      if (!other || !other.player.alive) continue;
      // Check only a few body segs close to head
      const segsCheck = Math.min(other.player.segments.length, 12);
      for (let i = 0; i < segsCheck; i++) {
        const seg = other.player.segments[i];
        const dx = head.x - seg.x;
        const dy = head.y - seg.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < dangerR && dist > 0) {
          const str = Math.pow((dangerR - dist) / dangerR, 1.5) * 0.35;
          avoidX += (dx/dist) * str;
          avoidY += (dy/dist) * str;
        }
      }
    }
    sp.inputDirection.x += avoidX;
    sp.inputDirection.y += avoidY;

    // Wall avoidance — strong push away from edges
    if (head.x < wallMargin) sp.inputDirection.x += wallStr * Math.pow(1 - head.x/wallMargin, 2);
    if (head.x > ws-wallMargin) sp.inputDirection.x -= wallStr * Math.pow(1 - (ws-head.x)/wallMargin, 2);
    if (head.y < wallMargin) sp.inputDirection.y += wallStr * Math.pow(1 - head.y/wallMargin, 2);
    if (head.y > ws-wallMargin) sp.inputDirection.y -= wallStr * Math.pow(1 - (ws-head.y)/wallMargin, 2);

    // Normalize
    const dl = Math.sqrt(sp.inputDirection.x**2 + sp.inputDirection.y**2);
    if (dl > 0) { sp.inputDirection.x /= dl; sp.inputDirection.y /= dl; }

    // Boosting logic: only boost when in flee state or chasing very close food
    if (mem.state !== 'flee') {
      // Use food spatial hash for O(1) nearest food check
      const nearestIdx = this.foodHash.queryNearest(head.x, head.y, 120, this.foods);
      sp.inputBoosting = nearestIdx >= 0 && sp.player.length > 20 && Math.random() < 0.04;
    }
  }

  // ========================
  // Entity creation helpers
  // ========================

  private createPlayerNearCenter(id: string, name: string, color: string, photoURL: string | null): Player {
    // Spawn within 2500 units of center so players can find each other
    const cx = this.config.worldSize / 2;
    const cy = this.config.worldSize / 2;
    const startX = cx + (Math.random() - 0.5) * 5000;
    const startY = cy + (Math.random() - 0.5) * 5000;
    return this._buildPlayer(id, name, color, photoURL, startX, startY);
  }

  private createPlayer(id: string, name: string, color: string, photoURL: string | null): Player {
    const startX = Math.random() * (this.config.worldSize - 600) + 300;
    const startY = Math.random() * (this.config.worldSize - 600) + 300;
    return this._buildPlayer(id, name, color, photoURL, startX, startY);
  }

  private _buildPlayer(id: string, name: string, color: string, photoURL: string | null, startX: number, startY: number): Player {
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
      id: `f${this.foodIdCounter++}`,
      position: {
        x: Math.random() * (this.config.worldSize - 100) + 50,
        y: Math.random() * (this.config.worldSize - 100) + 50,
      },
      color: FOOD_COLORS[(Math.random() * FOOD_COLORS.length) | 0],
      size: Math.random() * 4 + 4,
      value: ((Math.random() * 3) | 0) + 1,
    };
  }

  private generateFoods(count: number): void {
    this.foods = [];
    this.foodIdMap.clear();
    for (let i = 0; i < count; i++) {
      const food = this.createFood();
      this.foodIdMap.set(food.id, i);
      this.foods.push(food);
    }
  }

  private dropFood(player: Player): void {
    const dropCount = Math.min((player.length / 3) | 0, 20);
    for (let i = 0; i < dropCount; i++) {
      const segIdx = (Math.random() * player.segments.length) | 0;
      const seg = player.segments[segIdx];
      if (seg) {
        const food: Food = {
          id: `fd${this.foodIdCounter++}`,
          position: {
            x: seg.x + (Math.random() - 0.5) * 40,
            y: seg.y + (Math.random() - 0.5) * 40,
          },
          color: player.color,
          size: Math.random() * 4 + 5,
          value: ((Math.random() * 3) | 0) + 2,
        };
        const idx = this.foods.length;
        this.foods.push(food);
        this.foodIdMap.set(food.id, idx);
      }
    }
    this.foodHashDirty = true;
  }
}
