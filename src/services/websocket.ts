// ============================================================
// Bentropy Arena - WebSocket Client v3
// Fallback AI: state-machine bots, spatial hash, 15fps broadcast
// ============================================================

import type { WSMessage, JoinPayload, Player, Food, DevilFruit, Vector2D } from '../types/game';
import { DEFAULT_CONFIG, SNAKE_COLORS, DEVIL_FRUITS } from '../types/game';

type MessageHandler = (msg: WSMessage) => void;

// ── Spatial Hash (client-side, lightweight) ──────────────────
class SpatialHash {
  private cells = new Map<number, string[]>();
  private cs: number;
  constructor(cs: number) { this.cs = cs; }
  private k(cx: number, cy: number) { return ((cx & 0xffff) << 16) | (cy & 0xffff); }
  clear() { this.cells.clear(); }
  insert(x: number, y: number, id: string) {
    const cx = (x / this.cs) | 0, cy = (y / this.cs) | 0;
    const k = this.k(cx, cy);
    let c = this.cells.get(k);
    if (!c) { c = []; this.cells.set(k, c); }
    c.push(id);
  }
  query(x: number, y: number, r: number): string[] {
    const out: string[] = [];
    const minCx = ((x - r) / this.cs) | 0, maxCx = ((x + r) / this.cs) | 0;
    const minCy = ((y - r) / this.cs) | 0, maxCy = ((y + r) / this.cs) | 0;
    for (let cx = minCx; cx <= maxCx; cx++)
      for (let cy = minCy; cy <= maxCy; cy++) {
        const c = this.cells.get(this.k(cx, cy));
        if (c) for (const id of c) out.push(id);
      }
    return out;
  }
}

// ── Food spatial hash: O(1) nearest food for bots ────────────
class FoodSpatialHash {
  private cells = new Map<number, number[]>(); // cellKey → food indices
  private cs: number;
  constructor(cs: number) { this.cs = cs; }
  private k(cx: number, cy: number) { return ((cx & 0xffff) << 16) | (cy & 0xffff); }
  clear() { this.cells.clear(); }
  insert(x: number, y: number, idx: number) {
    const cx = (x / this.cs) | 0, cy = (y / this.cs) | 0;
    const k = this.k(cx, cy);
    let c = this.cells.get(k);
    if (!c) { c = []; this.cells.set(k, c); }
    c.push(idx);
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
          if (!f) continue;
          const dx = f.position.x - x, dy = f.position.y - y;
          const d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; bestIdx = idx; }
        }
      }
    return bestIdx;
  }
}

// ── Bot state machine memory ──────────────────────────────────
type BotState = 'explore' | 'hunt' | 'flee' | 'ambush';
interface BotMemory {
  state: BotState;
  stateTimer: number;
  exploreAngle: number;
  exploreDrift: number;
  aggression: number;   // 0–1
  speedMod: number;     // 0.82–1.18
  tick: number;
}

