// ============================================================
// Bentropy Arena - Game Engine (Canvas Renderer)
// ============================================================

import type { Player, Food, GameConfig, Vector2D } from '../types/game';
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

  // Online mode: when true, collision detection is server-authoritative
  public isOnlineMode = false;

  // Callbacks
  public onMove: ((direction: Vector2D, position: Vector2D, boosting: boolean) => void) | null = null;
  public onBoost: ((boosting: boolean) => void) | null = null;
  public onFoodEaten: ((foodId: string) => void) | null = null;
  public onDeath: (() => void) | null = null;
  public onScoreUpdate: ((score: number) => void) | null = null;

  // State refs
  private localPlayer: Player | null = null;
  private remotePlayers: Map<string, Player> = new Map();
  private foods: Food[] = [];
  private screenShake = 0;
  public killedByName: string | null = null;

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
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 60;
    patternCanvas.height = 60;
    const pctx = patternCanvas.getContext('2d')!;

    // Grid lines
    pctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    pctx.lineWidth = 1;
    pctx.beginPath();
    pctx.moveTo(60, 0);
    pctx.lineTo(60, 60);
    pctx.moveTo(0, 60);
    pctx.lineTo(60, 60);
    pctx.stroke();

    // Center dot
    pctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    pctx.beginPath();
    pctx.arc(30, 30, 1, 0, Math.PI * 2);
    pctx.fill();

    this.gridPattern = this.ctx.createPattern(patternCanvas, 'repeat');
  }

  // Mobile boost control (set by external UI button)
  public setMobileBoosting(boosting: boolean): void {
    this.isBoosting = boosting;
    this.onBoost?.(boosting);
  }

  // Mobile joystick direction (set by external UI joystick)
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

    // Touch support — touch ONLY controls direction, NOT boost
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.mousePos = { x: touch.clientX, y: touch.clientY };
    }, { passive: false });

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.mousePos = { x: touch.clientX, y: touch.clientY };
      // Do NOT activate boost on touch — there's a dedicated boost button
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => {
      // Do NOT deactivate boost on touchend — managed by the dedicated button
    });
  }

  public updateState(player: Player | null, players: Map<string, Player>, foods: Food[]): void {
    this.localPlayer = player;
    this.remotePlayers = players;
    this.foods = foods;
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

    // Calculate direction from joystick (mobile) or mouse position (desktop)
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

    // Move snake
    const speed = this.isBoosting ? this.config.boostSpeed : this.config.baseSpeed;
    const head = this.localPlayer.segments[0];
    const newHead = {
      x: head.x + newDir.x * speed,
      y: head.y + newDir.y * speed,
    };

    // World bounds
    const margin = 50;
    newHead.x = Math.max(margin, Math.min(this.config.worldSize - margin, newHead.x));
    newHead.y = Math.max(margin, Math.min(this.config.worldSize - margin, newHead.y));

    // Add new head
    this.localPlayer.segments.unshift(newHead);

    // Remove tail segments to maintain length
    while (this.localPlayer.segments.length > this.localPlayer.length) {
      this.localPlayer.segments.pop();
    }

    // Boost cost
    if (this.isBoosting && this.localPlayer.length > 8) {
      this.localPlayer.length -= this.config.boostCost * 0.015;
      // Add boost particles
      const tail = this.localPlayer.segments[this.localPlayer.segments.length - 1];
      this.addParticle(tail.x, tail.y, this.localPlayer.color, 3);
    }

    this.localPlayer.boosting = this.isBoosting;

    // In online mode, server handles collisions
    if (!this.isOnlineMode) {
      this.checkFoodCollisions();
      this.checkPlayerCollisions();
    }

    // Update camera to follow player
    this.camera.x = newHead.x - this.canvas.width / 2;
    this.camera.y = newHead.y - this.canvas.height / 2;

    // Update particles
    this.updateParticles();

    // Emit move
    this.onMove?.(newDir, newHead, this.isBoosting);

    // Screen shake decay
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
      const distSq = dx * dx + dy * dy;

      if (distSq < eatRadius * eatRadius) {
        this.localPlayer.score += food.value;
        this.localPlayer.length += this.config.growthRate;
        this.addParticle(food.position.x, food.position.y, food.color, 5);
        this.onFoodEaten?.(food.id);
        this.onScoreUpdate?.(this.localPlayer.score);
        this.foods.splice(i, 1);
      }
    }
  }

  private checkPlayerCollisions(): void {
    if (!this.localPlayer) return;
    const head = this.localPlayer.segments[0];
    const collisionRadius = this.config.segmentSize;

    // Check collision with other players' bodies
    this.remotePlayers.forEach((player) => {
      if (!player.alive || player.id === this.localPlayer!.id) return;

      // Head-to-head collision
      const otherHead = player.segments[0];
      if (otherHead) {
        const dhx = head.x - otherHead.x;
        const dhy = head.y - otherHead.y;
        if (Math.sqrt(dhx * dhx + dhy * dhy) < collisionRadius * 1.3) {
          this.localPlayer!.alive = false;
          this.killedByName = player.name;
          this.screenShake = 15;
          this.spawnDeathParticles(head.x, head.y, this.localPlayer!.color);
          this.onDeath?.();
          return;
        }
      }

      for (let i = 1; i < player.segments.length; i++) {
        const seg = player.segments[i];
        const dx = head.x - seg.x;
        const dy = head.y - seg.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < collisionRadius * 1.0) {
          this.localPlayer!.alive = false;
          this.killedByName = player.name;
          this.screenShake = 15;
          this.spawnDeathParticles(head.x, head.y, this.localPlayer!.color);
          this.onDeath?.();
          return;
        }
      }
    });

    // Self-collision (only check segments far from head to avoid false positives on turns)
    if (this.localPlayer.segments.length > 60) {
      for (let i = 50; i < this.localPlayer.segments.length; i++) {
        const seg = this.localPlayer.segments[i];
        const dx = head.x - seg.x;
        const dy = head.y - seg.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < collisionRadius * 0.4) {
          this.localPlayer.alive = false;
          this.screenShake = 15;
          this.spawnDeathParticles(head.x, head.y, this.localPlayer.color);
          this.onDeath?.();
          return;
        }
      }
    }

    // World boundary collision
    const head2 = this.localPlayer.segments[0];
    if (
      head2.x <= 10 || head2.x >= this.config.worldSize - 10 ||
      head2.y <= 10 || head2.y >= this.config.worldSize - 10
    ) {
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

    // Clear
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, w, h);

    // Apply screen shake
    ctx.save();
    if (this.screenShake > 0.5) {
      ctx.translate(
        (Math.random() - 0.5) * this.screenShake,
        (Math.random() - 0.5) * this.screenShake
      );
    }

    // Apply camera transform
    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);

    // Render grid
    this.renderGrid(ctx);

    // Render world border
    this.renderWorldBorder(ctx);

    // Render food
    this.renderFoods(ctx);

    // Render remote players
    this.remotePlayers.forEach((player) => {
      if (player.alive && player.id !== this.localPlayer?.id) {
        this.renderSnake(ctx, player);
      }
    });

    // Render local player
    if (this.localPlayer?.alive) {
      this.renderSnake(ctx, this.localPlayer, true);
    }

    // Render particles
    this.renderParticles(ctx);

    // Render player names
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

    // UI overlay
    this.renderMinimap(ctx, w, h);
  }

  private renderGrid(ctx: CanvasRenderingContext2D): void {
    if (this.gridPattern) {
      ctx.fillStyle = this.gridPattern;
      ctx.fillRect(0, 0, this.config.worldSize, this.config.worldSize);
    }
  }

  private renderWorldBorder(ctx: CanvasRenderingContext2D): void {
    const ws = this.config.worldSize;

    // Danger zone gradient at borders
    const gradient = ctx.createLinearGradient(0, 0, 100, 0);
    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');

    // Border line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 20;
    ctx.strokeRect(5, 5, ws - 10, ws - 10);
    ctx.shadowBlur = 0;

    // Corner markers
    const corners = [[0, 0], [ws, 0], [0, ws], [ws, ws]];
    corners.forEach(([cx, cy]) => {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private renderFoods(ctx: CanvasRenderingContext2D): void {
    const camX = this.camera.x;
    const camY = this.camera.y;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const margin = 50;

    this.foods.forEach((food) => {
      // Culling
      if (
        food.position.x < camX - margin || food.position.x > camX + w + margin ||
        food.position.y < camY - margin || food.position.y > camY + h + margin
      ) return;

      const pulse = 1 + Math.sin(Date.now() * 0.005 + food.position.x) * 0.15;
      const size = food.size * pulse;

      // Outer glow (cheap alternative to shadowBlur)
      ctx.fillStyle = food.color + '30';
      ctx.beginPath();
      ctx.arc(food.position.x, food.position.y, size * 2, 0, Math.PI * 2);
      ctx.fill();

      // Main body
      ctx.fillStyle = food.color;
      ctx.beginPath();
      ctx.arc(food.position.x, food.position.y, size, 0, Math.PI * 2);
      ctx.fill();

      // Inner highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(food.position.x - size * 0.2, food.position.y - size * 0.2, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private renderSnake(ctx: CanvasRenderingContext2D, player: Player, isLocal = false): void {
    const segments = player.segments;
    if (segments.length < 2) return;

    const segSize = this.config.segmentSize;
    const color = player.color;

    // Reset shadow state
    ctx.shadowBlur = 0;

    // Viewport culling for large snakes
    const camX = this.camera.x;
    const camY = this.camera.y;
    const vw = this.canvas.width;
    const vh = this.canvas.height;
    const cullMargin = segSize * 3;

    // For big snakes (>100 segments), skip every other segment when far from head
    const skipInterval = segments.length > 150 ? 2 : 1;

    // Body glow (only for local player or boosting)
    if (isLocal || player.boosting) {
      ctx.shadowColor = color;
      ctx.shadowBlur = player.boosting ? 20 : 10;
    }

    // Draw body segments
    for (let i = segments.length - 1; i >= 0; i--) {
      // Skip segments for performance on huge snakes
      if (skipInterval > 1 && i > 10 && i % skipInterval !== 0) continue;

      const seg = segments[i];

      // Cull off-screen segments
      if (seg.x < camX - cullMargin || seg.x > camX + vw + cullMargin ||
          seg.y < camY - cullMargin || seg.y > camY + vh + cullMargin) continue;

      const t = 1 - i / segments.length;
      const size = segSize * (0.6 + t * 0.4) * (skipInterval > 1 && i > 10 ? 1.3 : 1);
      const alpha = 0.5 + t * 0.5;

      const isPattern = i % 3 === 0;

      ctx.fillStyle = isPattern
        ? this.lightenColor(color, 30)
        : this.adjustAlpha(color, alpha);

      ctx.beginPath();
      ctx.arc(seg.x, seg.y, size, 0, Math.PI * 2);
      ctx.fill();

      // Only outline near the head for performance
      if (i < 20) {
        ctx.strokeStyle = this.darkenColor(color, 30);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.shadowBlur = 0;

    // Head
    const head = segments[0];
    const headSize = segSize * 1.3;

    // Head glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = this.lightenColor(color, 40);
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
      // White
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, headSize * 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Pupil
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
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = `${color}${Math.floor((0.3 - i * 0.1) * 255).toString(16).padStart(2, '0')}`;
        ctx.beginPath();
        ctx.arc(
          tail.x + (Math.random() - 0.5) * 20,
          tail.y + (Math.random() - 0.5) * 20,
          segSize * (0.5 - i * 0.1),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
  }

  private renderPlayerName(ctx: CanvasRenderingContext2D, player: Player): void {
    const head = player.segments[0];
    if (!head) return;

    const y = head.y - this.config.segmentSize * 2.5;

    // Name
    ctx.font = 'bold 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillText(player.name, head.x + 1, y + 1);

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(player.name, head.x, y);

    // Score
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillStyle = player.color;
    ctx.fillText(`${Math.floor(player.score)}`, head.x, y - 16);
  }

  private renderMinimap(ctx: CanvasRenderingContext2D, w: number, _h: number): void {
    const isMobile = w < 768;
    const mmSize = isMobile ? 90 : 140;
    const mmMargin = isMobile ? 8 : 14;
    const mmX = w - mmSize - mmMargin;
    const mmY = mmMargin;
    const scale = mmSize / this.config.worldSize;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mmX, mmY, mmSize, mmSize, isMobile ? 4 : 8);
    ctx.fill();
    ctx.stroke();

    // Border danger zone indicators
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.lineWidth = isMobile ? 1 : 2;
    ctx.strokeRect(mmX + 2, mmY + 2, mmSize - 4, mmSize - 4);

    // Food clusters (just a few dots for ambience)
    ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
    for (let i = 0; i < this.foods.length; i += 30) {
      const f = this.foods[i];
      if (!f) continue;
      ctx.fillRect(
        mmX + f.position.x * scale - 0.5,
        mmY + f.position.y * scale - 0.5,
        1, 1
      );
    }

    // Remote players (size proportional to their length)
    this.remotePlayers.forEach((player) => {
      if (!player.alive || !player.segments[0]) return;
      const dotSize = Math.min(2 + player.length * 0.02, 5);
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(
        mmX + player.segments[0].x * scale,
        mmY + player.segments[0].y * scale,
        dotSize,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });

    // Local player (white, always visible)
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

    // Viewport indicator
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mmX + this.camera.x * scale,
      mmY + this.camera.y * scale,
      this.canvas.width * scale,
      this.canvas.height * scale
    );

    // Minimap label
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.textAlign = 'left';
    ctx.fillText('MAP', mmX + 6, mmY + 14);
  }

  // ========================
  // Particles
  // ========================

  private addParticle(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
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
        x,
        y,
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
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
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

  /** Trigger death effects (for server-authoritative deaths) */
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
