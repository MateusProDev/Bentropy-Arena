// ============================================================
// Bentropy Arena - Game Engine (Canvas Renderer)
// ============================================================

import type { Player, Food, DevilFruit, DevilFruitAbility, GameConfig, Vector2D } from '../types/game';
import { DEFAULT_CONFIG } from '../types/game';

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

  // Online mode: when true, collision detection is server-authoritative
  public isOnlineMode = false;

  // Callbacks
  public onMove: ((direction: Vector2D, position: Vector2D, boosting: boolean) => void) | null = null;
  public onBoost: ((boosting: boolean) => void) | null = null;
  public onFoodEaten: ((foodId: string) => void) | null = null;
  public onDevilFruitEaten: ((fruitId: string, ability: DevilFruitAbility) => void) | null = null;
  public onDeath: (() => void) | null = null;
  public onScoreUpdate: ((score: number) => void) | null = null;
  public onAbilityExpired: (() => void) | null = null;

  // State refs
  private localPlayer: Player | null = null;
  private remotePlayers: Map<string, Player> = new Map();
  private foods: Food[] = [];
  private devilFruits: DevilFruit[] = [];
  private screenShake = 0;
  public killedByName: string | null = null;

  // Rankings: playerId -> rank (1-based)
  private playerRankings: Map<string, number> = new Map();

  constructor(canvas: HTMLCanvasElement, config?: GameConfig) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
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
    // Hexagonal dot grid — subtle, modern, dark
    const size = 80;
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = size;
    patternCanvas.height = Math.round(size * Math.sqrt(3) / 2);
    const pctx = patternCanvas.getContext('2d')!;
    const ph = patternCanvas.height;

    // Subtle dot at each hex vertex
    const drawDot = (x: number, y: number, r: number, alpha: number) => {
      pctx.fillStyle = `rgba(100, 140, 200, ${alpha})`;
      pctx.beginPath();
      pctx.arc(x, y, r, 0, Math.PI * 2);
      pctx.fill();
    };

    // Hex grid dots
    drawDot(0, 0, 1.2, 0.06);
    drawDot(size, 0, 1.2, 0.06);
    drawDot(size / 2, ph, 1.2, 0.06);
    drawDot(size / 2, ph / 2, 0.8, 0.03);

    // Faint hex connecting lines
    pctx.strokeStyle = 'rgba(80, 120, 180, 0.025)';
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
    this.update();
    this.render();
    this.animationId = requestAnimationFrame(this.gameLoop);
  };

  private update(): void {
    if (!this.localPlayer?.alive) return;

    const ability = this.localPlayer.activeAbility;

    // Fireboost ability: auto-boost without cost
    if (ability === 'fireboost') {
      this.isBoosting = true;
      this.localPlayer.boosting = true;
    }

    // Calculate direction
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
    const currentDir = this.localPlayer.direction;
    const newDir = {
      x: currentDir.x + (this.targetDirection.x - currentDir.x) * lerp,
      y: currentDir.y + (this.targetDirection.y - currentDir.y) * lerp,
    };
    const newDist = Math.sqrt(newDir.x * newDir.x + newDir.y * newDir.y);
    if (newDist > 0) {
      newDir.x /= newDist;
      newDir.y /= newDist;
    }
    this.localPlayer.direction = newDir;

    // Move snake — apply ability speed modifiers
    let speed = this.isBoosting ? this.config.boostSpeed : this.config.baseSpeed;
    if (ability === 'speed') speed *= 1.8;
    if (ability === 'fireboost') speed = this.config.boostSpeed * 1.3;

    const head = this.localPlayer.segments[0];
    const newHead = {
      x: head.x + newDir.x * speed,
      y: head.y + newDir.y * speed,
    };

    // World bounds
    const margin = 50;
    newHead.x = Math.max(margin, Math.min(this.config.worldSize - margin, newHead.x));
    newHead.y = Math.max(margin, Math.min(this.config.worldSize - margin, newHead.y));

    this.localPlayer.segments.unshift(newHead);

    while (this.localPlayer.segments.length > this.localPlayer.length) {
      this.localPlayer.segments.pop();
    }

    // Boost cost — aggressive: visibly shrinks the snake
    if (this.isBoosting && this.localPlayer.length > 8) {
      if (ability !== 'fireboost') {
        this.localPlayer.length -= 0.05; // ~3 length/sec at 60fps
        this.localPlayer.score = Math.max(0, this.localPlayer.score - 0.05);
      }
      const tail = this.localPlayer.segments[this.localPlayer.segments.length - 1];
      this.addParticle(tail.x, tail.y, ability === 'fireboost' ? '#f39c12' : this.localPlayer.color, 3);
    }

    this.localPlayer.boosting = this.isBoosting;

    // Magnet ability: attract nearby food
    if (ability === 'magnet') {
      const mHead = this.localPlayer.segments[0];
      const magnetRadius = 250;
      for (const food of this.foods) {
        const fdx = mHead.x - food.position.x;
        const fdy = mHead.y - food.position.y;
        const distSq = fdx * fdx + fdy * fdy;
        if (distSq < magnetRadius * magnetRadius && distSq > 1) {
          const fdist = Math.sqrt(distSq);
          const force = 4 * (1 - fdist / magnetRadius);
          food.position.x += (fdx / fdist) * force;
          food.position.y += (fdy / fdist) * force;
        }
      }
    }

    // In online mode, server handles collisions
    if (!this.isOnlineMode) {
      this.checkFoodCollisions();
      this.checkDevilFruitCollisions();
      this.checkPlayerCollisions();
    }

    // Dynamic zoom
    const playerLen = this.localPlayer.length;
    this.targetZoom = Math.max(0.45, Math.min(1.0, 1.0 / (1 + Math.max(0, playerLen - 10) * 0.0015)));
    this.zoom += (this.targetZoom - this.zoom) * 0.03;

    // Camera
    this.camera.x = newHead.x - this.canvas.width / (2 * this.zoom);
    this.camera.y = newHead.y - this.canvas.height / (2 * this.zoom);

    this.updateParticles();
    this.onMove?.(newDir, newHead, this.isBoosting);

    if (this.screenShake > 0) this.screenShake *= 0.9;
  }

  private checkFoodCollisions(): void {
    if (!this.localPlayer) return;
    const head = this.localPlayer.segments[0];
    const eatRadius = this.config.segmentSize * 2 + this.config.foodSize;

    for (let i = this.foods.length - 1; i >= 0; i--) {
      const food = this.foods[i];
      const dx = head.x - food.position.x;
      const dy = head.y - food.position.y;
      if (dx * dx + dy * dy < eatRadius * eatRadius) {
        this.localPlayer.score += food.value;
        this.localPlayer.length += this.config.growthRate;
        this.addParticle(food.position.x, food.position.y, food.color, 5);
        this.onFoodEaten?.(food.id);
        this.onScoreUpdate?.(this.localPlayer.score);
        this.foods.splice(i, 1);
      }
    }
  }

  private checkDevilFruitCollisions(): void {
    if (!this.localPlayer) return;
    const head = this.localPlayer.segments[0];
    const eatRadius = 28;

    for (let i = this.devilFruits.length - 1; i >= 0; i--) {
      const fruit = this.devilFruits[i];
      const dx = head.x - fruit.position.x;
      const dy = head.y - fruit.position.y;
      if (dx * dx + dy * dy < eatRadius * eatRadius) {
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

  private checkPlayerCollisions(): void {
    if (!this.localPlayer) return;
    const ability = this.localPlayer.activeAbility;

    // Phasing or freeze: completely immune to snake collisions
    if (ability === 'phasing' || ability === 'freeze') return;

    const head = this.localPlayer.segments[0];
    const collisionRadius = this.config.segmentSize;
    let collided = false;
    let killerName: string | null = null;

    this.remotePlayers.forEach((player) => {
      if (collided) return;
      if (!player.alive || player.id === this.localPlayer!.id) return;

      const otherHead = player.segments[0];
      if (otherHead) {
        const dhx = head.x - otherHead.x;
        const dhy = head.y - otherHead.y;
        if (Math.sqrt(dhx * dhx + dhy * dhy) < collisionRadius * 1.3) {
          collided = true;
          killerName = player.name;
          return;
        }
      }

      for (let i = 1; i < player.segments.length; i++) {
        const seg = player.segments[i];
        const dx = head.x - seg.x;
        const dy = head.y - seg.y;
        if (Math.sqrt(dx * dx + dy * dy) < collisionRadius) {
          collided = true;
          killerName = player.name;
          return;
        }
      }
    });

    if (collided) {
      // Resistance: survive 1 collision, bounce away
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

    // Dark gradient background with subtle blue/purple tint
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bgGrad.addColorStop(0, '#0d1225');
    bgGrad.addColorStop(0.5, '#0a0f1e');
    bgGrad.addColorStop(1, '#060a14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Very subtle vignette overlay
    const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.8);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

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
    this.renderFoods(ctx);
    this.renderDevilFruits(ctx);

    this.remotePlayers.forEach((player) => {
      if (player.alive && player.id !== this.localPlayer?.id) {
        this.renderSnake(ctx, player);
      }
    });

    if (this.localPlayer?.alive) {
      this.renderSnake(ctx, this.localPlayer, true);
    }

    this.renderParticles(ctx);

    this.remotePlayers.forEach((player) => {
      if (player.alive && player.id !== this.localPlayer?.id) {
        this.renderPlayerName(ctx, player);
      }
    });
    if (this.localPlayer?.alive) {
      this.renderPlayerName(ctx, this.localPlayer);
    }

    ctx.restore();
    ctx.restore();

    this.renderMinimap(ctx, w, h);
  }

  private renderGrid(ctx: CanvasRenderingContext2D): void {
    // Ambient glow around player position for depth
    if (this.localPlayer?.alive) {
      const head = this.localPlayer.segments[0];
      if (head) {
        const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 600);
        glow.addColorStop(0, 'rgba(60, 100, 180, 0.03)');
        glow.addColorStop(0.5, 'rgba(40, 70, 140, 0.015)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(head.x - 600, head.y - 600, 1200, 1200);
      }
    }

    if (this.gridPattern) {
      ctx.fillStyle = this.gridPattern;
      ctx.fillRect(0, 0, this.config.worldSize, this.config.worldSize);
    }
  }

  private renderWorldBorder(ctx: CanvasRenderingContext2D): void {
    const ws = this.config.worldSize;

    // Danger zone: gradient fade near border
    const dangerSize = 150;
    const dangerAlpha = 'rgba(239, 68, 68, 0.06)';
    const dangerClear = 'rgba(239, 68, 68, 0)';

    // Top
    const gTop = ctx.createLinearGradient(0, 0, 0, dangerSize);
    gTop.addColorStop(0, dangerAlpha); gTop.addColorStop(1, dangerClear);
    ctx.fillStyle = gTop; ctx.fillRect(0, 0, ws, dangerSize);
    // Bottom
    const gBot = ctx.createLinearGradient(0, ws, 0, ws - dangerSize);
    gBot.addColorStop(0, dangerAlpha); gBot.addColorStop(1, dangerClear);
    ctx.fillStyle = gBot; ctx.fillRect(0, ws - dangerSize, ws, dangerSize);
    // Left
    const gLeft = ctx.createLinearGradient(0, 0, dangerSize, 0);
    gLeft.addColorStop(0, dangerAlpha); gLeft.addColorStop(1, dangerClear);
    ctx.fillStyle = gLeft; ctx.fillRect(0, 0, dangerSize, ws);
    // Right
    const gRight = ctx.createLinearGradient(ws, 0, ws - dangerSize, 0);
    gRight.addColorStop(0, dangerAlpha); gRight.addColorStop(1, dangerClear);
    ctx.fillStyle = gRight; ctx.fillRect(ws - dangerSize, 0, dangerSize, ws);

    // Border line
    ctx.strokeStyle = '#ef444480';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 15;
    ctx.strokeRect(5, 5, ws - 10, ws - 10);
    ctx.shadowBlur = 0;

    // Corner markers
    const corners = [[0, 0], [ws, 0], [0, ws], [ws, ws]];
    corners.forEach(([cx, cy]) => {
      ctx.fillStyle = '#ef444460';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private renderFoods(ctx: CanvasRenderingContext2D): void {
    const camX = this.camera.x;
    const camY = this.camera.y;
    const w = this.canvas.width / this.zoom;
    const h = this.canvas.height / this.zoom;
    const foodMargin = 50;

    this.foods.forEach((food) => {
      if (
        food.position.x < camX - foodMargin || food.position.x > camX + w + foodMargin ||
        food.position.y < camY - foodMargin || food.position.y > camY + h + foodMargin
      ) return;

      const pulse = 1 + Math.sin(Date.now() * 0.005 + food.position.x) * 0.15;
      const size = food.size * pulse;

      ctx.fillStyle = food.color + '30';
      ctx.beginPath();
      ctx.arc(food.position.x, food.position.y, size * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = food.color;
      ctx.beginPath();
      ctx.arc(food.position.x, food.position.y, size, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(food.position.x - size * 0.2, food.position.y - size * 0.2, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private renderDevilFruits(ctx: CanvasRenderingContext2D): void {
    const camX = this.camera.x;
    const camY = this.camera.y;
    const w = this.canvas.width / this.zoom;
    const h = this.canvas.height / this.zoom;
    const dfMargin = 100;

    this.devilFruits.forEach((fruit) => {
      if (
        fruit.position.x < camX - dfMargin || fruit.position.x > camX + w + dfMargin ||
        fruit.position.y < camY - dfMargin || fruit.position.y > camY + h + dfMargin
      ) return;

      const time = Date.now() * 0.003;
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

      // Swirl pattern (One Piece signature)
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
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
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
    });
  }

  private renderSnake(ctx: CanvasRenderingContext2D, player: Player, isLocal = false): void {
    const segments = player.segments;
    if (segments.length < 2) return;

    const segSize = this.config.segmentSize;
    const color = player.color;
    const ability = player.activeAbility;

    // Dynamic thickness: snakes get thicker as they grow
    const thicknessMult = 1 + Math.min(player.length, 500) / 250;
    const baseSize = segSize * thicknessMult;

    ctx.shadowBlur = 0;

    // Ability visual: invisibility
    if (ability === 'invisibility') {
      ctx.globalAlpha = isLocal ? 0.25 : 0.08;
    }
    // Ability visual: phasing shimmer
    if (ability === 'phasing') {
      const phaseCycle = (Date.now() % 600) / 600;
      ctx.globalAlpha = 0.4 + Math.sin(phaseCycle * Math.PI * 2) * 0.3;
    }

    // Viewport culling
    const camX = this.camera.x;
    const camY = this.camera.y;
    const vw = this.canvas.width / this.zoom;
    const vh = this.canvas.height / this.zoom;
    const cullMargin = baseSize * 3;

    const skipInterval = segments.length > 150 ? 2 : 1;

    // Ability glow
    let abilityGlow: string | null = null;
    if (ability === 'freeze') abilityGlow = '#85c1e9';
    if (ability === 'fireboost') abilityGlow = '#f39c12';
    if (ability === 'speed') abilityGlow = '#f9e547';
    if (ability === 'phasing') abilityGlow = '#58d68d';
    if (ability === 'resistance') abilityGlow = '#ff6b6b';
    if (ability === 'magnet') abilityGlow = '#5d6d7e';

    // Body glow
    if (isLocal || player.boosting || abilityGlow) {
      ctx.shadowColor = abilityGlow || color;
      ctx.shadowBlur = abilityGlow
        ? 15 + Math.sin(Date.now() * 0.005) * 8
        : (player.boosting ? 20 : 10);
    }

    // Draw body segments
    for (let i = segments.length - 1; i >= 0; i--) {
      if (skipInterval > 1 && i > 10 && i % skipInterval !== 0) continue;

      const seg = segments[i];
      if (seg.x < camX - cullMargin || seg.x > camX + vw + cullMargin ||
          seg.y < camY - cullMargin || seg.y > camY + vh + cullMargin) continue;

      const t = 1 - i / segments.length;
      const size = baseSize * (0.5 + t * 0.5) * (skipInterval > 1 && i > 10 ? 1.3 : 1);
      const alpha = 0.5 + t * 0.5;
      const isPattern = i % 3 === 0;

      if (ability === 'freeze') {
        ctx.fillStyle = isPattern
          ? this.lightenColor('#3498db', 30)
          : this.adjustAlpha('#3498db', alpha * 0.7);
      } else {
        ctx.fillStyle = isPattern
          ? this.lightenColor(color, 30)
          : this.adjustAlpha(color, alpha);
      }

      ctx.beginPath();
      ctx.arc(seg.x, seg.y, size, 0, Math.PI * 2);
      ctx.fill();

      if (i < 20) {
        ctx.strokeStyle = abilityGlow
          ? this.adjustAlpha(abilityGlow, 0.5)
          : this.darkenColor(color, 30);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.shadowBlur = 0;

    // Head — scales with thickness
    const head = segments[0];
    const headSize = baseSize * 1.3;

    ctx.shadowColor = abilityGlow || color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = ability === 'freeze'
      ? this.lightenColor('#3498db', 40)
      : this.lightenColor(color, 40);
    ctx.beginPath();
    ctx.arc(head.x, head.y, headSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Eyes
    const dir = player.direction;
    const eyeOffset = headSize * 0.4;
    const perpX = -dir.y;
    const perpY = dir.x;

    const eyePositions = [
      { x: head.x + dir.x * eyeOffset * 0.5 + perpX * eyeOffset, y: head.y + dir.y * eyeOffset * 0.5 + perpY * eyeOffset },
      { x: head.x + dir.x * eyeOffset * 0.5 - perpX * eyeOffset, y: head.y + dir.y * eyeOffset * 0.5 - perpY * eyeOffset },
    ];

    eyePositions.forEach((eye) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, headSize * 0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(
        eye.x + dir.x * headSize * 0.1,
        eye.y + dir.y * headSize * 0.1,
        headSize * 0.15,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });

    // Boost effect
    if (player.boosting) {
      const tail = segments[segments.length - 1];
      const boostColor = ability === 'fireboost' ? '#f39c12' : color;
      for (let bi = 0; bi < 3; bi++) {
        ctx.fillStyle = `${boostColor}${Math.floor((0.3 - bi * 0.1) * 255).toString(16).padStart(2, '0')}`;
        ctx.beginPath();
        ctx.arc(
          tail.x + (Math.random() - 0.5) * 20,
          tail.y + (Math.random() - 0.5) * 20,
          baseSize * (0.4 - bi * 0.08),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    // Resistance shield ring
    if (ability === 'resistance') {
      ctx.strokeStyle = '#ff6b6b80';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(head.x, head.y, headSize * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Magnet gravity well indicator
    if (ability === 'magnet') {
      ctx.strokeStyle = '#5d6d7e40';
      ctx.lineWidth = 2;
      const magnetPulse = 1 + Math.sin(Date.now() * 0.004) * 0.3;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 250 * magnetPulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crown for top 3 players
    const rank = this.playerRankings.get(player.id);
    if (rank && rank <= 3) {
      this.renderCrown(ctx, head.x, head.y - headSize - 2, headSize * 0.7, rank);
    }

    ctx.globalAlpha = 1;
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

    // Crown prefix for top 3
    const rank = this.playerRankings.get(player.id);
    let prefix = '';
    if (rank === 1) prefix = '\u{1F451} ';
    else if (rank === 2) prefix = '\u{1FA99} ';
    else if (rank === 3) prefix = '\u{1F949} ';

    const displayName = prefix + player.name;

    ctx.font = `bold ${nameFontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
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
    // Crown colors: gold, silver, bronze
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

    // Subtle glow
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 8;

    // Crown shape
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

    // Small gems on crown tips
    const gems = [[-s * 0.8, -s * 0.4], [0, -s * 0.6], [s * 0.8, -s * 0.4]];
    gems.forEach(([gx, gy]) => {
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(gx, gy, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  private renderMinimap(ctx: CanvasRenderingContext2D, w: number, _h: number): void {
    const isMobile = w < 768;
    const mmSize = isMobile ? 90 : 140;
    const mmMargin = isMobile ? 8 : 14;
    const mmX = w - mmSize - mmMargin;
    const mmY = mmMargin;
    const scale = mmSize / this.config.worldSize;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mmX, mmY, mmSize, mmSize, isMobile ? 4 : 8);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.lineWidth = isMobile ? 1 : 2;
    ctx.strokeRect(mmX + 2, mmY + 2, mmSize - 4, mmSize - 4);

    // Food dots
    ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
    for (let i = 0; i < this.foods.length; i += 30) {
      const f = this.foods[i];
      if (!f) continue;
      ctx.fillRect(mmX + f.position.x * scale - 0.5, mmY + f.position.y * scale - 0.5, 1, 1);
    }

    // Devil fruit dots on minimap
    this.devilFruits.forEach((df) => {
      ctx.fillStyle = df.color;
      ctx.beginPath();
      ctx.arc(mmX + df.position.x * scale, mmY + df.position.y * scale, isMobile ? 2 : 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Remote players
    this.remotePlayers.forEach((player) => {
      if (!player.alive || !player.segments[0]) return;
      const dotSize = Math.min(2 + player.length * 0.02, 5);
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(mmX + player.segments[0].x * scale, mmY + player.segments[0].y * scale, dotSize, 0, Math.PI * 2);
      ctx.fill();
    });

    // Local player
    if (this.localPlayer?.alive && this.localPlayer.segments[0]) {
      const localDotSize = Math.min(3 + this.localPlayer.length * 0.02, 6);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(
        mmX + this.localPlayer.segments[0].x * scale,
        mmY + this.localPlayer.segments[0].y * scale,
        localDotSize,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mmX + this.camera.x * scale,
      mmY + this.camera.y * scale,
      (this.canvas.width / this.zoom) * scale,
      (this.canvas.height / this.zoom) * scale
    );

    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('MAP', mmX + 6, mmY + 14);
  }

  // ========================
  // Particles
  // ========================

  private addParticle(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
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

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    this.particles.forEach((p) => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // ========================
  // Color Utilities
  // ========================

  private lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + percent);
    const g = Math.min(255, ((num >> 8) & 0x00ff) + percent);
    const b = Math.min(255, (num & 0x0000ff) + percent);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private darkenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - percent);
    const g = Math.max(0, ((num >> 8) & 0x00ff) - percent);
    const b = Math.max(0, (num & 0x0000ff) - percent);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private adjustAlpha(hex: string, alpha: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = num >> 16;
    const g = (num >> 8) & 0x00ff;
    const b = num & 0x0000ff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  public triggerDeath(): void {
    if (!this.localPlayer) return;
    const head = this.localPlayer.segments[0];
    if (head) {
      this.localPlayer.alive = false;
      this.screenShake = 15;
      this.spawnDeathParticles(head.x, head.y, this.localPlayer.color);
    }
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
