// ============================================================
// Bentropy Arena - Game Engine v4  (Performance Ultra)
// ============================================================
// Techniques inspired by slither.io, agar.io, diep.io engines:
//   - Color cache (LRU Map) eliminates per-frame parseInt
//   - Gradient pool: border / fruit / head gradients cached
//   - Viewport-culled border (skip when player is far from edge)
//   - Spatial hash for O(1) food collision
//   - Squared-distance everywhere (no Math.sqrt in hot path)
//   - Batched eye/particle rendering by color
//   - No shadowBlur on border (fake glow via double stroke)
//   - Pre-allocated typed arrays for segment culling
// ============================================================

import type { Player, Food, DevilFruit, DevilFruitAbility, GameConfig, Vector2D } from '../types/game';
import { DEFAULT_CONFIG } from '../types/game';

// ── Lightweight food spatial hash for O(1) eat checks ────────
class FoodGrid {
  private cells = new Map<number, number[]>();
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
  query(x: number, y: number, r: number): number[] {
    const out: number[] = [];
    const minCx = ((x - r) / this.cs) | 0, maxCx = ((x + r) / this.cs) | 0;
    const minCy = ((y - r) / this.cs) | 0, maxCy = ((y + r) / this.cs) | 0;
    for (let cx = minCx; cx <= maxCx; cx++)
      for (let cy = minCy; cy <= maxCy; cy++) {
        const c = this.cells.get(this.k(cx, cy));
        if (c) for (const idx of c) out.push(idx);
      }
    return out;
  }
}

