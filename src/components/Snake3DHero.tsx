import { useEffect, useRef, useCallback } from 'react';

// Helpers
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }
function hsl(h: number, s: number, l: number, a = 1) { return `hsla(${h % 360},${s}%,${l}%,${a})`; }
function seededRandom(seed: number): number { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number; }
interface FloatingScore { x: number; y: number; text: string; life: number; maxLife: number; color: string; vx: number; vy: number; scale: number; }
interface Crystal { x: number; y: number; size: number; hue: number; phase: number; pts: number; }
interface Coin { x: number; y: number; size: number; phase: number; speed: number; }

export default function Snake3DHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const timeRef = useRef(0);
  const stateRef = useRef<{
    particles: Particle[]; scores: FloatingScore[]; crystals: Crystal[]; coins: Coin[]; init: boolean;
  }>({ particles: [], scores: [], crystals: [], coins: [], init: false });

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const W = rect.width; const H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t = timeRef.current;
    const state = stateRef.current;
    const S = Math.min(W, H);

    // Init persistent objects once
    if (!state.init) {
      for (let i = 0; i < 8; i++) {
        state.crystals.push({
          x: seededRandom(i * 7 + 1) * W, y: seededRandom(i * 7 + 2) * H,
          size: S * (0.03 + seededRandom(i * 7 + 3) * 0.04),
          hue: 260 + seededRandom(i * 7 + 4) * 40,
          phase: seededRandom(i * 7 + 5) * Math.PI * 2,
          pts: 4 + Math.floor(seededRandom(i * 7 + 6) * 3),
        });
      }
      for (let i = 0; i < 12; i++) {
        state.coins.push({
          x: seededRandom(i * 11 + 50) * W, y: seededRandom(i * 11 + 51) * H,
          size: S * (0.015 + seededRandom(i * 11 + 52) * 0.012),
          phase: seededRandom(i * 11 + 53) * Math.PI * 2,
          speed: 0.5 + seededRandom(i * 11 + 54) * 1.5,
        });
      }
      state.init = true;
    }

    // Spawn spark particles
    if (Math.random() < 0.4) {
      state.particles.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 1.5, vy: -Math.random() * 2 - 0.5,
        life: 0, maxLife: 40 + Math.random() * 60,
        size: S * (0.003 + Math.random() * 0.005),
        hue: [30, 50, 180, 280, 340][Math.floor(Math.random() * 5)],
      });
    }
    // Spawn floating score
    if (Math.random() < 0.012) {
      const texts = ['+100', '+200', '+300', '+450', '+500', '+750', '+1000'];
      const colors = ['#ffdd44', '#44ff88', '#44ddff', '#ff6644', '#ff44cc', '#88ff44'];
      state.scores.push({
        x: W * 0.1 + Math.random() * W * 0.8, y: H * 0.15 + Math.random() * H * 0.55,
        text: texts[Math.floor(Math.random() * texts.length)],
        life: 0, maxLife: 90,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 0.8, vy: -1.2 - Math.random() * 0.8,
        scale: 0.7 + Math.random() * 0.6,
      });
    }

    // === BACKGROUND ===
    const bgGrad = ctx.createRadialGradient(W / 2, H * 0.45, S * 0.1, W / 2, H / 2, S * 0.9);
    bgGrad.addColorStop(0, '#1a0a2e'); bgGrad.addColorStop(0.4, '#0d0d2b');
    bgGrad.addColorStop(0.7, '#060618'); bgGrad.addColorStop(1, '#020208');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = '#6644ff'; ctx.lineWidth = 1;
    const gs = S * 0.06;
    for (let gx = 0; gx < W + gs; gx += gs) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = 0; gy < H + gs; gy += gs) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    ctx.restore();

    // Crystals
    for (const cr of state.crystals) {
      const bob = Math.sin(t * 1.2 + cr.phase) * S * 0.008;
      const glow = 0.4 + Math.sin(t * 1.5 + cr.phase) * 0.2;
      ctx.save(); ctx.shadowColor = hsl(cr.hue, 100, 60, 0.8); ctx.shadowBlur = cr.size * 2;
      ctx.fillStyle = hsl(cr.hue, 80, 50, glow);
      ctx.beginPath();
      for (let p = 0; p < cr.pts; p++) {
        const a = (p / cr.pts) * Math.PI * 2 - Math.PI / 2;
        const r = (p % 2 === 0) ? cr.size : cr.size * 0.55;
        const px = cr.x + Math.cos(a) * r; const py = cr.y + bob + Math.sin(a) * r;
        if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      const ig = ctx.createRadialGradient(cr.x, cr.y + bob, 0, cr.x, cr.y + bob, cr.size * 0.5);
      ig.addColorStop(0, hsl(cr.hue, 100, 85, 0.7)); ig.addColorStop(1, hsl(cr.hue, 100, 60, 0));
      ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(cr.x, cr.y + bob, cr.size * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Coins
    for (const coin of state.coins) {
      const bob = Math.sin(t * coin.speed + coin.phase) * S * 0.012;
      const sq = 0.4 + Math.abs(Math.sin(t * coin.speed * 0.8 + coin.phase)) * 0.6;
      ctx.save(); ctx.shadowColor = '#ffd700'; ctx.shadowBlur = coin.size * 1.5;
      ctx.fillStyle = '#ffd700'; ctx.beginPath();
      ctx.ellipse(coin.x, coin.y + bob, coin.size * sq, coin.size, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = coin.size * 0.15; ctx.beginPath();
      ctx.ellipse(coin.x, coin.y + bob, coin.size * sq * 0.65, coin.size * 0.65, 0, 0, Math.PI * 2); ctx.stroke();
      if (sq > 0.5) {
        ctx.fillStyle = '#cc8800'; ctx.font = `bold ${Math.round(coin.size * 1.1)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', coin.x, coin.y + bob + coin.size * 0.05);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath();
      ctx.ellipse(coin.x - coin.size * 0.15 * sq, coin.y + bob - coin.size * 0.2, coin.size * 0.2 * sq, coin.size * 0.15, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Background particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i]; p.x += p.vx; p.y += p.vy; p.life++;
      if (p.life >= p.maxLife) { state.particles.splice(i, 1); continue; }
      const alpha = 1 - p.life / p.maxLife;
      ctx.fillStyle = hsl(p.hue, 100, 70, alpha * 0.7);
      ctx.shadowColor = hsl(p.hue, 100, 60, alpha * 0.5); ctx.shadowBlur = p.size * 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - p.life / p.maxLife * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    // ╔═══════════════════════════════════════════════════════════╗
    // ║   SNAKE — Viper/Dragon Stealth-Fighter Mascot           ║
    // ╚═══════════════════════════════════════════════════════════╝
    const SEGS = 32;
    const snakeScale = S * 0.65;
    const segLen = snakeScale / SEGS;
    const cx = W / 2;
    const cy = H * 0.44;

    // Build aggressive S-curve path — head rears up like striking viper
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const f = i / (SEGS - 1);
      const wave = Math.sin(f * Math.PI * 2.4 + t * 0.9) * snakeScale * 0.32;
      const spine = (f - 0.5) * snakeScale * 0.82;
      // Head rears upward aggressively
      const rearUp = f < 0.12 ? (1 - f / 0.12) * snakeScale * 0.13 : 0;
      // Angular zigzag kinks
      const kink = ((i % 2) * 2 - 1) * snakeScale * 0.055 * Math.max(0, 1 - Math.abs(f - 0.45) * 1.6);
      const undulate = Math.sin(t * 2.0 + f * 6) * snakeScale * 0.01;
      pts.push({ x: cx + wave + kink + undulate, y: cy + spine - rearUp });
    }

    // Per-segment info (angle, thickness)
    const seg: { x: number; y: number; a: number; w: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const nx = pts[Math.min(i + 1, SEGS - 1)];
      const pv = pts[Math.max(i - 1, 0)];
      const a = Math.atan2(nx.y - pv.y, nx.x - pv.x);
      const f = i / (SEGS - 1);
      let w: number;
      if (f < 0.05) w = lerp(0.6, 1.0, f / 0.05);
      else if (f < 0.18) w = 1.0;
      else w = lerp(1.0, 0.08, (f - 0.18) / 0.82);
      w *= segLen * 1.0;
      seg.push({ ...pts[i], a, w });
    }

    // ── Neon energy aura (pulsing orange glow behind body) ──
    ctx.save();
    ctx.globalAlpha = 0.20 + Math.sin(t * 2.5) * 0.06;
    for (let i = 0; i < SEGS; i += 2) {
      const s = seg[i];
      const r = s.w * (3.0 + Math.sin(t * 3 + i * 0.5) * 0.5);
      const g = ctx.createRadialGradient(s.x, s.y, s.w * 0.2, s.x, s.y, r);
      g.addColorStop(0, 'rgba(255,100,0,0.30)');
      g.addColorStop(0.6, 'rgba(255,60,0,0.08)');
      g.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();

    // ── Speed trail streaks ──
    ctx.save();
    for (let i = Math.floor(SEGS * 0.3); i < SEGS; i += 2) {
      const s = seg[i]; const f = i / SEGS;
      const len = s.w * (3 + f * 6);
      ctx.strokeStyle = hsl(20, 100, 60, (1 - f) * 0.35);
      ctx.lineWidth = s.w * 0.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - Math.cos(s.a) * len, s.y - Math.sin(s.a) * len);
      ctx.stroke();
    }
    ctx.restore();

    // ── Tail trail particles ──
    const tailSeg = seg[SEGS - 1];
    if (Math.random() < 0.55) {
      state.particles.push({
        x: tailSeg.x + (Math.random() - 0.5) * tailSeg.w * 3,
        y: tailSeg.y + (Math.random() - 0.5) * tailSeg.w,
        vx: -Math.cos(tailSeg.a) * 1.6 + (Math.random() - 0.5),
        vy: -Math.sin(tailSeg.a) * 1.6 + (Math.random() - 0.5),
        life: 0, maxLife: 22 + Math.random() * 25, size: S * (0.003 + Math.random() * 0.005), hue: 25,
      });
    }

    // ── BODY: Overlapping rhombus armor plates (back→front) ──
    for (let i = SEGS - 1; i >= 1; i--) {
      const s = seg[i]; const w = s.w;
      if (w < 0.4) continue;
      const isCyan = i % 2 === 0;
      const hue = isCyan ? 185 : 14;
      const sat = 100;
      const lit = isCyan ? 50 : 54;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);

      // Glow per segment
      ctx.shadowColor = hsl(hue, 100, 60, 0.85);
      ctx.shadowBlur = w * 2.0;

      // Rhombus / arrow-plate shape (pointed front & back, wide sides)
      const pFront = w * 1.15; // front point length
      const pBack = w * 0.85;  // back indent length
      const pSide = w * 1.0;   // side width

      // Dark outline plate (slightly bigger)
      const oScale = 1.2;
      ctx.fillStyle = '#06061a';
      ctx.beginPath();
      ctx.moveTo(pFront * oScale, 0);
      ctx.lineTo(0, -pSide * oScale);
      ctx.lineTo(-pBack * oScale, 0);
      ctx.lineTo(0, pSide * oScale);
      ctx.closePath(); ctx.fill();

      // Gradient fill plate
      const pg = ctx.createLinearGradient(-pBack, -pSide, pFront, pSide);
      pg.addColorStop(0, hsl(hue, sat, lit - 15));
      pg.addColorStop(0.3, hsl(hue, sat, lit));
      pg.addColorStop(0.6, hsl(hue, sat, lit + 20));
      pg.addColorStop(1, hsl(hue, sat, lit));
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(pFront, 0);
      ctx.lineTo(0, -pSide);
      ctx.lineTo(-pBack, 0);
      ctx.lineTo(0, pSide);
      ctx.closePath(); ctx.fill();

      // Top facet highlight (hard edge)
      ctx.fillStyle = hsl(hue, 100, 90, 0.22);
      ctx.beginPath();
      ctx.moveTo(pFront * 0.9, 0);
      ctx.lineTo(pFront * 0.15, -pSide * 0.85);
      ctx.lineTo(-pBack * 0.2, -pSide * 0.3);
      ctx.lineTo(pFront * 0.35, 0);
      ctx.closePath(); ctx.fill();

      // Neon edge line (bottom edge glow)
      ctx.strokeStyle = hsl(hue, 100, 75, 0.45 + Math.sin(t * 3 + i) * 0.15);
      ctx.lineWidth = w * 0.06;
      ctx.beginPath();
      ctx.moveTo(pFront * 0.7, 0);
      ctx.lineTo(0, pSide * 0.9);
      ctx.lineTo(-pBack * 0.6, 0);
      ctx.stroke();

      // Energy vein pulse on every 4th segment
      if (i % 4 === 0 && i > 2 && i < SEGS - 3) {
        ctx.strokeStyle = hsl(45, 100, 80, 0.55 + Math.sin(t * 4.5 + i) * 0.3);
        ctx.lineWidth = w * 0.09; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-pBack * 0.3, 0);
        ctx.lineTo(pFront * 0.5, 0);
        ctx.stroke();
      }

      ctx.restore();
    }

    // ╔═══════════════════════════════════════════════════════════╗
    // ║  HEAD — Viper Arrowhead / Stealth Fighter               ║
    // ║  Flat top, razor snout, angular jaw — ZERO curves        ║
    // ╚═══════════════════════════════════════════════════════════╝
    const hd = seg[0];
    const HR = hd.w * 3.2; // BIG head relative to body
    const hx = hd.x; const hy = hd.y; const hAng = hd.a;

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(hAng);

    // ── Head glow ──
    ctx.shadowColor = '#00eeff';
    ctx.shadowBlur = HR * 1.8;

    // ── Arrowhead outline (thick dark border) ──
    ctx.fillStyle = '#05051a';
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(HR * 1.45, 0);                 // Razor tip (extremely sharp)
    ctx.lineTo(HR * 0.50, -HR * 0.88);        // Upper blade edge
    ctx.lineTo(-HR * 0.10, -HR * 0.92);       // Top ridge
    ctx.lineTo(-HR * 0.70, -HR * 0.55);       // Back-top notch
    ctx.lineTo(-HR * 0.95, -HR * 0.20);       // Neck join top
    ctx.lineTo(-HR * 1.0, 0);                 // Nape center
    ctx.lineTo(-HR * 0.95, HR * 0.20);        // Neck join bottom
    ctx.lineTo(-HR * 0.70, HR * 0.55);        // Back-bottom notch
    ctx.lineTo(-HR * 0.10, HR * 0.92);        // Bottom ridge
    ctx.lineTo(HR * 0.50, HR * 0.88);         // Lower blade edge
    ctx.closePath();
    ctx.fill();

    // ── Head fill — multi-tone gradient ──
    const hGrd = ctx.createLinearGradient(-HR * 0.8, -HR * 0.7, HR * 1.2, HR * 0.5);
    hGrd.addColorStop(0, '#004466');
    hGrd.addColorStop(0.25, '#0099aa');
    hGrd.addColorStop(0.5, '#22ddee');
    hGrd.addColorStop(0.7, '#55ffff');
    hGrd.addColorStop(1, '#0088aa');
    ctx.fillStyle = hGrd;
    ctx.beginPath();
    ctx.moveTo(HR * 1.35, 0);
    ctx.lineTo(HR * 0.45, -HR * 0.80);
    ctx.lineTo(-HR * 0.08, -HR * 0.84);
    ctx.lineTo(-HR * 0.65, -HR * 0.48);
    ctx.lineTo(-HR * 0.88, -HR * 0.17);
    ctx.lineTo(-HR * 0.92, 0);
    ctx.lineTo(-HR * 0.88, HR * 0.17);
    ctx.lineTo(-HR * 0.65, HR * 0.48);
    ctx.lineTo(-HR * 0.08, HR * 0.84);
    ctx.lineTo(HR * 0.45, HR * 0.80);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Top facet specular (flat angular highlight) ──
    ctx.fillStyle = 'rgba(180,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(HR * 1.2, 0);
    ctx.lineTo(HR * 0.38, -HR * 0.72);
    ctx.lineTo(-HR * 0.55, -HR * 0.38);
    ctx.lineTo(HR * 0.05, -HR * 0.05);
    ctx.closePath(); ctx.fill();

    // ── Center ridge line (viper crease) ──
    ctx.strokeStyle = 'rgba(0,255,255,0.35)';
    ctx.lineWidth = HR * 0.04; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(HR * 1.25, 0);
    ctx.lineTo(-HR * 0.7, 0);
    ctx.stroke();

    // ── Side armor lines ──
    ctx.strokeStyle = 'rgba(0,200,255,0.20)';
    ctx.lineWidth = HR * 0.025;
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(HR * 0.9, HR * 0.12 * sd);
      ctx.lineTo(HR * 0.35, HR * 0.65 * sd);
      ctx.lineTo(-HR * 0.3, HR * 0.7 * sd);
      ctx.stroke();
    }

    // ── Nostrils (V-shaped slits at tip) ──
    ctx.fillStyle = '#002244';
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(HR * 1.15, HR * 0.02 * sd);
      ctx.lineTo(HR * 1.05, HR * 0.12 * sd);
      ctx.lineTo(HR * 0.95, HR * 0.05 * sd);
      ctx.closePath(); ctx.fill();
    }

    // ╔═══════════════════════════════════════════════╗
    // ║  EYES — Huge .io cartoon style, angry look   ║
    // ╚═══════════════════════════════════════════════╝
    for (const sd of [-1, 1]) {
      const eX = HR * 0.08;
      const eY = HR * 0.42 * sd;
      const eW = HR * 0.40;
      const eH = HR * 0.34;

      // ── Heavy angular eyebrow (competitive/angry) ──
      ctx.save();
      ctx.strokeStyle = '#05051a';
      ctx.lineWidth = HR * 0.13;
      ctx.lineCap = 'square';
      ctx.beginPath();
      // Brow angles DOWN toward center → angry expression
      const browInnerY = eY - eH * 0.55 * sd;
      const browOuterY = eY - eH * 1.3 * sd;
      ctx.moveTo(eX + eW * 0.9, browOuterY);
      ctx.lineTo(eX - eW * 0.55, browInnerY);
      ctx.stroke();
      // Bright neon accent on brow
      ctx.strokeStyle = hsl(185, 100, 60, 0.5);
      ctx.lineWidth = HR * 0.035;
      ctx.beginPath();
      ctx.moveTo(eX + eW * 0.85, browOuterY);
      ctx.lineTo(eX - eW * 0.45, browInnerY);
      ctx.stroke();
      ctx.restore();

      // ── Eye socket shadow ──
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.moveTo(eX + eW * 0.95 + 2, eY + 2 * sd);
      ctx.lineTo(eX + eW * 0.35, eY - eH * 0.92 + 2 * sd);
      ctx.lineTo(eX - eW * 0.62, eY - eH * 0.55 + 2 * sd);
      ctx.lineTo(eX - eW * 0.72, eY + eH * 0.15 * sd);
      ctx.lineTo(eX - eW * 0.48, eY + eH * 0.82 + 2 * sd);
      ctx.lineTo(eX + eW * 0.45, eY + eH * 0.88 + 2 * sd);
      ctx.closePath(); ctx.fill();

      // ── Eye white — angular polygon (aggressive kite shape) ──
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(eX + eW * 0.95, eY);                    // Right sharp point
      ctx.lineTo(eX + eW * 0.35, eY - eH * 0.92);       // Top-right
      ctx.lineTo(eX - eW * 0.62, eY - eH * 0.55);       // Top-left (narrow)
      ctx.lineTo(eX - eW * 0.72, eY + eH * 0.15 * sd);  // Left point
      ctx.lineTo(eX - eW * 0.48, eY + eH * 0.82);       // Bottom-left
      ctx.lineTo(eX + eW * 0.45, eY + eH * 0.88);       // Bottom-right
      ctx.closePath();
      ctx.fill();

      // Eye outline (thick)
      ctx.strokeStyle = '#05051a';
      ctx.lineWidth = HR * 0.06;
      ctx.lineJoin = 'miter';
      ctx.stroke();

      // ── Iris (large, vivid green-cyan) ──
      const iR = eW * 0.45;
      const look = Math.sin(t * 0.6) * HR * 0.04;
      const iX = eX + HR * 0.1 + look;
      const iY = eY;
      const ig = ctx.createRadialGradient(iX - iR * 0.2, iY - iR * 0.2, iR * 0.08, iX, iY, iR);
      ig.addColorStop(0, '#44ffcc');
      ig.addColorStop(0.35, '#00cc88');
      ig.addColorStop(0.7, '#007755');
      ig.addColorStop(1, '#003322');
      ctx.fillStyle = ig;
      ctx.beginPath(); ctx.arc(iX, iY, iR, 0, Math.PI * 2); ctx.fill();

      // Iris ring
      ctx.strokeStyle = 'rgba(0,255,200,0.3)';
      ctx.lineWidth = iR * 0.1;
      ctx.beginPath(); ctx.arc(iX, iY, iR * 0.85, 0, Math.PI * 2); ctx.stroke();

      // ── Slit pupil (vertical, sharp) ──
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(iX - iR * 0.12, iY - iR * 0.9);
      ctx.quadraticCurveTo(iX + iR * 0.12, iY, iX - iR * 0.12, iY + iR * 0.9);
      ctx.quadraticCurveTo(iX - iR * 0.25, iY, iX - iR * 0.12, iY - iR * 0.9);
      ctx.fill();

      // ── Eye highlights ──
      ctx.fillStyle = 'rgba(255,255,255,0.90)';
      ctx.beginPath();
      ctx.moveTo(eX - eW * 0.12, eY - eH * 0.35);
      ctx.lineTo(eX + eW * 0.05, eY - eH * 0.45);
      ctx.lineTo(eX + eW * 0.12, eY - eH * 0.15);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.50)';
      ctx.beginPath(); ctx.arc(eX + eW * 0.25, eY + eH * 0.22, iR * 0.14, 0, Math.PI * 2); ctx.fill();
    }

    // ╔══════════════════════════════════════╗
    // ║  MOUTH — Wide aggressive smirk      ║
    // ╚══════════════════════════════════════╝
    // Mouth opening (dark angular shape)
    ctx.fillStyle = '#0a0018';
    ctx.beginPath();
    ctx.moveTo(HR * 1.30, 0);                 // Front tip
    ctx.lineTo(HR * 0.65, -HR * 0.28);        // Upper lip front
    ctx.lineTo(HR * 0.10, -HR * 0.18);        // Upper lip back
    ctx.lineTo(-HR * 0.10, -HR * 0.06);       // Corner top
    ctx.lineTo(-HR * 0.10, HR * 0.06);        // Corner bottom
    ctx.lineTo(HR * 0.10, HR * 0.18);         // Lower lip back
    ctx.lineTo(HR * 0.65, HR * 0.28);         // Lower lip front
    ctx.closePath(); ctx.fill();

    // Gums / inner mouth gradient
    const mGrd = ctx.createLinearGradient(HR * -0.1, 0, HR * 1.0, 0);
    mGrd.addColorStop(0, '#330022');
    mGrd.addColorStop(0.5, '#550033');
    mGrd.addColorStop(1, '#220011');
    ctx.fillStyle = mGrd;
    ctx.beginPath();
    ctx.moveTo(HR * 1.15, 0);
    ctx.lineTo(HR * 0.60, -HR * 0.22);
    ctx.lineTo(HR * 0.08, -HR * 0.14);
    ctx.lineTo(-HR * 0.05, 0);
    ctx.lineTo(HR * 0.08, HR * 0.14);
    ctx.lineTo(HR * 0.60, HR * 0.22);
    ctx.closePath(); ctx.fill();

    // Sharp fangs (top jaw)
    ctx.fillStyle = '#ffffff';
    const fangs = [
      { x: HR * 1.10, spread: HR * 0.04, h: HR * 0.14 },
      { x: HR * 0.88, spread: HR * 0.06, h: HR * 0.18 },
      { x: HR * 0.65, spread: HR * 0.05, h: HR * 0.15 },
      { x: HR * 0.42, spread: HR * 0.04, h: HR * 0.11 },
      { x: HR * 0.22, spread: HR * 0.03, h: HR * 0.08 },
    ];
    for (const f of fangs) {
      // Top fang
      ctx.beginPath();
      ctx.moveTo(f.x - f.spread, -HR * 0.04);
      ctx.lineTo(f.x, f.h);
      ctx.lineTo(f.x + f.spread, -HR * 0.04);
      ctx.closePath(); ctx.fill();
      // Bottom fang (mirror, shorter)
      ctx.beginPath();
      ctx.moveTo(f.x - f.spread * 0.85, HR * 0.03);
      ctx.lineTo(f.x, -f.h * 0.65);
      ctx.lineTo(f.x + f.spread * 0.85, HR * 0.03);
      ctx.closePath(); ctx.fill();
    }

    // Mouth outline (hard angular line)
    ctx.strokeStyle = '#05051a';
    ctx.lineWidth = HR * 0.06;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(HR * 1.30, 0);
    ctx.lineTo(HR * 0.65, -HR * 0.28);
    ctx.lineTo(HR * 0.10, -HR * 0.18);
    ctx.lineTo(-HR * 0.10, -HR * 0.06);
    ctx.lineTo(-HR * 0.10, HR * 0.06);
    ctx.lineTo(HR * 0.10, HR * 0.18);
    ctx.lineTo(HR * 0.65, HR * 0.28);
    ctx.closePath(); ctx.stroke();

    // ── Forked tongue ──
    const tPhase = Math.sin(t * 2.8) * 0.5 + 0.5;
    if (tPhase > 0.4) {
      const tF = (tPhase - 0.4) / 0.6;
      const tLen = HR * (0.35 + tF * 0.55);
      ctx.strokeStyle = '#ff2266';
      ctx.lineWidth = HR * 0.045; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(HR * 1.35, 0);
      ctx.lineTo(HR * 1.35 + tLen, 0);
      ctx.stroke();
      ctx.lineWidth = HR * 0.03;
      ctx.beginPath(); ctx.moveTo(HR * 1.35 + tLen, 0);
      ctx.lineTo(HR * 1.35 + tLen + HR * 0.18, -HR * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(HR * 1.35 + tLen, 0);
      ctx.lineTo(HR * 1.35 + tLen + HR * 0.18, HR * 0.12); ctx.stroke();
    }

    // ── Cheek scale accents ──
    ctx.strokeStyle = 'rgba(0,200,255,0.20)';
    ctx.lineWidth = HR * 0.02;
    for (const sd of [-1, 1]) {
      for (let sc = 0; sc < 3; sc++) {
        const sx = HR * (-0.1 + sc * 0.22);
        const sy = HR * (0.55 + sc * 0.05) * sd;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + HR * 0.12, sy + HR * 0.08 * sd);
        ctx.lineTo(sx + HR * 0.06, sy + HR * 0.14 * sd);
        ctx.stroke();
      }
    }

    ctx.restore(); // end head transform

    // ── Energy sparks orbiting snake ──
    ctx.save();
    for (let i = 0; i < 10; i++) {
      const sT = t * 2.6 + i * 0.628;
      const si = clamp(Math.floor(Math.abs(Math.sin(sT * 0.25 + i * 0.8)) * SEGS * 0.85), 0, SEGS - 1);
      const s = seg[si];
      const dist = s.w * (2.5 + Math.sin(sT * 1.5) * 0.7);
      const angle = sT * 3.5 + i * 2.1;
      const sx = s.x + Math.cos(angle) * dist;
      const sy = s.y + Math.sin(angle) * dist;
      const sz = S * (0.004 + Math.sin(sT * 2.5) * 0.003);
      ctx.fillStyle = hsl(25 + i * 7, 100, 72, 0.6 + Math.sin(sT * 5) * 0.3);
      ctx.shadowColor = '#ff7700'; ctx.shadowBlur = sz * 12;
      // Diamond-shaped spark (not circle)
      ctx.beginPath();
      ctx.moveTo(sx, sy - sz * 1.5);
      ctx.lineTo(sx + sz, sy);
      ctx.lineTo(sx, sy + sz * 1.5);
      ctx.lineTo(sx - sz, sy);
      ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 0; ctx.restore();

    // Floating score indicators
    for (let i = state.scores.length - 1; i >= 0; i--) {
      const sc = state.scores[i]; sc.x += sc.vx; sc.y += sc.vy; sc.vy *= 0.98; sc.life++;
      if (sc.life >= sc.maxLife) { state.scores.splice(i, 1); continue; }
      const alpha = sc.life < 10 ? sc.life / 10 : Math.max(0, 1 - (sc.life - sc.maxLife * 0.6) / (sc.maxLife * 0.4));
      const popScale = sc.life < 8 ? 0.5 + (sc.life / 8) * 0.5 : 1;
      const fSize = S * 0.035 * sc.scale * popScale;
      ctx.save(); ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.font = `900 ${Math.round(fSize)}px "Arial Black", "Impact", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#000000'; ctx.lineWidth = fSize * 0.18; ctx.lineJoin = 'round'; ctx.strokeText(sc.text, sc.x, sc.y);
      ctx.fillStyle = sc.color; ctx.fillText(sc.text, sc.x, sc.y);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText(sc.text, sc.x, sc.y - fSize * 0.03);
      ctx.restore();
    }

    timeRef.current += 0.016;
    rafRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  return (
    <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
  );
}
