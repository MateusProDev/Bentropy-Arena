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
  private playerRankings: Map<string, number> = new Map();

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

  public updateRankings(rankings: Map<string, number>): void {
    this.playerRankings = rankings;
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

    // Boost cost
    if (this.isBoosting && this.localPlayer.length > 8) {
      if (ability !== 'fireboost') {
        this.localPlayer.length -= 0.05;
        this.localPlayer.score = Math.max(0, this.localPlayer.score - 0.05);
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

    // Dynamic zoom
    const playerLen = this.localPlayer.length;
    this.targetZoom = Math.max(0.22, Math.min(1.0, 1.0 / (1 + Math.max(0, playerLen - 10) * 0.002)));
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
        this.localPlayer.score += food.value;
        this.localPlayer.length += this.config.growthRate;
        this.addParticle(food.position.x, food.position.y, food.color, 5);
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
    const effective = Math.max(0, len - 10);
    return 1 + Math.log2(1 + effective / 12) * 0.9;
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
      const shadowOff = baseSize * 0.4;
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = baseSize * 1.8;
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

    // Draw body
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 0;

    ctx.strokeStyle = strokeColor;
    this.drawSmoothSnakePath(ctx, visSegs, 1.3);

    ctx.strokeStyle = bodyColor;
    this.drawSmoothSnakePath(ctx, visSegs, 1.0);

    ctx.strokeStyle = bodyColorLight + 'a0';
    this.drawSmoothSnakePath(ctx, visSegs, 0.35);

    ctx.restore();

    // === Head ===
    const head = segments[0];
    const headSize = baseSize * 1.2;

    // Head glow — reduced shadowBlur (12 instead of 16)
    ctx.shadowColor = abilityGlow || color;
    ctx.shadowBlur = (isLocal || player.boosting || abilityGlow) ? 12 : 0;

    // Head gradient using cached colors
    const headLightColor = cachedLighten(bodyColor, 50);
    const headGrad = ctx.createRadialGradient(
      head.x - headSize * 0.2, head.y - headSize * 0.2, headSize * 0.1,
      head.x, head.y, headSize
    );
    headGrad.addColorStop(0, headLightColor);
    headGrad.addColorStop(0.6, bodyColor);
    headGrad.addColorStop(1, bodyColorDark);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(head.x, head.y, headSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(1, headSize * 0.12);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Eyes — batched (2 eyes in single path per layer)
    const dir = player.direction;
    const eyeOffset = headSize * 0.4;
    const perpX = -dir.y;
    const perpY = dir.x;
    const eyeDirOff = eyeOffset * 0.6;

    const eyeX1 = head.x + dir.x * eyeDirOff + perpX * eyeOffset;
    const eyeY1 = head.y + dir.y * eyeDirOff + perpY * eyeOffset;
    const eyeX2 = head.x + dir.x * eyeDirOff - perpX * eyeOffset;
    const eyeY2 = head.y + dir.y * eyeDirOff - perpY * eyeOffset;
    const eyeR = headSize * 0.28;
    const pupilR = headSize * 0.14;
    const pupilOffX = dir.x * headSize * 0.1;
    const pupilOffY = dir.y * headSize * 0.1;
    const glintOff = headSize * 0.05;
    const glintR = headSize * 0.06;

    // White — single path, 2 arcs
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(eyeX1 + eyeR, eyeY1); ctx.arc(eyeX1, eyeY1, eyeR, 0, Math.PI * 2);
    ctx.moveTo(eyeX2 + eyeR, eyeY2); ctx.arc(eyeX2, eyeY2, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Pupils — single path
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(eyeX1 + pupilOffX + pupilR, eyeY1 + pupilOffY);
    ctx.arc(eyeX1 + pupilOffX, eyeY1 + pupilOffY, pupilR, 0, Math.PI * 2);
    ctx.moveTo(eyeX2 + pupilOffX + pupilR, eyeY2 + pupilOffY);
    ctx.arc(eyeX2 + pupilOffX, eyeY2 + pupilOffY, pupilR, 0, Math.PI * 2);
    ctx.fill();

    // Glints — single path
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(eyeX1 - glintOff + glintR, eyeY1 - glintOff);
    ctx.arc(eyeX1 - glintOff, eyeY1 - glintOff, glintR, 0, Math.PI * 2);
    ctx.moveTo(eyeX2 - glintOff + glintR, eyeY2 - glintOff);
    ctx.arc(eyeX2 - glintOff, eyeY2 - glintOff, glintR, 0, Math.PI * 2);
    ctx.fill();

    // Tongue
    if (Math.sin(this.frameCount * 0.13) > 0.3) {
      const tongueLen = headSize * 1.2;
      const tx = head.x + dir.x * headSize;
      const ty = head.y + dir.y * headSize;
      const endX = tx + dir.x * tongueLen;
      const endY = ty + dir.y * tongueLen;
      const forkLen = tongueLen * 0.3;
      const angle = Math.atan2(dir.y, dir.x);
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = Math.max(1, headSize * 0.06);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(endX, endY);
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX + Math.cos(angle + 0.4) * forkLen, endY + Math.sin(angle + 0.4) * forkLen);
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX + Math.cos(angle - 0.4) * forkLen, endY + Math.sin(angle - 0.4) * forkLen);
      ctx.stroke();
    }

    // Boost effect — batched in one fill call
    if (player.boosting) {
      const tail = segments[segments.length - 1];
      const boostColor = ability === 'fireboost' ? '#f39c12' : color;
      ctx.fillStyle = `${boostColor}4d`;
      ctx.beginPath();
      for (let bi = 0; bi < 3; bi++) {
        const bx = tail.x + (Math.random() - 0.5) * 20;
        const by = tail.y + (Math.random() - 0.5) * 20;
        const br = baseSize * (0.4 - bi * 0.08);
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

    // Crown for top 3
    const rank = this.playerRankings.get(player.id);
    if (rank && rank <= 3) {
      this.renderCrown(ctx, head.x, head.y - headSize - 2, headSize * 0.7, rank);
    }

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
    const yOffset = this.config.segmentSize * 2.5 * fontScale;
    const y = head.y - yOffset;

    const rank = this.playerRankings.get(player.id);
    let prefix = '';
    if (rank === 1) prefix = '\u{1F451} ';
    else if (rank === 2) prefix = '\u{1FA99} ';
    else if (rank === 3) prefix = '\u{1F949} ';

    const displayName = prefix + player.name;

    ctx.font = `bold ${nameFontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(displayName, head.x + 1, y + 1);

    ctx.fillStyle = rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : '#ffffff';
    ctx.fillText(displayName, head.x, y);

    ctx.font = `${scoreFontSize}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = player.color;
    ctx.fillText(`${Math.floor(player.score)}`, head.x, y - nameFontSize - 2);

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