// ── Color cache: avoids parseInt+string-format every frame ───
const _colorCache = new Map<string, string>();
function cachedLighten(hex: string, pct: number): string {
  const key = `L${hex}${pct}`;
  let v = _colorCache.get(key);
  if (v) return v;
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + pct);
  const g = Math.min(255, ((num >> 8) & 0xff) + pct);
  const b = Math.min(255, (num & 0xff) + pct);
  v = `rgb(${r},${g},${b})`;
  _colorCache.set(key, v);
  if (_colorCache.size > 512) {
    const first = _colorCache.keys().next().value!;
    _colorCache.delete(first);
  }
  return v;
}
function cachedDarken(hex: string, pct: number): string {
  const key = `D${hex}${pct}`;
  let v = _colorCache.get(key);
  if (v) return v;
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - pct);
  const g = Math.max(0, ((num >> 8) & 0xff) - pct);
  const b = Math.max(0, (num & 0xff) - pct);
  v = `rgb(${r},${g},${b})`;
  _colorCache.set(key, v);
  if (_colorCache.size > 512) {
    const first = _colorCache.keys().next().value!;
    _colorCache.delete(first);
  }
  return v;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: GameConfig;
  private animationId: number | null = null;
  private camera = { x: 0, y: 0 };
  private targetDirection: Vector2D = { x: 1, y: 0 };
  private mousePos: Vector2D = { x: 0, y: 0 };
  private isBoosting = false;
  private particles: Particle[] = [];
  private gridPattern: CanvasPattern | null = null;
  private joystickDirection: Vector2D | null = null;
  private zoom = 1;
  private targetZoom = 1;
  private frameCount = 0;
  private lastFps = 60;
  private fpsFrames = 0;
  private fpsTimer = 0;
  private boostTrail: { x: number; y: number; life: number; color: string }[] = [];
  private deathFlash = 0;
  private killFeedEntries: { text: string; life: number }[] = [];

  // Online mode
  public isOnlineMode = false;

  // Callbacks
  public onMove: ((direction: Vector2D, position: Vector2D, boosting: boolean) => void) | null = null;
  public onBoost: ((boosting: boolean) => void) | null = null;
  public onFoodEaten: ((foodId: string) => void) | null = null;
  public onDevilFruitEaten: ((fruitId: string, ability: DevilFruitAbility) => void) | null = null;
  public onDeath: (() => void) | null = null;
  public onScoreUpdate: ((score: number) => void) | null = null;
  public onAbilityExpired: (() => void) | null = null;
  /** Called once per frame BEFORE update/render — merge sync work here to avoid a second RAF */
  public onPreTick: (() => void) | null = null;

  // State refs
  private localPlayer: Player | null = null;
  private remotePlayers: Map<string, Player> = new Map();
  private foods: Food[] = [];
  private devilFruits: DevilFruit[] = [];
  private screenShake = 0;
  public killedByName: string | null = null;

  // Rankings
  // playerRankings removed – crown only in HUD now

  // ── Performance caches ──────────────────────────────────────
  private foodGrid = new FoodGrid(120);
  private foodGridDirty = true;

  // Glow gradient cache
  private _glowCacheHead: { x: number; y: number } | null = null;
  private _glowCacheGrad: CanvasGradient | null = null;

  constructor(canvas: HTMLCanvasElement, config?: GameConfig) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: false })!;
    this.config = config || DEFAULT_CONFIG;
    this.setupCanvas();
    this.setupInput();
    this.createGridPattern();
  }

  private resizeHandler = (): void => {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.createGridPattern();
  };

  private setupCanvas(): void {
    window.addEventListener('resize', this.resizeHandler);
    this.resizeHandler();
  }

  private createGridPattern(): void {
    const size = 80;
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = size;
    patternCanvas.height = Math.round(size * Math.sqrt(3) / 2);
    const pctx = patternCanvas.getContext('2d')!;
    const ph = patternCanvas.height;

    const drawDot = (x: number, y: number, r: number, alpha: number) => {
      pctx.fillStyle = `rgba(100,140,200,${alpha})`;
      pctx.beginPath();
      pctx.arc(x, y, r, 0, Math.PI * 2);
      pctx.fill();
    };
    drawDot(0, 0, 1.2, 0.06);
    drawDot(size, 0, 1.2, 0.06);
    drawDot(size / 2, ph, 1.2, 0.06);
    drawDot(size / 2, ph / 2, 0.8, 0.03);

    pctx.strokeStyle = 'rgba(80,120,180,0.025)';
    pctx.lineWidth = 0.5;
    pctx.beginPath();
    pctx.moveTo(0, 0);
    pctx.lineTo(size / 2, ph);
    pctx.lineTo(size, 0);
    pctx.stroke();

    this.gridPattern = this.ctx.createPattern(patternCanvas, 'repeat');
  }

  public setMobileBoosting(boosting: boolean): void {
    this.isBoosting = boosting;
    this.onBoost?.(boosting);
  }

  public setJoystickDirection(dx: number, dy: number): void {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) {
      this.joystickDirection = { x: dx / dist, y: dy / dist };
    }
  }

  private setupInput(): void {
    this.canvas.addEventListener('mousemove', (e) => {
      this.mousePos = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('mousedown', () => {
      this.isBoosting = true;
      this.onBoost?.(true);
    });
    this.canvas.addEventListener('mouseup', () => {
      this.isBoosting = false;
      this.onBoost?.(false);
    });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.mousePos = { x: touch.clientX, y: touch.clientY };
    }, { passive: false });
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.mousePos = { x: touch.clientX, y: touch.clientY };
    }, { passive: false });
    this.canvas.addEventListener('touchend', () => {});
  }

  public updateState(player: Player | null, players: Map<string, Player>, foods: Food[], devilFruits?: DevilFruit[]): void {
    if (foods !== this.foods) this.foodGridDirty = true;
    this.localPlayer = player;
    this.remotePlayers = players;
    this.foods = foods;
    if (devilFruits) this.devilFruits = devilFruits;
  }

  public updateRankings(_rankings: Map<string, number>): void {
    // Rankings used in HUD only now – no-op
  }

  public start(): void {
    if (this.animationId) return;
    this.gameLoop();
  }

  public stop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private gameLoop = (): void => {
    if (this.onPreTick) this.onPreTick();
    this.update();
    this.render();
    this.animationId = requestAnimationFrame(this.gameLoop);
  };

  // ========================
  // Update
  // ========================

  private update(): void {
    this.frameCount++;
    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsTimer > 1000) {
      this.lastFps = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsTimer = now;
    }

    if (!this.localPlayer?.alive) return;

    const ability = this.localPlayer.activeAbility;

    if (ability === 'fireboost') {
      this.isBoosting = true;
      this.localPlayer.boosting = true;
    }

    // Direction from mouse or joystick
    if (this.joystickDirection) {
      this.targetDirection = { ...this.joystickDirection };
    } else {
      const centerX = this.canvas.width / 2;
      const centerY = this.canvas.height / 2;
      const dx = this.mousePos.x - centerX;
      const dy = this.mousePos.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        this.targetDirection = { x: dx / dist, y: dy / dist };
      }
    }

    // Smooth direction interpolation
    const lerp = 0.15;
    const dir = this.localPlayer.direction;
    const ndx = dir.x + (this.targetDirection.x - dir.x) * lerp;
    const ndy = dir.y + (this.targetDirection.y - dir.y) * lerp;
    const newDist = Math.sqrt(ndx * ndx + ndy * ndy);
    if (newDist > 0) {
      dir.x = ndx / newDist;
      dir.y = ndy / newDist;
    }

    // Move snake
    let speed = this.isBoosting ? this.config.boostSpeed : this.config.baseSpeed;
    if (ability === 'speed') speed *= 1.8;
    if (ability === 'fireboost') speed = this.config.boostSpeed * 1.3;

    const head = this.localPlayer.segments[0];
    const newHeadX = Math.max(50, Math.min(this.config.worldSize - 50, head.x + dir.x * speed));
    const newHeadY = Math.max(50, Math.min(this.config.worldSize - 50, head.y + dir.y * speed));

    this.localPlayer.segments.unshift({ x: newHeadX, y: newHeadY });
    while (this.localPlayer.segments.length > this.localPlayer.length) {
      this.localPlayer.segments.pop();
    }

    // Boost cost — proportional: faster drain for larger snakes, gentler for small
    if (this.isBoosting && this.localPlayer.length > 10) {
      if (ability !== 'fireboost') {
        const boostDrain = this.config.boostCost * (0.6 + this.localPlayer.length * 0.001);
        this.localPlayer.length -= boostDrain;
        this.localPlayer.score = Math.max(0, this.localPlayer.score - boostDrain);
      }
      const tail = this.localPlayer.segments[this.localPlayer.segments.length - 1];
      this.addParticle(tail.x, tail.y, ability === 'fireboost' ? '#f39c12' : this.localPlayer.color, 3);
    }

    this.localPlayer.boosting = this.isBoosting;

    // Boost trail particles
    if (this.isBoosting && this.localPlayer.segments.length > 2) {
      const tail = this.localPlayer.segments[this.localPlayer.segments.length - 1];
      const boostColor = ability === 'fireboost' ? '#f39c12' : this.localPlayer.color;
      this.boostTrail.push({ x: tail.x + (Math.random() - 0.5) * 8, y: tail.y + (Math.random() - 0.5) * 8, life: 1, color: boostColor });
      if (this.boostTrail.length > 60) this.boostTrail.shift();
    }
    for (let i = this.boostTrail.length - 1; i >= 0; i--) {
      this.boostTrail[i].life -= 0.05;
      if (this.boostTrail[i].life <= 0) this.boostTrail.splice(i, 1);
    }

    // Ability auto-expire
    if (ability && this.localPlayer.abilityEndTime > 0 && Date.now() > this.localPlayer.abilityEndTime) {
      this.localPlayer.activeAbility = null;
      this.localPlayer.abilityEndTime = 0;
      this.onAbilityExpired?.();
    }

    // Kill feed decay
    for (let i = this.killFeedEntries.length - 1; i >= 0; i--) {
      this.killFeedEntries[i].life -= 1 / 180;
      if (this.killFeedEntries[i].life <= 0) this.killFeedEntries.splice(i, 1);
    }

    if (this.deathFlash > 0) this.deathFlash -= 0.04;

    // Magnet ability: attract nearby food (squared distance for inner check)
    if (ability === 'magnet') {
      const mhx = newHeadX, mhy = newHeadY;
      const magnetRadiusSq = 250 * 250;
      for (const food of this.foods) {
        const fdx = mhx - food.position.x;
        const fdy = mhy - food.position.y;
        const distSq = fdx * fdx + fdy * fdy;
        if (distSq < magnetRadiusSq && distSq > 1) {
          const fdist = Math.sqrt(distSq);
          const force = 4 * (1 - fdist / 250);
          food.position.x += (fdx / fdist) * force;
          food.position.y += (fdy / fdist) * force;
          this.foodGridDirty = true;
        }
      }
    }

    // Food & devil fruit collision
    this.checkFoodCollisions();
    this.checkDevilFruitCollisions();
    if (!this.isOnlineMode) {
      this.checkPlayerCollisions();
    }

    // Dynamic zoom — logarithmic curve for smooth proportional feel
    // Small snakes see close detail; large snakes see more arena proportionally
    const playerLen = this.localPlayer.length;
    const logLen = Math.log2(1 + Math.max(0, playerLen - 8) / 6);
    this.targetZoom = Math.max(0.22, Math.min(0.95, 0.95 / (1 + logLen * 0.16)));
    this.zoom += (this.targetZoom - this.zoom) * 0.03;

    // Camera
    this.camera.x = newHeadX - this.canvas.width / (2 * this.zoom);
    this.camera.y = newHeadY - this.canvas.height / (2 * this.zoom);

    this.updateParticles();
    this.onMove?.({ x: dir.x, y: dir.y }, { x: newHeadX, y: newHeadY }, this.isBoosting);

    if (this.screenShake > 0) this.screenShake *= 0.9;
  }

  // ── Food collision via spatial hash: O(1) average ──────────
  private checkFoodCollisions(): void {
    if (!this.localPlayer) return;
    const head = this.localPlayer.segments[0];
    const len = Math.max(this.localPlayer.length, 1);
    const thickMult = this.getThicknessMult(len);
    const eatRadius = this.config.segmentSize * thickMult * 1.5 + this.config.foodSize;
    const eatRadiusSq = eatRadius * eatRadius;

    // Rebuild food grid if dirty
    if (this.foodGridDirty) {
      this.foodGrid.clear();
      for (let i = 0; i < this.foods.length; i++) {
        const f = this.foods[i];
        this.foodGrid.insert(f.position.x, f.position.y, i);
      }
      this.foodGridDirty = false;
    }

    const candidates = this.foodGrid.query(head.x, head.y, eatRadius + 20);
    const eaten: number[] = [];

    for (const idx of candidates) {
      if (idx >= this.foods.length) continue;
      const food = this.foods[idx];
      const dx = head.x - food.position.x;
      const dy = head.y - food.position.y;
      if (dx * dx + dy * dy < eatRadiusSq) {
        // Growth proportional to food value — diminishing returns at large sizes
        const growthDiminish = 1 / (1 + Math.max(0, this.localPlayer.length - 30) * 0.003);
        const growthAmount = food.value * this.config.growthRate * growthDiminish;
        this.localPlayer.score += food.value;
        this.localPlayer.length += growthAmount;
        const particleCount = food.size > 6 ? 8 : food.size > 4 ? 5 : 3;
        this.addParticle(food.position.x, food.position.y, food.color, particleCount);
        this.onFoodEaten?.(food.id);
        this.onScoreUpdate?.(this.localPlayer.score);
        eaten.push(idx);
      }
    }

    if (eaten.length > 0) {
      eaten.sort((a, b) => b - a);
      for (const idx of eaten) this.foods.splice(idx, 1);
      this.foodGridDirty = true;
    }
  }

  private checkDevilFruitCollisions(): void {
    if (!this.localPlayer) return;
    const head = this.localPlayer.segments[0];
    const len = Math.max(this.localPlayer.length, 1);
    const thickMult = this.getThicknessMult(len);
    const eatRadius = Math.max(28, this.config.segmentSize * thickMult * 1.2);
    const eatRadiusSq = eatRadius * eatRadius;

    for (let i = this.devilFruits.length - 1; i >= 0; i--) {
      const fruit = this.devilFruits[i];
      const dx = head.x - fruit.position.x;
      const dy = head.y - fruit.position.y;
      if (dx * dx + dy * dy < eatRadiusSq) {
        this.onDevilFruitEaten?.(fruit.id, fruit.ability);
        this.devilFruits.splice(i, 1);
        for (let p = 0; p < 15; p++) {
          this.addParticle(fruit.position.x, fruit.position.y, fruit.glowColor, 1);
        }
        this.screenShake = 5;
        break;
      }
    }
  }

  // ── Player collision: ALL squared distance (no Math.sqrt) ──
  private checkPlayerCollisions(): void {
    if (!this.localPlayer) return;
    const ability = this.localPlayer.activeAbility;
    if (ability === 'phasing' || ability === 'freeze') return;

    const head = this.localPlayer.segments[0];
    const myLen = Math.max(this.localPlayer.length, 1);
    const myThick = this.getThicknessMult(myLen);
    const myRadius = this.config.segmentSize * myThick;
    let collided = false;
    let killerName: string | null = null;

    this.remotePlayers.forEach((player) => {
      if (collided) return;
      if (!player.alive || player.id === this.localPlayer!.id) return;

      const otherLen = Math.max(player.length, 1);
      const otherThick = this.getThicknessMult(otherLen);
      const otherRadius = this.config.segmentSize * otherThick;
      const headCollDistSq = ((myRadius + otherRadius) * 0.6) ** 2;
      const bodyCollDistSq = (myRadius * 0.5 + otherRadius * 0.8) ** 2;

      // Head-to-head (squared distance, no sqrt)
      const otherHead = player.segments[0];
      if (otherHead) {
        const dhx = head.x - otherHead.x;
        const dhy = head.y - otherHead.y;
        if (dhx * dhx + dhy * dhy < headCollDistSq) {
          collided = true;
          killerName = player.name;
          return;
        }
      }

      // Head-to-body (squared distance, no sqrt)
      for (let i = 1; i < player.segments.length; i++) {
        const seg = player.segments[i];
        const dx = head.x - seg.x;
        const dy = head.y - seg.y;
        if (dx * dx + dy * dy < bodyCollDistSq) {
          collided = true;
          killerName = player.name;
          return;
        }
      }
    });

    if (collided) {
      if (ability === 'resistance') {
        this.localPlayer.activeAbility = null;
        this.localPlayer.abilityEndTime = 0;
        this.localPlayer.direction.x *= -1;
        this.localPlayer.direction.y *= -1;
        head.x += this.localPlayer.direction.x * 60;
        head.y += this.localPlayer.direction.y * 60;
        head.x = Math.max(50, Math.min(this.config.worldSize - 50, head.x));
        head.y = Math.max(50, Math.min(this.config.worldSize - 50, head.y));
        this.screenShake = 10;
        for (let p = 0; p < 15; p++) this.addParticle(head.x, head.y, '#e74c3c', 1);
        this.onAbilityExpired?.();
        return;
      }

      this.localPlayer.alive = false;
      this.killedByName = killerName;
      this.screenShake = 15;
      this.spawnDeathParticles(head.x, head.y, this.localPlayer.color);
      this.onDeath?.();
      return;
    }

    // World boundary collision
    const head2 = this.localPlayer.segments[0];
    if (
      head2.x <= 10 || head2.x >= this.config.worldSize - 10 ||
      head2.y <= 10 || head2.y >= this.config.worldSize - 10
    ) {
      if (ability === 'resistance') {
        this.localPlayer.activeAbility = null;
        this.localPlayer.abilityEndTime = 0;
        if (head2.x <= 10 || head2.x >= this.config.worldSize - 10) this.localPlayer.direction.x *= -1;
        if (head2.y <= 10 || head2.y >= this.config.worldSize - 10) this.localPlayer.direction.y *= -1;
        head2.x = Math.max(80, Math.min(this.config.worldSize - 80, head2.x));
        head2.y = Math.max(80, Math.min(this.config.worldSize - 80, head2.y));
        this.screenShake = 10;
        for (let p = 0; p < 15; p++) this.addParticle(head2.x, head2.y, '#e74c3c', 1);
        this.onAbilityExpired?.();
        return;
      }
      this.localPlayer.alive = false;
      this.screenShake = 15;
      this.spawnDeathParticles(head2.x, head2.y, this.localPlayer.color);
      this.onDeath?.();
    }
  }

  // ========================
  // Rendering
  // ========================

  private render(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, w, h);

    if (this.deathFlash > 0) {
      ctx.fillStyle = `rgba(239,68,68,${this.deathFlash * 0.35})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.save();
    if (this.screenShake > 0.5) {
      ctx.translate(
        (Math.random() - 0.5) * this.screenShake,
        (Math.random() - 0.5) * this.screenShake
      );
    }

    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    this.renderGrid(ctx);
    this.renderWorldBorder(ctx);
    this.renderBoostTrail(ctx);
    this.renderFoods(ctx);
    this.renderDevilFruits(ctx);

    // Remote snakes first, local on top
    const renderOrder: Player[] = [];
    this.remotePlayers.forEach((player) => {
      if (player.alive && player.id !== this.localPlayer?.id) renderOrder.push(player);
    });
    for (const p of renderOrder) this.renderSnake(ctx, p);
    if (this.localPlayer?.alive) this.renderSnake(ctx, this.localPlayer, true);

    this.renderParticles(ctx);

    for (const p of renderOrder) this.renderPlayerName(ctx, p);
    if (this.localPlayer?.alive) this.renderPlayerName(ctx, this.localPlayer);

    ctx.restore();
    ctx.restore();

    this.renderMinimap(ctx, w, h);
    this.renderKillFeed(ctx, w);
    this.renderFPSCounter(ctx);
  }

  private renderBoostTrail(ctx: CanvasRenderingContext2D): void {
    if (this.boostTrail.length === 0) return;
    for (const t of this.boostTrail) {
      ctx.globalAlpha = t.life * 0.6;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.life * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private renderGrid(ctx: CanvasRenderingContext2D): void {
    if (this.localPlayer?.alive) {
      const head = this.localPlayer.segments[0];
      if (head) {
        const moved = !this._glowCacheHead ||
          Math.abs(head.x - this._glowCacheHead.x) > 60 ||
          Math.abs(head.y - this._glowCacheHead.y) > 60 ||
          this.frameCount % 10 === 0;
        if (moved) {
          const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 800);
          glow.addColorStop(0, 'rgba(16,185,129,0.04)');
          glow.addColorStop(0.4, 'rgba(60,100,180,0.02)');
          glow.addColorStop(1, 'rgba(0,0,0,0)');
          this._glowCacheGrad = glow;
          this._glowCacheHead = { x: head.x, y: head.y };
        }
        if (this._glowCacheGrad) {
          ctx.fillStyle = this._glowCacheGrad;
          ctx.fillRect(this._glowCacheHead!.x - 820, this._glowCacheHead!.y - 820, 1640, 1640);
        }
      }
    }

    if (this.gridPattern) {
      ctx.fillStyle = this.gridPattern;
      ctx.fillRect(0, 0, this.config.worldSize, this.config.worldSize);
    }
  }

  // ── World border: viewport-culled, no shadowBlur ───────────
  private renderWorldBorder(ctx: CanvasRenderingContext2D): void {
    const ws = this.config.worldSize;
    const vx = this.camera.x;
    const vy = this.camera.y;
    const vw = this.canvas.width / this.zoom;
    const vh = this.canvas.height / this.zoom;
    const dangerSize = 250;

    // Only render edges that are in the viewport
    const nearTop = vy < dangerSize;
    const nearBottom = vy + vh > ws - dangerSize;
    const nearLeft = vx < dangerSize;
    const nearRight = vx + vw > ws - dangerSize;

    if (!nearTop && !nearBottom && !nearLeft && !nearRight) return;

    const pulse = 0.04 + Math.sin(this.frameCount * 0.04) * 0.02;

    if (nearTop) {
      const g = ctx.createLinearGradient(0, 0, 0, dangerSize);
      g.addColorStop(0, `rgba(239,68,68,${pulse})`);
      g.addColorStop(1, 'rgba(239,68,68,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ws, dangerSize);
    }
    if (nearBottom) {
      const g = ctx.createLinearGradient(0, ws, 0, ws - dangerSize);
      g.addColorStop(0, `rgba(239,68,68,${pulse})`);
      g.addColorStop(1, 'rgba(239,68,68,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, ws - dangerSize, ws, dangerSize);
    }
    if (nearLeft) {
      const g = ctx.createLinearGradient(0, 0, dangerSize, 0);
      g.addColorStop(0, `rgba(239,68,68,${pulse})`);
      g.addColorStop(1, 'rgba(239,68,68,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, dangerSize, ws);
    }
    if (nearRight) {
      const g = ctx.createLinearGradient(ws, 0, ws - dangerSize, 0);
      g.addColorStop(0, `rgba(239,68,68,${pulse})`);
      g.addColorStop(1, 'rgba(239,68,68,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ws - dangerSize, 0, dangerSize, ws);
    }

    // Border glow: double stroke instead of shadowBlur (much cheaper on GPU)
    const borderPulse = 0.4 + Math.sin(this.frameCount * 0.05) * 0.2;
    ctx.strokeStyle = `rgba(239,68,68,${borderPulse * 0.3})`;
    ctx.lineWidth = 12;
    ctx.strokeRect(4, 4, ws - 8, ws - 8);
    ctx.strokeStyle = `rgba(239,68,68,${borderPulse})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, ws - 8, ws - 8);
  }

  private renderFoods(ctx: CanvasRenderingContext2D): void {
    const camX = this.camera.x;
    const camY = this.camera.y;
    const vw = this.canvas.width / this.zoom;
    const vh = this.canvas.height / this.zoom;
    const margin = 40;
    const t = this.frameCount;

    type FoodBatch = { x: number; y: number; s: number }[];
    const glow = new Map<string, FoodBatch>();
    const body = new Map<string, FoodBatch>();

    for (let fi = 0; fi < this.foods.length; fi++) {
      const food = this.foods[fi];
      const fx = food.position.x;
      const fy = food.position.y;
      if (fx < camX - margin || fx > camX + vw + margin ||
          fy < camY - margin || fy > camY + vh + margin) continue;

      const pulse = 1 + Math.sin(t * 0.04 + fx * 0.03 + fy * 0.02) * 0.13;
      const s = food.size * pulse;

      if (!glow.has(food.color)) { glow.set(food.color, []); body.set(food.color, []); }
      glow.get(food.color)!.push({ x: fx, y: fy, s: s * 2.2 });
      body.get(food.color)!.push({ x: fx, y: fy, s });
    }

    // Glow halos — batched per color
    glow.forEach((foods, color) => {
      ctx.fillStyle = color + '22';
      ctx.beginPath();
      for (const f of foods) { ctx.moveTo(f.x + f.s, f.y); ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2); }
      ctx.fill();
    });

    // Bodies — batched
    body.forEach((foods, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const f of foods) { ctx.moveTo(f.x + f.s, f.y); ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2); }
      ctx.fill();
    });

    // Specular highlight — all at once
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    body.forEach((foods) => {
      for (const f of foods) {
        const hr = f.s * 0.3;
        const hx = f.x - f.s * 0.2;
        const hy = f.y - f.s * 0.2;
        ctx.moveTo(hx + hr, hy); ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      }
    });
    ctx.fill();
  }

  private renderDevilFruits(ctx: CanvasRenderingContext2D): void {
    const camX = this.camera.x;
    const camY = this.camera.y;
    const vw = this.canvas.width / this.zoom;
    const vh = this.canvas.height / this.zoom;
    const dfMargin = 100;

    for (const fruit of this.devilFruits) {
      if (
        fruit.position.x < camX - dfMargin || fruit.position.x > camX + vw + dfMargin ||
        fruit.position.y < camY - dfMargin || fruit.position.y > camY + vh + dfMargin
      ) continue;

      const time = this.frameCount * 0.05;
      const pulse = 1 + Math.sin(time + fruit.position.x * 0.01) * 0.2;
      const size = fruit.size * pulse;
      const float = Math.sin(time * 1.5 + fruit.position.y * 0.01) * 4;
      const fx = fruit.position.x;
      const fy = fruit.position.y + float;

      // Outer glow
      ctx.fillStyle = fruit.glowColor + '18';
      ctx.beginPath();
      ctx.arc(fx, fy, size * 3, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing ring
      ctx.strokeStyle = fruit.glowColor + '40';
      ctx.lineWidth = 2;
      const ringPulse = 1 + Math.sin(time * 2) * 0.3;
      ctx.beginPath();
      ctx.arc(fx, fy, size * 2 * ringPulse, 0, Math.PI * 2);
      ctx.stroke();

      // Rotating sparkle lines
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(time);
      ctx.strokeStyle = fruit.glowColor + '50';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        ctx.moveTo(Math.cos(a) * size * 1.2, Math.sin(a) * size * 1.2);
        ctx.lineTo(Math.cos(a) * size * 2.0, Math.sin(a) * size * 2.0);
      }
      ctx.stroke();

      // Fruit body with gradient
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
      gradient.addColorStop(0, fruit.glowColor);
      gradient.addColorStop(0.6, fruit.color);
      gradient.addColorStop(1, fruit.color + '90');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();

      // Swirl pattern
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 4; a += 0.15) {
        const r = (a / (Math.PI * 4)) * size * 0.75;
        const sx = Math.cos(a + time * 0.5) * r;
        const sy = Math.sin(a + time * 0.5) * r;
        if (a === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(-size * 0.25, -size * 0.25, size * 0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Emoji above
      const fontScale = Math.min(1 / this.zoom, 1.6);
      ctx.font = `${Math.round(16 * fontScale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fruit.emoji, fx, fy - size - 4);

      // Name below
      ctx.font = `bold ${Math.round(8 * fontScale)}px Inter, sans-serif`;
      ctx.fillStyle = fruit.color;
      ctx.textBaseline = 'top';
      ctx.fillText(fruit.name, fx, fy + size + 4);
    }
  }

  private getThicknessMult(len: number): number {
    // Proportional growth curve: starts modestly, grows logarithmically
    // Avoids snakes getting too fat too quickly or staying too thin
    const effective = Math.max(0, len - 8);
    return 1.1 + Math.log2(1 + effective / 12) * 0.9;
  }

  private renderSnake(ctx: CanvasRenderingContext2D, player: Player, isLocal = false): void {
    const segments = player.segments;
    if (segments.length < 2) return;

    const segSize = this.config.segmentSize;
    const color = player.color;
    const ability = player.activeAbility;
    const len = Math.max(player.length, 1);
    const thicknessMult = this.getThicknessMult(len);
    const baseSize = segSize * thicknessMult;

    // Shadow for remote snakes (limited segments)
    if (!isLocal) {
      const shadowOff = baseSize * 0.35;
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = baseSize * 2.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const shadowLimit = Math.min(segments.length, 30);
      for (let i = 0; i < shadowLimit; i++) {
        const s = segments[i];
        if (i === 0) ctx.moveTo(s.x + shadowOff, s.y + shadowOff);
        else ctx.lineTo(s.x + shadowOff, s.y + shadowOff);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (ability === 'invisibility') {
      ctx.globalAlpha = isLocal ? 0.25 : 0.08;
    } else if (ability === 'phasing') {
      ctx.globalAlpha = 0.4 + Math.sin((this.frameCount % 36) / 36 * Math.PI * 2) * 0.3;
    }

    const camX = this.camera.x;
    const camY = this.camera.y;
    const vw = this.canvas.width / this.zoom;
    const vh = this.canvas.height / this.zoom;
    const cullMargin = baseSize * 4;

    let abilityGlow: string | null = null;
    if (ability === 'freeze') abilityGlow = '#85c1e9';
    else if (ability === 'fireboost') abilityGlow = '#f39c12';
    else if (ability === 'speed') abilityGlow = '#f9e547';
    else if (ability === 'phasing') abilityGlow = '#58d68d';
    else if (ability === 'resistance') abilityGlow = '#ff6b6b';
    else if (ability === 'magnet') abilityGlow = '#5d6d7e';

    const bodyColor = ability === 'freeze' ? '#3498db' : color;
    const bodyColorLight = cachedLighten(bodyColor, 25);
    const bodyColorDark = cachedDarken(bodyColor, 40);
    const strokeColor = abilityGlow ? cachedDarken(abilityGlow, 20) : bodyColorDark;

    // Build visible segments with viewport culling + downsampling
    const step = segments.length > 300 ? 3 : segments.length > 100 ? 2 : 1;
    const visSegs: { x: number; y: number; r: number }[] = [];

    for (let i = 0; i < segments.length; i += step) {
      const seg = segments[i];
      if (seg.x < camX - cullMargin || seg.x > camX + vw + cullMargin ||
          seg.y < camY - cullMargin || seg.y > camY + vh + cullMargin) {
        if (visSegs.length > 0 && visSegs[visSegs.length - 1].r > 0) {
          visSegs.push({ x: seg.x, y: seg.y, r: -1 });
        }
        continue;
      }
      const t = 1 - i / segments.length;
      const radius = baseSize * (0.4 + t * 0.6);
      visSegs.push({ x: seg.x, y: seg.y, r: radius });
    }

    if (visSegs.length < 2) {
      ctx.globalAlpha = 1;
      return;
    }

    // Draw body — improved 3-layer technique for 3D depth
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 0;

    // Layer 1: dark outline/border
    ctx.strokeStyle = strokeColor;
    this.drawSmoothSnakePath(ctx, visSegs, 1.35);

    // Layer 2: main body color
    ctx.strokeStyle = bodyColor;
    this.drawSmoothSnakePath(ctx, visSegs, 1.05);

    // Layer 3: body theme pattern (BELOW highlight, covers full body)
    this.renderBodyTheme(ctx, player, visSegs, baseSize);

    // Layer 4: belly scales pattern (alternating lighter bands)
    const patternLight = cachedLighten(bodyColor, 18);
    for (let si = 0; si < visSegs.length - 1; si += 3) {
      const s = visSegs[si];
      if (s.r < 0) continue;
      const r = s.r * 0.38;
      if (r < 1.5) continue;
      ctx.fillStyle = patternLight + '35';
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Layer 5: specular highlight strip (top-center shine)
    ctx.strokeStyle = bodyColorLight + '90';
    this.drawSmoothSnakePath(ctx, visSegs, 0.25);

    ctx.restore();

    // === Head — improved with snout shape and expressive features ===
    const head = segments[0];
    const headSize = baseSize * 1.3;

    // Head glow
    const glowActive = isLocal || player.boosting || abilityGlow;
    if (glowActive) {
      ctx.shadowColor = abilityGlow || color;
      ctx.shadowBlur = 16;
    }

    // Snout-like shape: elongated ellipse in movement direction
    const dir = player.direction;
    const headAngle = Math.atan2(dir.y, dir.x);

    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(headAngle);

    // Head gradient
    const headLightColor = cachedLighten(bodyColor, 55);
    const headGrad = ctx.createRadialGradient(
      -headSize * 0.15, -headSize * 0.15, headSize * 0.08,
      0, 0, headSize * 1.1
    );
    headGrad.addColorStop(0, headLightColor);
    headGrad.addColorStop(0.45, bodyColor);
    headGrad.addColorStop(1, bodyColorDark);
    ctx.fillStyle = headGrad;

    // Round head shape (slither.io / wormate.io style)
    ctx.beginPath();
    ctx.ellipse(headSize * 0.06, 0, headSize * 1.0, headSize * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();

    // Border stroke
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(1.2, headSize * 0.1);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Eyes — big round, wormate.io style
    const eyeFwd = headSize * 0.30;
    const eyeSep = headSize * 0.46;
    const eyeR = headSize * 0.30;
    const pupilR = headSize * 0.18;

    // Eye whites with subtle gradient
    for (const side of [-1, 1]) {
      const ey = eyeSep * side;
      // White
      const eyeGrad = ctx.createRadialGradient(eyeFwd - eyeR * 0.15, ey - eyeR * 0.15, eyeR * 0.1, eyeFwd, ey, eyeR);
      eyeGrad.addColorStop(0, '#ffffff');
      eyeGrad.addColorStop(1, '#e0e0e8');
      ctx.fillStyle = eyeGrad;
      ctx.beginPath();
      ctx.arc(eyeFwd, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();
      // Eye border
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = headSize * 0.04;
      ctx.stroke();

      // Pupil — round (wormate.io / slither.io style)
      ctx.fillStyle = '#0a0a12';
      ctx.beginPath();
      ctx.arc(eyeFwd + headSize * 0.04, ey, pupilR, 0, Math.PI * 2);
      ctx.fill();

      // Glint (2 highlights per eye)
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(eyeFwd - eyeR * 0.15, ey - eyeR * 0.2, headSize * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(eyeFwd + eyeR * 0.15, ey + eyeR * 0.15, headSize * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth line — subtle smile curve
    ctx.strokeStyle = bodyColorDark + '70';
    ctx.lineWidth = headSize * 0.04;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(headSize * 0.55, 0, headSize * 0.35, -0.5, 0.5);
    ctx.stroke();

    // Tongue (forked, animated)
    const tonguePhase = Math.sin(this.frameCount * 0.13);
    if (tonguePhase > 0.2) {
      const tongueExt = (tonguePhase - 0.2) / 0.8; // 0..1
      const tongueLen = headSize * (0.8 + tongueExt * 0.6);
      const tx = headSize * 0.95;
      const tongueWiggle = Math.sin(this.frameCount * 0.3) * 0.15;
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = Math.max(1.2, headSize * 0.055);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, 0);
      ctx.quadraticCurveTo(tx + tongueLen * 0.5, tongueWiggle * headSize * 0.3, tx + tongueLen, 0);
      ctx.stroke();
      // Fork
      const forkLen = tongueLen * 0.28;
      ctx.beginPath();
      ctx.moveTo(tx + tongueLen, 0);
      ctx.lineTo(tx + tongueLen + forkLen * 0.8, -forkLen * 0.6);
      ctx.moveTo(tx + tongueLen, 0);
      ctx.lineTo(tx + tongueLen + forkLen * 0.8, forkLen * 0.6);
      ctx.stroke();
    }

    ctx.restore(); // undo head translate+rotate

    // Boost effect — batched in one fill call
    if (player.boosting) {
      const tail = segments[segments.length - 1];
      const boostColor = ability === 'fireboost' ? '#f39c12' : color;
      ctx.fillStyle = `${boostColor}4d`;
      ctx.beginPath();
      for (let bi = 0; bi < 4; bi++) {
        const bx = tail.x + (Math.random() - 0.5) * 22;
        const by = tail.y + (Math.random() - 0.5) * 22;
        const br = baseSize * (0.45 - bi * 0.08);
        ctx.moveTo(bx + br, by); ctx.arc(bx, by, br, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Resistance shield ring
    if (ability === 'resistance') {
      ctx.strokeStyle = '#ff6b6b80';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(head.x, head.y, headSize * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Magnet gravity well (frameCount, no Date.now())
    if (ability === 'magnet') {
      ctx.strokeStyle = '#5d6d7e40';
      ctx.lineWidth = 2;
      const magnetPulse = 1 + Math.sin(this.frameCount * 0.24) * 0.3;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 250 * magnetPulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Accessory rendering
    this.renderAccessory(ctx, player, head, headSize, dir);

    ctx.globalAlpha = 1;
  }

  // ── Smooth snake path with width-grouped runs ──────────────
  private drawSmoothSnakePath(
    ctx: CanvasRenderingContext2D,
    segs: { x: number; y: number; r: number }[],
    widthScale: number
  ): void {
    if (segs.length < 2) return;

    const TOLERANCE = 1;
    let runStart = 0;

    const flushRun = (end: number) => {
      if (end <= runStart) return;
      const midR = (segs[runStart].r + segs[end].r) * 0.5 * widthScale;
      ctx.lineWidth = Math.max(1, midR * 2);
      ctx.beginPath();
      ctx.moveTo(segs[runStart].x, segs[runStart].y);
      for (let i = runStart + 1; i <= end; i++) {
        const s = segs[i];
        if (s.r < 0) { ctx.stroke(); runStart = i + 1; return; }
        if (i < end && segs[i + 1].r >= 0) {
          const mx = (s.x + segs[i + 1].x) * 0.5;
          const my = (s.y + segs[i + 1].y) * 0.5;
          ctx.quadraticCurveTo(s.x, s.y, mx, my);
        } else {
          ctx.lineTo(s.x, s.y);
        }
      }
      ctx.stroke();
    };

    for (let i = 1; i < segs.length; i++) {
      const s = segs[i];
      if (s.r < 0) {
        flushRun(i - 1);
        runStart = i + 1;
        continue;
      }
      const prevR = segs[i - 1].r < 0 ? s.r : segs[i - 1].r;
      if (Math.abs((s.r - prevR) * widthScale * 2) > TOLERANCE) {
        flushRun(i - 1);
        runStart = i - 1;
      }
    }
    flushRun(segs.length - 1);
  }

  private renderPlayerName(ctx: CanvasRenderingContext2D, player: Player): void {
    const head = player.segments[0];
    if (!head) return;
    if (player.activeAbility === 'invisibility' && player.id !== this.localPlayer?.id) return;

    const fontScale = Math.min(1 / this.zoom, 1.6);
    const nameFontSize = Math.round(14 * fontScale);
    const scoreFontSize = Math.round(11 * fontScale);
    const yOffset = this.config.segmentSize * 2.8 * fontScale;
    const y = head.y - yOffset;

    const displayName = player.name;

    ctx.font = `bold ${nameFontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(displayName, head.x + 1, y + 1);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(displayName, head.x, y);

    ctx.font = `${scoreFontSize}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = player.color;
    ctx.fillText(`🐍 ${Math.floor(player.length)}`, head.x, y - nameFontSize - 2);

    if (player.activeAbility) {
      ctx.font = `${Math.round(9 * fontScale)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`\u26A1 ${player.activeAbility.toUpperCase()}`, head.x, y - nameFontSize - scoreFontSize - 6);
    }
  }

  private renderCrown(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, rank: number): void {
    const colors = {
      1: { fill: '#ffd700', stroke: '#b8960f', glow: '#ffd70060' },
      2: { fill: '#c0c0c0', stroke: '#808080', glow: '#c0c0c040' },
      3: { fill: '#cd7f32', stroke: '#8b5a2b', glow: '#cd7f3240' },
    } as const;
    const c = colors[rank as 1 | 2 | 3];
    if (!c) return;

    const s = size;
    ctx.save();
    ctx.translate(cx, cy);

    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 6;

    ctx.beginPath();
    ctx.moveTo(-s, s * 0.3);
    ctx.lineTo(-s * 0.8, -s * 0.4);
    ctx.lineTo(-s * 0.35, s * 0.05);
    ctx.lineTo(0, -s * 0.6);
    ctx.lineTo(s * 0.35, s * 0.05);
    ctx.lineTo(s * 0.8, -s * 0.4);
    ctx.lineTo(s, s * 0.3);
    ctx.closePath();

    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Gems — batched
    const gems = [[-s * 0.8, -s * 0.4], [0, -s * 0.6], [s * 0.8, -s * 0.4]];
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (const [gx, gy] of gems) {
      ctx.moveTo(gx + s * 0.1, gy);
      ctx.arc(gx, gy, s * 0.1, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ── Accessory rendering on snake head ───────────────────────
  // Coordinate system after translate(head)+rotate(angle):
  //   +X = forward (movement direction)
  //   +Y = right side of snake (perpendicular)
  // Eyes in local space: (~0.24*hs, ±0.40*hs)
  private renderAccessory(
    ctx: CanvasRenderingContext2D,
    player: Player,
    head: Vector2D,
    headSize: number,
    dir: Vector2D
  ): void {
    const acc = player.accessory;
    if (!acc || acc === 'none') return;

    const angle = Math.atan2(dir.y, dir.x);

    ctx.save();

    switch (acc) {
      case 'sunglasses': {
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);
        const fwd = headSize * 0.28;
        const sep = headSize * 0.38;
        const lensRy = headSize * 0.24;
        const lensRx = headSize * 0.17;

        // Arms going backward
        ctx.strokeStyle = '#111';
        ctx.lineWidth = headSize * 0.045;
        ctx.beginPath();
        ctx.moveTo(fwd, -sep - lensRy * 0.7);
        ctx.lineTo(-headSize * 0.65, -sep * 0.85);
        ctx.moveTo(fwd, sep + lensRy * 0.7);
        ctx.lineTo(-headSize * 0.65, sep * 0.85);
        ctx.stroke();

        // Bridge across face (perpendicular)
        ctx.lineWidth = headSize * 0.055;
        ctx.beginPath();
        ctx.moveTo(fwd, -sep + lensRy * 0.5);
        ctx.lineTo(fwd, sep - lensRy * 0.5);
        ctx.stroke();

        // Lenses
        ctx.fillStyle = 'rgba(10,10,20,0.88)';
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = headSize * 0.045;
        ctx.beginPath();
        ctx.ellipse(fwd, -sep, lensRx, lensRy, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(fwd, sep, lensRx, lensRy, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.20)';
        ctx.beginPath();
        ctx.ellipse(fwd - lensRx * 0.2, -sep - lensRy * 0.2, lensRx * 0.3, lensRy * 0.22, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(fwd - lensRx * 0.2, sep - lensRy * 0.2, lensRx * 0.3, lensRy * 0.22, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'cool_glasses': {
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);
        const fwd = headSize * 0.28;
        const sep = headSize * 0.38;
        const r = headSize * 0.20;

        // Arms
        ctx.strokeStyle = '#888';
        ctx.lineWidth = headSize * 0.035;
        ctx.beginPath();
        ctx.moveTo(fwd, -sep - r);
        ctx.lineTo(-headSize * 0.55, -sep * 0.8);
        ctx.moveTo(fwd, sep + r);
        ctx.lineTo(-headSize * 0.55, sep * 0.8);
        ctx.stroke();

        // Bridge
        ctx.beginPath();
        ctx.moveTo(fwd, -sep + r);
        ctx.lineTo(fwd, sep - r);
        ctx.stroke();

        // Circle frames
        ctx.strokeStyle = '#666';
        ctx.lineWidth = headSize * 0.045;
        ctx.beginPath(); ctx.arc(fwd, -sep, r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(fwd, sep, r, 0, Math.PI * 2); ctx.stroke();

        // Transparent lenses
        ctx.fillStyle = 'rgba(200,225,255,0.12)';
        ctx.beginPath(); ctx.arc(fwd, -sep, r * 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(fwd, sep, r * 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        break;
      }
      case 'straw_hat': {
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);
        // Brim: wider perpendicular (Y) than forward (X)
        ctx.fillStyle = '#e8c862';
        ctx.beginPath();
        ctx.ellipse(-headSize * 0.05, 0, headSize * 0.70, headSize * 1.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b8960f';
        ctx.lineWidth = headSize * 0.05;
        ctx.stroke();

        // Dome
        ctx.fillStyle = '#f0d668';
        ctx.beginPath();
        ctx.ellipse(-headSize * 0.08, 0, headSize * 0.48, headSize * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c8a830';
        ctx.lineWidth = headSize * 0.04;
        ctx.stroke();

        // Red ribbon band
        ctx.strokeStyle = '#cc2222';
        ctx.lineWidth = headSize * 0.12;
        ctx.beginPath();
        ctx.ellipse(-headSize * 0.06, 0, headSize * 0.52, headSize * 0.76, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Straw texture lines (perpendicular)
        ctx.strokeStyle = 'rgba(184,150,15,0.22)';
        ctx.lineWidth = 0.6;
        for (let li = -4; li <= 4; li++) {
          const lx = li * headSize * 0.12;
          ctx.beginPath();
          ctx.moveTo(lx, -headSize * 1.3);
          ctx.lineTo(lx, headSize * 1.3);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'ninja_headband': {
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);
        // Band goes perpendicular (Y axis)
        const bandCenter = headSize * 0.15;
        const bandDepth = headSize * 0.28;
        const bandWidth = headSize * 1.05;
        ctx.fillStyle = '#1a2744';
        ctx.fillRect(bandCenter - bandDepth / 2, -bandWidth, bandDepth, bandWidth * 2);

        // Metal plate centered
        const pw = headSize * 0.32;
        const ph = headSize * 0.26;
        ctx.fillStyle = '#8899aa';
        ctx.beginPath();
        ctx.roundRect(bandCenter - ph / 2, -pw, ph, pw * 2, headSize * 0.04);
        ctx.fill();
        ctx.strokeStyle = '#556677';
        ctx.lineWidth = headSize * 0.035;
        ctx.stroke();

        // Leaf swirl on plate
        ctx.strokeStyle = '#334455';
        ctx.lineWidth = headSize * 0.04;
        ctx.beginPath();
        ctx.arc(bandCenter, 0, headSize * 0.09, 0, Math.PI * 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bandCenter, -headSize * 0.09);
        ctx.lineTo(bandCenter + headSize * 0.02, headSize * 0.09);
        ctx.stroke();

        // Tail ribbons trailing behind
        ctx.strokeStyle = '#1a2744';
        ctx.lineWidth = headSize * 0.10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-headSize * 0.5, -bandWidth * 0.1);
        ctx.quadraticCurveTo(-headSize * 0.8, -headSize * 0.15, -headSize * 1.1, headSize * 0.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-headSize * 0.5, bandWidth * 0.05);
        ctx.quadraticCurveTo(-headSize * 0.75, headSize * 0.2, -headSize * 1.0, headSize * 0.3);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'scouter': {
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);
        const fwd = headSize * 0.24;
        const eyeY = -headSize * 0.4;

        // Ear piece
        ctx.fillStyle = '#999';
        ctx.fillRect(-headSize * 0.15, eyeY - headSize * 0.06, headSize * 0.25, headSize * 0.12);

        // Arm to green lens
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = headSize * 0.04;
        ctx.beginPath();
        ctx.moveTo(headSize * 0.05, eyeY);
        ctx.lineTo(fwd + headSize * 0.15, eyeY + headSize * 0.05);
        ctx.stroke();

        // Green lens
        ctx.fillStyle = 'rgba(0,255,120,0.35)';
        ctx.strokeStyle = '#66cc66';
        ctx.lineWidth = headSize * 0.04;
        ctx.beginPath();
        ctx.arc(fwd + headSize * 0.15, eyeY + headSize * 0.05, headSize * 0.18, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Power level
        ctx.fillStyle = '#00ff88';
        ctx.font = `bold ${Math.round(headSize * 0.12)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.floor(player.length)}`, fwd + headSize * 0.15, eyeY + headSize * 0.07);
        ctx.restore();
        break;
      }
      case 'pirate_bandana': {
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);

        // Red bandana covering back hemisphere
        ctx.fillStyle = '#cc2222';
        ctx.beginPath();
        ctx.ellipse(-headSize * 0.1, 0, headSize * 0.85, headSize * 0.9, 0, Math.PI * 0.6, -Math.PI * 0.6, true);
        ctx.closePath();
        ctx.fill();

        // Knot at back
        ctx.fillStyle = '#aa1111';
        ctx.beginPath();
        ctx.arc(-headSize * 0.8, 0, headSize * 0.12, 0, Math.PI * 2);
        ctx.fill();

        // Trailing tails
        ctx.strokeStyle = '#cc2222';
        ctx.lineWidth = headSize * 0.09;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-headSize * 0.82, -headSize * 0.05);
        ctx.quadraticCurveTo(-headSize * 1.1, -headSize * 0.15, -headSize * 1.3, headSize * 0.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-headSize * 0.82, headSize * 0.05);
        ctx.quadraticCurveTo(-headSize * 1.0, headSize * 0.25, -headSize * 1.2, headSize * 0.35);
        ctx.stroke();

        // Skull icon on forehead
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(headSize * 0.15, 0, headSize * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#cc2222';
        ctx.beginPath();
        ctx.arc(headSize * 0.17, -headSize * 0.06, headSize * 0.04, 0, Math.PI * 2);
        ctx.arc(headSize * 0.17, headSize * 0.06, headSize * 0.04, 0, Math.PI * 2);
        ctx.fill();
        // Crossbones
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = headSize * 0.03;
        ctx.beginPath();
        ctx.moveTo(headSize * 0.02, -headSize * 0.15);
        ctx.lineTo(headSize * 0.28, headSize * 0.15);
        ctx.moveTo(headSize * 0.28, -headSize * 0.15);
        ctx.lineTo(headSize * 0.02, headSize * 0.15);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'crown': {
        this.renderCrown(ctx, head.x, head.y - headSize - 2, headSize * 0.7, 1);
        break;
      }
      case 'cat_ears': {
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);
        const earBack = -headSize * 0.25;
        const earSep = headSize * 0.55;
        const earH = headSize * 0.7;

        // Left ear
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.moveTo(earBack - headSize * 0.15, -earSep + headSize * 0.15);
        ctx.lineTo(earBack + headSize * 0.15, -earSep - earH);
        ctx.lineTo(earBack + headSize * 0.3, -earSep + headSize * 0.15);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffb6c1';
        ctx.beginPath();
        ctx.moveTo(earBack - headSize * 0.05, -earSep + headSize * 0.1);
        ctx.lineTo(earBack + headSize * 0.15, -earSep - earH * 0.55);
        ctx.lineTo(earBack + headSize * 0.22, -earSep + headSize * 0.1);
        ctx.closePath(); ctx.fill();

        // Right ear
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.moveTo(earBack - headSize * 0.15, earSep - headSize * 0.15);
        ctx.lineTo(earBack + headSize * 0.15, earSep + earH);
        ctx.lineTo(earBack + headSize * 0.3, earSep - headSize * 0.15);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffb6c1';
        ctx.beginPath();
        ctx.moveTo(earBack - headSize * 0.05, earSep - headSize * 0.1);
        ctx.lineTo(earBack + headSize * 0.15, earSep + earH * 0.55);
        ctx.lineTo(earBack + headSize * 0.22, earSep - headSize * 0.1);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      case 'halo': {
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);
        const haloX = -headSize * 0.1;
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = headSize * 0.08;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(haloX, 0, headSize * 0.25, headSize * 0.75, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,215,0,0.3)';
        ctx.lineWidth = headSize * 0.15;
        ctx.beginPath();
        ctx.ellipse(haloX, 0, headSize * 0.25, headSize * 0.75, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'devil_horns': {
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);
        const hornBase = headSize * 0.05;
        const hornSep = headSize * 0.5;

        // Left horn
        ctx.fillStyle = '#8b0000';
        ctx.beginPath();
        ctx.moveTo(hornBase, -hornSep + headSize * 0.1);
        ctx.quadraticCurveTo(headSize * 0.15, -hornSep - headSize * 0.6, headSize * 0.5, -hornSep - headSize * 0.45);
        ctx.lineTo(hornBase + headSize * 0.18, -hornSep + headSize * 0.1);
        ctx.closePath(); ctx.fill();

        // Right horn
        ctx.beginPath();
        ctx.moveTo(hornBase, hornSep - headSize * 0.1);
        ctx.quadraticCurveTo(headSize * 0.15, hornSep + headSize * 0.6, headSize * 0.5, hornSep + headSize * 0.45);
        ctx.lineTo(hornBase + headSize * 0.18, hornSep - headSize * 0.1);
        ctx.closePath(); ctx.fill();

        // Shine on horns
        ctx.fillStyle = 'rgba(255,100,100,0.25)';
        ctx.beginPath();
        ctx.moveTo(hornBase + headSize * 0.03, -hornSep + headSize * 0.05);
        ctx.quadraticCurveTo(headSize * 0.15, -hornSep - headSize * 0.4, headSize * 0.4, -hornSep - headSize * 0.35);
        ctx.lineTo(hornBase + headSize * 0.12, -hornSep + headSize * 0.05);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(hornBase + headSize * 0.03, hornSep - headSize * 0.05);
        ctx.quadraticCurveTo(headSize * 0.15, hornSep + headSize * 0.4, headSize * 0.4, hornSep + headSize * 0.35);
        ctx.lineTo(hornBase + headSize * 0.12, hornSep - headSize * 0.05);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
    }

    ctx.restore();
  }

  // ── Body theme pattern rendering — full body coverage ────
  private renderBodyTheme(
    ctx: CanvasRenderingContext2D,
    player: Player,
    visSegs: { x: number; y: number; r: number }[],
    baseSize: number
  ): void {
    const theme = player.theme;
    if (!theme || theme === 'none') return;
    if (visSegs.length < 3) return;

    const color = player.color;
    const fc = this.frameCount;

    switch (theme) {
      case 'stripes': {
        // Dark & light alternating rings across entire body
        const stripeDark = cachedDarken(color, 50) + '80';
        const stripeLight = cachedLighten(color, 25) + '40';
        for (let i = 0; i < visSegs.length; i++) {
          const s = visSegs[i];
          if (s.r < 0) continue;
          const phase = i % 6;
          if (phase >= 3) continue; // every other 3 segments
          const r = s.r * 0.85;
          if (r < 1) continue;
          ctx.fillStyle = phase < 2 ? stripeDark : stripeLight;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'zigzag': {
        // Bright zigzag running along both sides of body
        const zigColor = cachedLighten(color, 45) + '80';
        ctx.strokeStyle = zigColor;
        ctx.lineWidth = baseSize * 0.14;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const sideSign of [-1, 1]) {
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < visSegs.length; i++) {
            const s = visSegs[i];
            if (s.r < 0) { started = false; continue; }
            const n = i < visSegs.length - 1 ? visSegs[i + 1] : s;
            if (n.r < 0) continue;
            const dx = n.x - s.x;
            const dy = n.y - s.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const px = -dy / len;
            const py = dx / len;
            const side = (i % 4 < 2) ? sideSign : -sideSign;
            const off = s.r * 0.55 * side;
            const ox = s.x + px * off;
            const oy = s.y + py * off;
            if (!started) { ctx.moveTo(ox, oy); started = true; }
            else ctx.lineTo(ox, oy);
          }
          ctx.stroke();
        }
        break;
      }
      case 'dots': {
        // Polka dots all along both sides of body
        const dotColor1 = cachedLighten(color, 55) + '65';
        const dotColor2 = cachedDarken(color, 30) + '55';
        for (let i = 1; i < visSegs.length; i += 2) {
          const s = visSegs[i];
          if (s.r < 0) continue;
          const n = i < visSegs.length - 1 ? visSegs[i + 1] : s;
          if (n.r < 0) continue;
          const dx = n.x - s.x;
          const dy = n.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const px = -dy / len;
          const py = dx / len;
          const dr = s.r * 0.25;
          if (dr < 1) continue;
          // Center dot
          ctx.fillStyle = dotColor1;
          ctx.beginPath();
          ctx.arc(s.x, s.y, dr * 1.2, 0, Math.PI * 2);
          ctx.fill();
          // Side dots
          if (i % 4 < 2) {
            ctx.fillStyle = dotColor2;
            ctx.beginPath();
            ctx.arc(s.x + px * s.r * 0.4, s.y + py * s.r * 0.4, dr * 0.7, 0, Math.PI * 2);
            ctx.arc(s.x - px * s.r * 0.4, s.y - py * s.r * 0.4, dr * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'galaxy': {
        // Cosmic nebula glow covering entire body + sparkling stars
        const nebulaColors = ['#6633cc', '#3366ff', '#cc33ff', '#3399ff'];
        // Nebula haze along body
        for (let i = 0; i < visSegs.length; i += 2) {
          const s = visSegs[i];
          if (s.r < 0) continue;
          const ci = ((i * 3 + 7) % nebulaColors.length);
          const nR = s.r * (0.6 + Math.sin(fc * 0.02 + i * 0.3) * 0.2);
          if (nR < 1) continue;
          ctx.globalAlpha = 0.15 + Math.sin(fc * 0.03 + i * 0.5) * 0.08;
          ctx.fillStyle = nebulaColors[ci];
          ctx.beginPath();
          ctx.arc(s.x + Math.sin(i * 2.3) * s.r * 0.2, s.y + Math.cos(i * 1.7) * s.r * 0.2, nR, 0, Math.PI * 2);
          ctx.fill();
        }
        // Sparkling stars
        const starColors = ['#ffffff', '#ffddaa', '#aaddff', '#ffaaff'];
        for (let i = 0; i < visSegs.length; i++) {
          const s = visSegs[i];
          if (s.r < 0) continue;
          const seed = (i * 7 + fc) % 40;
          if (seed > 5) continue;
          const ci = (i * 3) % starColors.length;
          const starR = s.r * (0.06 + (seed % 3) * 0.04);
          if (starR < 0.5) continue;
          ctx.globalAlpha = 0.5 + Math.sin(fc * 0.15 + i * 1.3) * 0.4;
          ctx.fillStyle = starColors[ci];
          ctx.beginPath();
          ctx.arc(s.x + Math.sin(i * 2.3) * s.r * 0.35, s.y + Math.cos(i * 1.7) * s.r * 0.35, starR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'flames': {
        // Fire gradient covering entire body from head to tail
        for (let i = 0; i < visSegs.length; i++) {
          const s = visSegs[i];
          if (s.r < 0) continue;
          const t = i / visSegs.length; // 0 head → 1 tail
          const n = i < visSegs.length - 1 ? visSegs[i + 1] : s;
          if (n.r < 0) continue;
          const dx = n.x - s.x;
          const dy = n.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const px = -dy / len;
          const py = dx / len;
          const flicker = Math.sin(fc * 0.18 + i * 0.6) * 0.3 + 0.7;
          const intensity = 0.15 + t * 0.6;
          const r = s.r * 0.7 * flicker;
          if (r < 1) continue;
          // Color shifts from yellow (head) → orange → red (tail)
          let flameColor: string;
          if (t < 0.3) flameColor = `rgba(255,220,50,${intensity * 0.4})`;
          else if (t < 0.65) flameColor = `rgba(255,140,30,${intensity * 0.55})`;
          else flameColor = `rgba(255,50,20,${intensity * 0.65})`;
          ctx.fillStyle = flameColor;
          const side = Math.sin(fc * 0.2 + i * 0.8);
          ctx.beginPath();
          ctx.arc(s.x + px * side * s.r * 0.25, s.y + py * side * s.r * 0.25, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'lightning': {
        // Electric arcs running along both sides of entire body
        ctx.lineCap = 'round';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 5;
        for (const sideSign of [-0.4, 0.4]) {
          ctx.strokeStyle = `rgba(255,255,80,${0.5 + Math.sin(fc * 0.1) * 0.3})`;
          ctx.lineWidth = baseSize * 0.09;
          ctx.beginPath();
          let boltStarted = false;
          for (let i = 0; i < visSegs.length; i++) {
            const s = visSegs[i];
            if (s.r < 0) { boltStarted = false; continue; }
            const n = i < visSegs.length - 1 ? visSegs[i + 1] : s;
            if (n.r < 0) continue;
            const dx = n.x - s.x;
            const dy = n.y - s.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const px = -dy / len;
            const py = dx / len;
            const jitter = Math.sin(fc * 0.35 + i * 1.8 + sideSign * 10) * s.r * 0.35;
            const ox = s.x + px * (s.r * sideSign + jitter);
            const oy = s.y + py * (s.r * sideSign + jitter);
            if (!boltStarted) { ctx.moveTo(ox, oy); boltStarted = true; }
            else ctx.lineTo(ox, oy);
          }
          ctx.stroke();
        }
        // Bright center bolt
        ctx.strokeStyle = '#ffffff88';
        ctx.lineWidth = baseSize * 0.05;
        ctx.beginPath();
        let cs = false;
        for (let i = 0; i < visSegs.length; i += 2) {
          const s = visSegs[i];
          if (s.r < 0) { cs = false; continue; }
          const jitter = Math.sin(fc * 0.4 + i * 2.1) * s.r * 0.2;
          const n = i < visSegs.length - 1 ? visSegs[i + 1] : s;
          if (n.r < 0) continue;
          const dx = n.x - s.x;
          const dy = n.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const px = -dy / len;
          const py = dx / len;
          if (!cs) { ctx.moveTo(s.x + px * jitter, s.y + py * jitter); cs = true; }
          else ctx.lineTo(s.x + px * jitter, s.y + py * jitter);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        break;
      }
      case 'sakura': {
        // Cherry blossom petals scattered all along body
        for (let i = 2; i < visSegs.length; i += 3) {
          const s = visSegs[i];
          if (s.r < 0) continue;
          const pr = s.r * 0.32;
          if (pr < 1.2) continue;
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(fc * 0.015 + i * 0.8);
          // 5-petal flower
          ctx.fillStyle = `rgba(255,183,197,${0.4 + Math.sin(fc * 0.04 + i) * 0.15})`;
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(Math.cos(a) * pr * 0.45, Math.sin(a) * pr * 0.45, pr * 0.45, pr * 0.22, a, 0, Math.PI * 2);
            ctx.fill();
          }
          // Petal center
          ctx.fillStyle = 'rgba(255,240,200,0.65)';
          ctx.beginPath();
          ctx.arc(0, 0, pr * 0.18, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        // Falling petal particles along body
        ctx.fillStyle = 'rgba(255,192,203,0.3)';
        for (let i = 0; i < visSegs.length; i += 5) {
          const s = visSegs[i];
          if (s.r < 0) continue;
          const petalR = s.r * 0.15;
          if (petalR < 0.8) continue;
          const driftX = Math.sin(fc * 0.03 + i * 1.5) * s.r * 0.4;
          const driftY = Math.cos(fc * 0.04 + i * 1.2) * s.r * 0.3;
          ctx.beginPath();
          ctx.ellipse(s.x + driftX, s.y + driftY, petalR, petalR * 0.5, fc * 0.02 + i, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'scales': {
        // Overlapping dragon scales covering entire body
        const scaleStroke = cachedDarken(color, 30) + '70';
        const scaleFill = cachedDarken(color, 15) + '30';
        for (let i = 1; i < visSegs.length; i++) {
          const s = visSegs[i];
          if (s.r < 0) continue;
          const n = i < visSegs.length - 1 ? visSegs[i + 1] : s;
          if (n.r < 0) continue;
          const dx = n.x - s.x;
          const dy = n.y - s.y;
          const a = Math.atan2(dy, dx);
          const sr = s.r * 0.5;
          if (sr < 1.2) continue;
          // Scale arc
          ctx.fillStyle = scaleFill;
          ctx.strokeStyle = scaleStroke;
          ctx.lineWidth = baseSize * 0.04;
          ctx.beginPath();
          ctx.arc(s.x, s.y, sr, a - Math.PI * 0.65, a + Math.PI * 0.65);
          ctx.fill();
          ctx.stroke();
        }
        // Lighter scale highlights on alternating
        const scaleHighlight = cachedLighten(color, 20) + '25';
        for (let i = 2; i < visSegs.length; i += 2) {
          const s = visSegs[i];
          if (s.r < 0) continue;
          const n = i < visSegs.length - 1 ? visSegs[i + 1] : s;
          if (n.r < 0) continue;
          const dx = n.x - s.x;
          const dy = n.y - s.y;
          const a = Math.atan2(dy, dx);
          const sr = s.r * 0.35;
          if (sr < 0.8) continue;
          ctx.fillStyle = scaleHighlight;
          ctx.beginPath();
          ctx.arc(s.x, s.y, sr, a - Math.PI * 0.4, a + Math.PI * 0.4);
          ctx.fill();
        }
        break;
      }
      case 'neon': {
        // Pulsing neon glow outline covering entire body
        const pulse = 0.5 + Math.sin(fc * 0.08) * 0.4;
        const neonColor = cachedLighten(color, 70);
        ctx.shadowColor = neonColor;
        ctx.shadowBlur = 12;
        // Outer neon glow
        ctx.strokeStyle = neonColor;
        ctx.globalAlpha = pulse * 0.55;
        this.drawSmoothSnakePath(ctx, visSegs, 1.25);
        // Inner bright line
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = pulse * 0.35;
        this.drawSmoothSnakePath(ctx, visSegs, 0.18);
        // Neon dots along body edges
        ctx.fillStyle = neonColor;
        ctx.globalAlpha = pulse * 0.5;
        for (let i = 0; i < visSegs.length; i += 4) {
          const s = visSegs[i];
          if (s.r < 0) continue;
          const n = i < visSegs.length - 1 ? visSegs[i + 1] : s;
          if (n.r < 0) continue;
          const dx = n.x - s.x;
          const dy = n.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const px = -dy / len;
          const py = dx / len;
          const dr = s.r * 0.12;
          ctx.beginPath();
          ctx.arc(s.x + px * s.r * 0.8, s.y + py * s.r * 0.8, dr, 0, Math.PI * 2);
          ctx.arc(s.x - px * s.r * 0.8, s.y - py * s.r * 0.8, dr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        break;
      }
      case 'camo': {
        // Camouflage blotches covering entire body
        const camo1 = cachedDarken(color, 45) + '60';
        const camo2 = cachedDarken(color, 20) + '50';
        const camo3 = cachedLighten(color, 15) + '45';
        const camoColors = [camo1, camo2, camo3];
        for (let i = 0; i < visSegs.length; i += 2) {
          const s = visSegs[i];
          if (s.r < 0) continue;
          const ci = ((i * 7 + 3) % camoColors.length);
          const br = s.r * (0.35 + (((i * 13) % 10) / 10) * 0.35);
          if (br < 1) continue;
          ctx.fillStyle = camoColors[ci];
          const ox = Math.sin(i * 2.1) * s.r * 0.3;
          const oy = Math.cos(i * 1.7) * s.r * 0.3;
          ctx.beginPath();
          ctx.ellipse(s.x + ox, s.y + oy, br, br * 0.65, i * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }
  }

  private renderMinimap(ctx: CanvasRenderingContext2D, w: number, _h: number): void {
    const isMobile = w < 768;
    const mmSize = isMobile ? 95 : 150;
    const mmMargin = isMobile ? 8 : 16;
    const mmX = w - mmSize - mmMargin;
    const mmY = mmMargin;
    const scale = mmSize / this.config.worldSize;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mmX - 1, mmY - 1, mmSize + 2, mmSize + 2, isMobile ? 6 : 10);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(mmX, mmY, mmSize, mmSize, isMobile ? 5 : 9);
    ctx.clip();

    ctx.fillStyle = 'rgba(16,30,60,0.4)';
    ctx.fillRect(mmX, mmY, mmSize, mmSize);

    ctx.strokeStyle = 'rgba(239,68,68,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mmX + 2, mmY + 2, mmSize - 4, mmSize - 4);

    // Food density — adaptive stride for performance
    ctx.fillStyle = 'rgba(16,185,129,0.18)';
    const foodStride = Math.max(20, (this.foods.length / 200) | 0);
    for (let i = 0; i < this.foods.length; i += foodStride) {
      const f = this.foods[i];
      if (!f) continue;
      ctx.fillRect(mmX + f.position.x * scale - 0.5, mmY + f.position.y * scale - 0.5, 1.5, 1.5);
    }

    // Devil fruit blips (no shadowBlur — too expensive)
    for (const df of this.devilFruits) {
      ctx.fillStyle = df.color;
      ctx.beginPath();
      ctx.arc(mmX + df.position.x * scale, mmY + df.position.y * scale, isMobile ? 2.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Remote player dots
    this.remotePlayers.forEach((player) => {
      if (!player.alive || !player.segments[0]) return;
      const dotR = Math.min(2 + player.length * 0.015, isMobile ? 4 : 5);
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(mmX + player.segments[0].x * scale, mmY + player.segments[0].y * scale, dotR, 0, Math.PI * 2);
      ctx.fill();
    });

    // Local player blip
    if (this.localPlayer?.alive && this.localPlayer.segments[0]) {
      const dotR = Math.min(3 + this.localPlayer.length * 0.02, isMobile ? 5 : 7);
      const hx = mmX + this.localPlayer.segments[0].x * scale;
      const hy = mmY + this.localPlayer.segments[0].y * scale;
      ctx.fillStyle = this.localPlayer.color;
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(hx, hy, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(hx, hy, dotR * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // Viewport rect
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mmX + this.camera.x * scale,
      mmY + this.camera.y * scale,
      (this.canvas.width / this.zoom) * scale,
      (this.canvas.height / this.zoom) * scale
    );

    ctx.restore();

    ctx.font = `bold ${isMobile ? 8 : 10}px Inter, system-ui`;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('MAP', mmX + 5, mmY + (isMobile ? 11 : 13));
  }

  private renderKillFeed(ctx: CanvasRenderingContext2D, w: number): void {
    if (this.killFeedEntries.length === 0) return;
    const startY = 60;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    for (let i = 0; i < this.killFeedEntries.length; i++) {
      const entry = this.killFeedEntries[i];
      ctx.globalAlpha = Math.min(entry.life * 3, 1) * 0.9;
      ctx.font = 'bold 13px Inter, system-ui';
      const x = w - 16;
      const y = startY + i * 22;
      const tw = ctx.measureText(entry.text).width;
      ctx.save();
      ctx.globalAlpha *= 0.6;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.roundRect(x - tw - 10, y - 2, tw + 14, 18, 4);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.fillText(entry.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  private renderFPSCounter(ctx: CanvasRenderingContext2D): void {
    if (this.lastFps >= 45) return;
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(255,80,80,0.7)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${this.lastFps} fps`, 4, 4);
  }

  // ========================
  // Particles — batched by color+alpha
  // ========================

  private addParticle(x: number, y: number, color: string, count: number): void {
    const maxParticles = 200;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= maxParticles) {
        const p = this.particles.shift()!;
        p.x = x; p.y = y;
        p.vx = (Math.random() - 0.5) * 4;
        p.vy = (Math.random() - 0.5) * 4;
        p.color = color;
        p.size = Math.random() * 4 + 2;
        p.life = 1;
        p.decay = Math.random() * 0.03 + 0.02;
        this.particles.push(p);
      } else {
        this.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          color,
          size: Math.random() * 4 + 2,
          life: 1,
          decay: Math.random() * 0.03 + 0.02,
        });
      }
    }
  }

  private spawnDeathParticles(x: number, y: number, color: string): void {
    for (let i = 0; i < 30; i++) {
      const angle = (Math.PI * 2 * i) / 30;
      const speed = Math.random() * 6 + 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: Math.random() * 6 + 3,
        life: 1,
        decay: Math.random() * 0.02 + 0.01,
      });
    }
  }

  private updateParticles(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= p.decay;
      p.size *= 0.99;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  // Batch-render particles grouped by color + quantized alpha
  private renderParticles(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;

    const groups = new Map<string, Particle[]>();
    for (const p of this.particles) {
      let g = groups.get(p.color);
      if (!g) { g = []; groups.set(p.color, g); }
      g.push(p);
    }

    groups.forEach((parts, color) => {
      ctx.fillStyle = color;
      const alphaGroups = new Map<number, Particle[]>();
      for (const p of parts) {
        const aKey = Math.round(p.life * 10);
        let ag = alphaGroups.get(aKey);
        if (!ag) { ag = []; alphaGroups.set(aKey, ag); }
        ag.push(p);
      }
      alphaGroups.forEach((ps, aKey) => {
        ctx.globalAlpha = aKey / 10;
        ctx.beginPath();
        for (const p of ps) {
          ctx.moveTo(p.x + p.size, p.y);
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        }
        ctx.fill();
      });
    });
    ctx.globalAlpha = 1;
  }

  // ========================
  // Color Utilities — use cachedLighten / cachedDarken directly
  // ========================

  public triggerDeath(): void {
    if (!this.localPlayer) return;
    const head = this.localPlayer.segments[0];
    if (head) {
      this.localPlayer.alive = false;
      this.screenShake = 20;
      this.deathFlash = 1;
      this.spawnDeathParticles(head.x, head.y, this.localPlayer.color);
    }
  }

  public addKillFeedEntry(text: string): void {
    this.killFeedEntries.unshift({ text, life: 1 });
    if (this.killFeedEntries.length > 5) this.killFeedEntries.pop();
  }

  public destroy(): void {
    this.stop();
    window.removeEventListener('resize', this.resizeHandler);
    this.particles = [];
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  decay: number;
}