export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnected = false;
  private isFallbackMode = false;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;

  // Bot simulation
  private bots: Map<string, Player> = new Map();
  private botFoods: Food[] = [];
  private botDevilFruits: DevilFruit[] = [];
  private botInterval: ReturnType<typeof setInterval> | null = null;
  private localPlayerRef: Player | null = null;

  constructor(url?: string) {
    this.url = url || import.meta.env.VITE_WS_URL || '';
    if (import.meta.env.DEV) {
      console.log('[WS] URL:', this.url);
    }
  }

  public connect(joinPayload: JoinPayload): void {
    // No server URL configured → immediate fallback with local bots
    if (!this.url) {
      this.startFallbackMode(joinPayload);
      return;
    }

    // Prevent mixed content (ws:// from https:// page)
    if (window.location.protocol === 'https:' && this.url.startsWith('ws://')) {
      this.startFallbackMode(joinPayload);
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      // Connection timeout: switch to fallback after 5 seconds
      this.connectionTimeout = setTimeout(() => {
        if (!this.isConnected) {
          console.warn('[WS] Connection timeout, switching to fallback mode');
          this.ws?.close();
          this.startFallbackMode(joinPayload);
        }
      }, 5000);

      this.ws.onopen = () => {
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.isFallbackMode = false;
        const joinMsg: WSMessage = { type: 'join', payload: joinPayload, timestamp: Date.now() };
        this.send(joinMsg);
        console.log('[WS] Connected to server');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          this.emit(msg.type, msg);
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };

      this.ws.onclose = (event) => { 
        this.isConnected = false;
        if (!this.isFallbackMode) {
          if (import.meta.env.DEV) {
            console.log('[WS] Disconnected - Code:', event.code);
          }
          this.attemptReconnect(joinPayload);
        }
      };

      this.ws.onerror = () => {
        // onclose will fire afterward
      };
    } catch {
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
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 16000);

    this.reconnectTimer = setTimeout(() => {
      if (!this.isFallbackMode) {
        this.connect(joinPayload);
      }
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
    this.generateBots(this.TARGET_BOTS);
    this.generateFoods(DEFAULT_CONFIG.foodCount);
    this.generateDevilFruits(10);

    // Simulation loop - 30fps
    this.botInterval = setInterval(() => {
      this.updateBots();
      this.emitFallbackState(joinPayload.playerId);
    }, 1000 / 60);
  }

  // ── Bot memory map ────────────────────────────────────────
  private botMem = new Map<string, BotMemory>();
  private spatialHash = new SpatialHash(180);
  private foodHash = new FoodSpatialHash(300);
  private foodHashDirty = true;
  private botRespawnQueue: Array<{ at: number; idx: number }> = [];
  // Reusable Set to avoid per-tick allocation
  private readonly _reusableSeenSet = new Set<string>();
  private botNameCounter = 0;
  private readonly TARGET_BOTS = 15;
  private readonly BOT_NAMES = [
    'Cobra_AI', 'Python_Bot', 'Serpente_X', 'Viper_Pro',
    'Mamba_Zero', 'Anaconda_3', 'King_Snake', 'Naga_Elite',
    'SlitherKing', 'VenomByte', 'CoilMaster', 'FangStrike',
    'ToxicFang', 'ShadowCoil', 'IronScale', 'NightViper',
    'BlazeTail', 'StormFang', 'CyberCobra', 'GhostNaga',
  ];

  private generateBots(count: number): void {
    for (let i = 0; i < count; i++) {
      this.spawnOneBot();
    }
  }

  private spawnOneBot(): void {
    const idx = this.botNameCounter++ % this.BOT_NAMES.length;
    const color = SNAKE_COLORS[idx % SNAKE_COLORS.length];
    const margin = 800;
    const ws = DEFAULT_CONFIG.worldSize;
    const startX = margin + Math.random() * (ws - margin * 2);
    const startY = margin + Math.random() * (ws - margin * 2);
    const angle = Math.random() * Math.PI * 2;

    // Varied sizes
    const sizeRoll = Math.random();
    let baseLength: number;
    if (sizeRoll < 0.4)      baseLength = Math.floor(Math.random() * 16) + 15;
    else if (sizeRoll < 0.8) baseLength = Math.floor(Math.random() * 30) + 32;
    else                     baseLength = Math.floor(Math.random() * 40) + 80;

    const segments: Vector2D[] = [];
    for (let j = 0; j < baseLength; j++) {
      segments.push({
        x: startX - Math.cos(angle) * j * 10,
        y: startY - Math.sin(angle) * j * 10,
      });
    }

    const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const bot: Player = {
      id: botId,
      name: this.BOT_NAMES[idx],
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
      activeAbility: null,
      abilityEndTime: 0,
    };

    this.bots.set(botId, bot);

    // Initialise memory
    this.botMem.set(botId, {
      state: 'explore',
      stateTimer: 0,
      exploreAngle: angle,
      exploreDrift: (Math.random() - 0.5) * 0.04,
      aggression: 0.2 + Math.random() * 0.8,
      speedMod: 0.82 + Math.random() * 0.36,
      tick: 0,
    });
  }

  private generateDevilFruits(count: number): void {
    this.botDevilFruits = [];
    for (let i = 0; i < count; i++) {
      const def = DEVIL_FRUITS[Math.floor(Math.random() * DEVIL_FRUITS.length)];
      this.botDevilFruits.push({
        id: `df_${Date.now()}_${i}`,
        position: {
          x: Math.random() * (DEFAULT_CONFIG.worldSize - 400) + 200,
          y: Math.random() * (DEFAULT_CONFIG.worldSize - 400) + 200,
        },
        ability: def.ability,
        name: def.name,
        color: def.color,
        glowColor: def.glowColor,
        size: 14,
        emoji: def.emoji,
      });
    }
  }

  private generateFoods(count: number): void {
    this.botFoods = [];
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

    for (let i = 0; i < count; i++) {
      // Tiered food: 60% small, 28% medium, 12% large
      const roll = Math.random();
      let size: number, value: number;
      if (roll < 0.60) {
        // Small food — common
        size = 3 + Math.random() * 2;    // 3-5
        value = 1;
      } else if (roll < 0.88) {
        // Medium food — moderate
        size = 5 + Math.random() * 2.5;  // 5-7.5
        value = 2;
      } else {
        // Large food — rare
        size = 7.5 + Math.random() * 3;  // 7.5-10.5
        value = 4;
      }
      this.botFoods.push({
        id: `food_${i}`,
        position: {
          x: Math.random() * (DEFAULT_CONFIG.worldSize - 100) + 50,
          y: Math.random() * (DEFAULT_CONFIG.worldSize - 100) + 50,
        },
        color: colors[Math.floor(Math.random() * colors.length)],
        size,
        value,
      });
    }
  }

  private updateBots(): void {
    const now = Date.now();
    const ws = DEFAULT_CONFIG.worldSize;

    // ── Phase 0: Rebuild spatial hash ────────────────────────
    this.spatialHash.clear();
    this.bots.forEach((b) => {
      if (!b.alive) return;
      const limit = Math.min(b.segments.length, 80);
      for (let i = 1; i < limit; i++) {
        const s = b.segments[i];
        this.spatialHash.insert(s.x, s.y, b.id);
      }
    });
    // Also hash local player body
    if (this.localPlayerRef?.alive) {
      const limit = Math.min(this.localPlayerRef.segments.length, 80);
      for (let i = 1; i < limit; i++) {
        const s = this.localPlayerRef.segments[i];
        this.spatialHash.insert(s.x, s.y, '__player__');
      }
    }

    const deadIds: string[] = [];

    this.bots.forEach((bot) => {
      if (!bot.alive) return;
      const mem = this.botMem.get(bot.id);
      if (!mem) return;

      mem.tick++;
      const head = bot.segments[0];
      const thick = 1 + Math.log2(1 + Math.max(0, bot.length - 10) / 12) * 0.9;
      const radius = DEFAULT_CONFIG.segmentSize * thick;

      // ── Phase A: State evaluation (every ~25 ticks) ────────
      if (mem.stateTimer <= 0) {
        mem.stateTimer = 20 + ((Math.random() * 25) | 0);

        // Check nearby threats via spatial hash
        const nearbyIds = this.spatialHash.query(head.x, head.y, 250);
        let threatSize = 0;
        let hasThreat = false;
        for (const tid of nearbyIds) {
          if (tid === bot.id) continue;
          const other = tid === '__player__'
            ? this.localPlayerRef
            : this.bots.get(tid);
          if (!other || !other.alive) continue;
          if (other.length > bot.length * 1.15) {
            const dx = other.segments[0].x - head.x;
            const dy = other.segments[0].y - head.y;
            if (dx*dx + dy*dy < 220*220) { hasThreat = true; threatSize = other.length; }
          }
        }

        // Check for prey within range
        let hasPrey = false;
        if (mem.aggression > 0.55) {
          this.bots.forEach((other) => {
            if (hasPrey || other.id === bot.id || !other.alive) return;
            if (other.length < bot.length * 0.75) {
              const dx = other.segments[0].x - head.x;
              const dy = other.segments[0].y - head.y;
              if (dx*dx + dy*dy < 300*300) hasPrey = true;
            }
          });
        }

        if (hasThreat) {
          mem.state = 'flee';
        } else if (hasPrey && mem.aggression > 0.6) {
          mem.state = 'ambush';
        } else if (Math.random() < 0.12) {
          mem.state = 'explore';
          mem.exploreAngle = Math.random() * Math.PI * 2;
          mem.exploreDrift = (Math.random() - 0.5) * 0.05;
        } else {
          mem.state = 'hunt';
        }

        void threatSize; // reference to suppress lint
      }
      mem.stateTimer--;

      // ── Phase B: Desired direction from state ───────────────
      let desiredX = bot.direction.x;
      let desiredY = bot.direction.y;

      if (mem.state === 'explore') {
        // Smooth drift – gently steer toward exploreAngle
        mem.exploreAngle += mem.exploreDrift;
        const tDx = Math.cos(mem.exploreAngle);
        const tDy = Math.sin(mem.exploreAngle);
        desiredX += (tDx - desiredX) * 0.06;
        desiredY += (tDy - desiredY) * 0.06;

      } else if (mem.state === 'hunt' || mem.state === 'ambush') {
        // Find nearest food via spatial hash: O(1) average
        if (this.foodHashDirty) {
          this.foodHash.clear();
          for (let fi = 0; fi < this.botFoods.length; fi++) {
            const f = this.botFoods[fi];
            this.foodHash.insert(f.position.x, f.position.y, fi);
          }
          this.foodHashDirty = false;
        }
        const nearFoodIdx = this.foodHash.queryNearest(head.x, head.y, 600, this.botFoods);
        if (nearFoodIdx >= 0) {
          const nf = this.botFoods[nearFoodIdx];
          const fdx = nf.position.x - head.x;
          const fdy = nf.position.y - head.y;
          const fd = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
          const lerpT = mem.state === 'ambush'
            ? 0.13 + mem.aggression * 0.10
            : 0.07 + mem.aggression * 0.12;
          desiredX += (fdx / fd - desiredX) * lerpT;
          desiredY += (fdy / fd - desiredY) * lerpT;
        }

        // Ambush: lateral oscillation
        if (mem.state === 'ambush') {
          const perp = Math.sin(mem.tick * 0.15) * 0.18;
          desiredX += -desiredY * perp;
          desiredY +=  desiredX * perp;
        }

      } else if (mem.state === 'flee') {
        // Move away from the nearest threat
        const nearbyIds = this.spatialHash.query(head.x, head.y, 280);
        let awayX = 0, awayY = 0;
        for (const tid of nearbyIds) {
          if (tid === bot.id) continue;
          const other = tid === '__player__'
            ? this.localPlayerRef
            : this.bots.get(tid);
          if (!other || !other.alive || other.length <= bot.length) continue;
          const oh = other.segments[0];
          const dx = head.x - oh.x, dy = head.y - oh.y;
          const d = Math.sqrt(dx*dx + dy*dy) || 1;
          awayX += dx / d; awayY += dy / d;
        }
        if (awayX !== 0 || awayY !== 0) {
          const al = Math.sqrt(awayX*awayX + awayY*awayY) || 1;
          desiredX += (awayX/al - desiredX) * 0.20;
          desiredY += (awayY/al - desiredY) * 0.20;
        }
        bot.boosting = true;
      }

      // ── Phase C: Safety steering (spatial hash body avoidance) ─
      const dangerR = 110 + radius * 2;
      const nearSegs = this.spatialHash.query(head.x, head.y, dangerR);
      this._reusableSeenSet.clear();
      const seen = this._reusableSeenSet;
      for (const tid of nearSegs) {
        if (tid === bot.id || seen.has(tid)) continue;
        seen.add(tid);
        const segs = tid === '__player__'
          ? this.localPlayerRef?.segments
          : this.bots.get(tid)?.segments;
        if (!segs) continue;
        for (const seg of segs) {
          const dx = head.x - seg.x, dy = head.y - seg.y;
          const d2 = dx*dx + dy*dy;
          if (d2 < dangerR*dangerR && d2 > 0.1) {
            const d = Math.sqrt(d2);
            const f = Math.pow(1 - d/dangerR, 1.5) * 0.30;
            desiredX += (dx/d) * f;
            desiredY += (dy/d) * f;
          }
        }
      }

      // ── Phase D: Wall avoidance (smooth quadratic falloff) ──
      const wallM = 400;
      if (head.x < wallM)              desiredX += Math.pow(1 - head.x/wallM, 2) * 0.25;
      if (head.x > ws - wallM)         desiredX -= Math.pow(1 - (ws-head.x)/wallM, 2) * 0.25;
      if (head.y < wallM)              desiredY += Math.pow(1 - head.y/wallM, 2) * 0.25;
      if (head.y > ws - wallM)         desiredY -= Math.pow(1 - (ws-head.y)/wallM, 2) * 0.25;

      // ── Apply direction with max turn rate ───────────────────
      const maxTurn = 0.14;
      const dx = desiredX - bot.direction.x, dy = desiredY - bot.direction.y;
      const dl = Math.sqrt(dx*dx + dy*dy);
      if (dl > maxTurn) {
        bot.direction.x += (dx/dl) * maxTurn;
        bot.direction.y += (dy/dl) * maxTurn;
      } else {
        bot.direction.x = desiredX;
        bot.direction.y = desiredY;
      }
      const norm = Math.sqrt(bot.direction.x**2 + bot.direction.y**2) || 1;
      bot.direction.x /= norm;
      bot.direction.y /= norm;

      // Boost only while fleeing (and has enough length)
      if (mem.state !== 'flee') bot.boosting = false;
      if (bot.boosting && bot.length <= 12) bot.boosting = false;

      // ── Move ─────────────────────────────────────────────────
      const speed = (bot.boosting ? DEFAULT_CONFIG.boostSpeed : DEFAULT_CONFIG.baseSpeed) * mem.speedMod;
      const newX = Math.max(20, Math.min(ws - 20, head.x + bot.direction.x * speed));
      const newY = Math.max(20, Math.min(ws - 20, head.y + bot.direction.y * speed));

      // Soft wall bounce (flip direction instead of dying)
      if (newX <= 20 || newX >= ws - 20) bot.direction.x *= -1;
      if (newY <= 20 || newY >= ws - 20) bot.direction.y *= -1;

      bot.segments.unshift({ x: newX, y: newY });
      while (bot.segments.length > bot.length) bot.segments.pop();

      // Boost drains length — proportional to size
      if (bot.boosting && bot.length > 12) {
        const drain = DEFAULT_CONFIG.boostCost * (0.6 + bot.length * 0.001);
        bot.length -= drain;
        bot.score = Math.max(0, bot.score - drain);
      }

      // ── Collision: head vs nearby segment ────────────────────
      let botDied = false;
      const ownRadius = radius * 0.5;
      const queryR = radius * 2.5;

      for (const tid of this.spatialHash.query(newX, newY, queryR)) {
        if (tid === bot.id || botDied) continue;
        const segs = tid === '__player__'
          ? this.localPlayerRef?.segments
          : this.bots.get(tid)?.segments;
        if (!segs) continue;
        const pAbility = tid === '__player__' ? this.localPlayerRef?.activeAbility : null;
        if (pAbility === 'phasing' || pAbility === 'invisibility' || pAbility === 'freeze') continue;

        const otherLen = tid === '__player__'
          ? (this.localPlayerRef?.length ?? 0)
          : (this.bots.get(tid)?.length ?? 0);
        const oThick = 1 + Math.log2(1 + Math.max(0, otherLen - 10) / 12) * 0.9;
        const oRadius = DEFAULT_CONFIG.segmentSize * oThick;
        const collDistSq = (ownRadius + oRadius * 0.8) ** 2;

        for (let si = 1; si < segs.length; si++) {
          const seg = segs[si];
          const sdx = newX - seg.x, sdy = newY - seg.y;
          if (sdx*sdx + sdy*sdy < collDistSq) { botDied = true; break; }
        }
      }

      if (botDied) {
        bot.alive = false;
        deadIds.push(bot.id);
        // Drop body as food (tiered sizes based on snake length)
        const spacing = Math.max(1, Math.floor(bot.segments.length / 60));
        for (let si = 0; si < bot.segments.length; si += spacing) {
          const seg = bot.segments[si];
          this.botFoods.push({
            id: `food_drop_${now}_${si}`,
            position: { x: seg.x + (Math.random()-0.5)*12, y: seg.y + (Math.random()-0.5)*12 },
            color: bot.color, size: 5 + Math.random()*3, value: 2,
          });
        }
        // Schedule respawn
        this.botRespawnQueue.push({ at: now + 3000 + Math.random() * 4000, idx: this.botNameCounter });
        return;
      }

      // ── Eat food ──────────────────────────────────────────────
      const eatR = radius * 1.6;
      const eatR2 = eatR * eatR;
      for (let fi = this.botFoods.length - 1; fi >= 0; fi--) {
        const f = this.botFoods[fi];
        const fdx = newX - f.position.x, fdy = newY - f.position.y;
        if (fdx*fdx + fdy*fdy < eatR2) {
          bot.score += f.value;
          // Growth proportional to food value with diminishing returns
          const growthDiminish = 1 / (1 + Math.max(0, bot.length - 30) * 0.003);
          bot.length += f.value * DEFAULT_CONFIG.growthRate * growthDiminish;
          // Replace food at a new random position (tiered)
          this.botFoods[fi] = this.spawnOneTieredFood(`food_r_${now}_${fi}`);
          this.foodHashDirty = true;
          break;
        }
      }

      // ── Eat devil fruits ──────────────────────────────────────
      for (let fi = this.botDevilFruits.length - 1; fi >= 0; fi--) {
        const fruit = this.botDevilFruits[fi];
        const fdx = newX - fruit.position.x, fdy = newY - fruit.position.y;
        if (fdx*fdx + fdy*fdy < 28*28) {
          const def = DEVIL_FRUITS.find(d => d.ability === fruit.ability);
          if (def) {
            if (def.ability === 'growth') { bot.length += 50; bot.score += 50; }
            else { bot.activeAbility = def.ability; bot.abilityEndTime = now + def.duration*1000; }
          }
          this.botDevilFruits.splice(fi, 1);
          setTimeout(() => this.spawnOneDevilFruit(), 15000 + Math.random()*15000);
          break;
        }
      }

      // Expire ability
      if (bot.activeAbility && bot.abilityEndTime > 0 && now > bot.abilityEndTime) {
        bot.activeAbility = null; bot.abilityEndTime = 0;
      }

      bot.lastUpdate = now;
    });

    // ── Process dead bots ─────────────────────────────────────
    if (deadIds.length > 0) {
      for (const id of deadIds) {
        this.botMem.delete(id);
        this.bots.delete(id);
      }
      this.foodHashDirty = true;
    }

    // ── Process respawn queue ─────────────────────────────────
    for (let qi = this.botRespawnQueue.length - 1; qi >= 0; qi--) {
      if (now >= this.botRespawnQueue[qi].at) {
        this.botRespawnQueue.splice(qi, 1);
        this.spawnOneBot();
      }
    }

    // ── Maintain stable TARGET_BOTS pool ─────────────────────
    const alive = Array.from(this.bots.values()).filter(b => b.alive).length;
    const pending = this.botRespawnQueue.length;
    const deficit = this.TARGET_BOTS - alive - pending;
    if (deficit > 0) {
      for (let i = 0; i < deficit; i++) {
        this.botRespawnQueue.push({ at: now + 1000 + Math.random()*2000, idx: this.botNameCounter });
      }
    }
  }

  // ── Suppress unused-variable lint error ──────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars


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
        devilFruits: this.botDevilFruits,
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

  public updateLocalPlayerRef(player: Player | null): void {
    this.localPlayerRef = player;
  }

  public dropPlayerFood(player: Player): void {
    // Drop the player's entire body as food on the arena (richer drops for bigger snakes)
    const spacing = Math.max(1, Math.floor(player.segments.length / 60));
    for (let i = 0; i < player.segments.length; i += spacing) {
      const seg = player.segments[i];
      if (seg) {
        this.botFoods.push({
          id: `food_pdrop_${Date.now()}_${i}`,
          position: { x: seg.x + (Math.random() - 0.5) * 10, y: seg.y + (Math.random() - 0.5) * 10 },
          color: player.color,
          size: 5 + Math.random() * 3,
          value: 2,
        });
      }
    }
  }

  private spawnOneDevilFruit(): void {
    const def = DEVIL_FRUITS[Math.floor(Math.random() * DEVIL_FRUITS.length)];
    this.botDevilFruits.push({
      id: `df_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      position: {
        x: Math.random() * (DEFAULT_CONFIG.worldSize - 400) + 200,
        y: Math.random() * (DEFAULT_CONFIG.worldSize - 400) + 200,
      },
      ability: def.ability,
      name: def.name,
      color: def.color,
      glowColor: def.glowColor,
      size: 14,
      emoji: def.emoji,
    });
  }

  public removeFallbackDevilFruit(fruitId: string): void {
    const idx = this.botDevilFruits.findIndex(f => f.id === fruitId);
    if (idx !== -1) {
      this.botDevilFruits.splice(idx, 1);
      // Respawn a new one after 15-30 seconds
      setTimeout(() => this.spawnOneDevilFruit(), 15000 + Math.random() * 15000);
    }
  }

  public removeFallbackFood(foodId: string): void {
    const idx = this.botFoods.findIndex(f => f.id === foodId);
    if (idx !== -1) {
      this.botFoods[idx] = this.spawnOneTieredFood(`food_r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    }
  }

  /** Spawn a single tiered food item (60% small, 28% medium, 12% large) */
  private spawnOneTieredFood(id: string): Food {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
    const roll = Math.random();
    let size: number, value: number;
    if (roll < 0.60) {
      size = 3 + Math.random() * 2;
      value = 1;
    } else if (roll < 0.88) {
      size = 5 + Math.random() * 2.5;
      value = 2;
    } else {
      size = 7.5 + Math.random() * 3;
      value = 4;
    }
    return {
      id,
      position: {
        x: Math.random() * (DEFAULT_CONFIG.worldSize - 100) + 50,
        y: Math.random() * (DEFAULT_CONFIG.worldSize - 100) + 50,
      },
      color: colors[Math.floor(Math.random() * colors.length)],
      size,
      value,
    };
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    if (this.botInterval) {
      clearInterval(this.botInterval);
    }
    this.bots.clear();
    this.botFoods = [];
    this.botDevilFruits = [];
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
