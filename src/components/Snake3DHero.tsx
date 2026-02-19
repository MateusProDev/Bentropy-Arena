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

    // === SNAKE — Geometric .io Mascot Style ===
    const SEGS = 30;
    const snakeScale = S * 0.6;
    const segLen = snakeScale / SEGS;
    const centerX = W / 2;
    const centerY = H * 0.42;

    // Build aggressive S-curve path with angular kinks
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const frac = i / (SEGS - 1);
      // Main S-curve (aggressive attack pose — head tilted up)
      const curveX = Math.sin(frac * Math.PI * 2.2 + t * 1.0) * snakeScale * 0.35;
      const curveY = (frac - 0.5) * snakeScale * 0.85;
      // Zigzag angular offset for geometric feel
      const zigAmp = snakeScale * 0.08 * Math.max(0, 1 - Math.abs(frac - 0.5) * 1.4);
      const zigX = ((i % 2) === 0 ? 1 : -1) * zigAmp;
      // Head lift: push head upward for attacking pose
      const headLift = frac < 0.15 ? Math.sin((1 - frac / 0.15) * Math.PI * 0.5) * snakeScale * 0.08 : 0;
      const breathe = Math.sin(t * 2.2 + frac * 5) * snakeScale * 0.012;
      points.push({ x: centerX + curveX + zigX + breathe, y: centerY + curveY - headLift });
    }

    // Per-segment data
    const segInfo: { x: number; y: number; angle: number; thick: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const next = points[Math.min(i + 1, SEGS - 1)];
      const prev = points[Math.max(i - 1, 0)];
      const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
      const frac = i / (SEGS - 1);
      let thick: number;
      if (frac < 0.04) thick = lerp(0.55, 1.0, frac / 0.04);
      else if (frac < 0.15) thick = 1.0;
      else thick = lerp(1.0, 0.12, (frac - 0.15) / 0.85);
      thick *= segLen * 0.9;
      segInfo.push({ ...points[i], angle, thick });
    }

    // ── Orange energy aura glow behind body ──
    ctx.save();
    ctx.globalAlpha = 0.18 + Math.sin(t * 2.5) * 0.08;
    for (let i = 0; i < SEGS; i += 2) {
      const seg = segInfo[i];
      const auraR = seg.thick * (2.8 + Math.sin(t * 3 + i * 0.5) * 0.5);
      const ag = ctx.createRadialGradient(seg.x, seg.y, seg.thick * 0.3, seg.x, seg.y, auraR);
      ag.addColorStop(0, 'rgba(255,120,20,0.35)');
      ag.addColorStop(0.5, 'rgba(255,80,10,0.12)');
      ag.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(seg.x, seg.y, auraR, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Motion streaks (speed trail) ──
    ctx.save();
    for (let i = Math.floor(SEGS * 0.35); i < SEGS; i += 2) {
      const seg = segInfo[i]; const frac = i / SEGS;
      const sLen = seg.thick * (3 + frac * 5);
      const alpha = (1 - frac) * 0.3;
      ctx.strokeStyle = hsl(15, 100, 65, alpha);
      ctx.lineWidth = seg.thick * 0.35; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(seg.x, seg.y);
      ctx.lineTo(seg.x - Math.cos(seg.angle) * sLen, seg.y - Math.sin(seg.angle) * sLen);
      ctx.stroke();
    }
    ctx.restore();

    // ── Tail trail particles ──
    const tail = segInfo[SEGS - 1];
    if (Math.random() < 0.6) {
      state.particles.push({
        x: tail.x + (Math.random() - 0.5) * tail.thick * 2.5,
        y: tail.y + (Math.random() - 0.5) * tail.thick,
        vx: -Math.cos(tail.angle) * 1.5 + (Math.random() - 0.5),
        vy: -Math.sin(tail.angle) * 1.5 + (Math.random() - 0.5),
        life: 0, maxLife: 20 + Math.random() * 25,
        size: S * (0.003 + Math.random() * 0.005), hue: 25,
      });
    }

    // ── Draw body segments (back-to-front) with HEXAGONAL shapes ──
    for (let i = SEGS - 1; i >= 1; i--) {
      const seg = segInfo[i]; const th = seg.thick;
      if (th < 0.5) continue;
      const isCyan = i % 2 === 0;
      const bHue = isCyan ? 185 : 12;
      const bSat = 100;
      const bLit = isCyan ? 52 : 55;

      ctx.save();
      ctx.translate(seg.x, seg.y);
      ctx.rotate(seg.angle);

      // Glowing outline (orange energy aura per segment)
      ctx.shadowColor = hsl(bHue, 100, 60, 0.9);
      ctx.shadowBlur = th * 1.8;

      // HEXAGONAL segment shape
      const hexSides = 6;
      const outR = th + th * 0.2; // outline radius
      // Outline
      ctx.fillStyle = '#08081a';
      ctx.beginPath();
      for (let h = 0; h < hexSides; h++) {
        const a = (h / hexSides) * Math.PI * 2 + Math.PI / 6;
        const px = Math.cos(a) * outR; const py = Math.sin(a) * outR;
        if (h === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();

      // Fill
      const sg = ctx.createRadialGradient(-th * 0.2, -th * 0.2, th * 0.08, 0, 0, th);
      sg.addColorStop(0, hsl(bHue, bSat, bLit + 28));
      sg.addColorStop(0.45, hsl(bHue, bSat, bLit));
      sg.addColorStop(1, hsl(bHue, bSat - 10, bLit - 18));
      ctx.fillStyle = sg;
      ctx.beginPath();
      for (let h = 0; h < hexSides; h++) {
        const a = (h / hexSides) * Math.PI * 2 + Math.PI / 6;
        const px = Math.cos(a) * th; const py = Math.sin(a) * th;
        if (h === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();

      // Hard edge highlight (geometric specular)
      ctx.fillStyle = hsl(bHue, 100, 88, 0.25);
      ctx.beginPath();
      ctx.moveTo(Math.cos(Math.PI / 6) * th * 0.3, -th * 0.8);
      ctx.lineTo(Math.cos(Math.PI / 6) * th * 0.9, -th * 0.2);
      ctx.lineTo(0, -th * 0.15);
      ctx.closePath(); ctx.fill();

      // Energy vein accent on every 3rd segment
      if (i % 3 === 0 && i > 2 && i < SEGS - 2) {
        const next = segInfo[i - 1];
        const dx = next.x - seg.x; const dy = next.y - seg.y;
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = hsl(45, 100, 80, 0.5 + Math.sin(t * 4 + i) * 0.3);
        ctx.lineWidth = th * 0.1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(seg.x, seg.y); ctx.lineTo(seg.x + dx * 0.5, seg.y + dy * 0.5);
        ctx.stroke(); ctx.restore();
      }

      ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════
    //  HEAD — Angular Diamond/Polygon Shape (NOT an egg!)
    // ═══════════════════════════════════════════════════════════
    const head = segInfo[0];
    const headR = head.thick * 2.3;
    const hx = head.x; const hy = head.y; const hAngle = head.angle;

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(hAngle);

    // ── Diamond head outline ──
    ctx.shadowColor = '#00ddff';
    ctx.shadowBlur = headR * 1.5;
    const HR = headR;

    // Build angular diamond polygon: pointed snout forward, wide cheeks, angular back
    ctx.fillStyle = '#08081a';
    ctx.beginPath();
    ctx.moveTo(HR * 1.25, 0);                // Tip (snout) — sharp point
    ctx.lineTo(HR * 0.35, -HR * 0.72);       // Upper-front cheek
    ctx.lineTo(-HR * 0.3, -HR * 0.78);       // Upper-back jaw
    ctx.lineTo(-HR * 0.75, -HR * 0.45);      // Back top corner
    ctx.lineTo(-HR * 0.85, 0);               // Back center
    ctx.lineTo(-HR * 0.75, HR * 0.45);       // Back bottom corner
    ctx.lineTo(-HR * 0.3, HR * 0.78);        // Lower-back jaw
    ctx.lineTo(HR * 0.35, HR * 0.72);        // Lower-front cheek
    ctx.closePath();
    ctx.fill();

    // ── Diamond head fill with gradient ──
    const hGrd = ctx.createRadialGradient(-HR * 0.1, 0, HR * 0.1, 0, 0, HR * 1.0);
    hGrd.addColorStop(0, '#55ffff');
    hGrd.addColorStop(0.3, '#22ddee');
    hGrd.addColorStop(0.6, '#1199cc');
    hGrd.addColorStop(1, '#005588');
    ctx.fillStyle = hGrd;
    ctx.beginPath();
    ctx.moveTo(HR * 1.15, 0);
    ctx.lineTo(HR * 0.3, -HR * 0.65);
    ctx.lineTo(-HR * 0.25, -HR * 0.7);
    ctx.lineTo(-HR * 0.68, -HR * 0.4);
    ctx.lineTo(-HR * 0.78, 0);
    ctx.lineTo(-HR * 0.68, HR * 0.4);
    ctx.lineTo(-HR * 0.25, HR * 0.7);
    ctx.lineTo(HR * 0.3, HR * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Hard-edge specular on top facet ──
    ctx.fillStyle = 'rgba(150,255,255,0.2)';
    ctx.beginPath();
    ctx.moveTo(HR * 1.0, 0);
    ctx.lineTo(HR * 0.25, -HR * 0.58);
    ctx.lineTo(-HR * 0.15, -HR * 0.55);
    ctx.lineTo(HR * 0.3, -HR * 0.12);
    ctx.closePath();
    ctx.fill();

    // ── Nostrils (angular slits) ──
    ctx.fillStyle = '#003355';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(HR * 0.9, HR * 0.08 * s);
      ctx.lineTo(HR * 0.98, HR * 0.14 * s);
      ctx.lineTo(HR * 0.88, HR * 0.15 * s);
      ctx.closePath(); ctx.fill();
    }

    // ═══ EYES — Big, expressive, competitive (.io mascot style) ═══
    for (const side of [-1, 1]) {
      const eX = HR * 0.18;
      const eY = HR * 0.38 * side;
      const eW = HR * 0.36; // eye width
      const eH = HR * 0.30; // eye height

      // ── Angry/competitive angled eyebrow ──
      ctx.strokeStyle = '#08081a';
      ctx.lineWidth = HR * 0.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Inner brow higher, outer brow lower = competitive look
      ctx.moveTo(eX - eW * 0.5, eY - eH * 0.9 * side * -0.4);
      ctx.lineTo(eX + eW * 0.8, eY - eH * 1.4 * side * -0.15);
      ctx.stroke();

      // ── Eye shadow ──
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(eX + HR * 0.02, eY + HR * 0.03 * side, eW * 1.08, eH * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Eye white — angular shape (not round!) ──
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      // Pentagon-ish eye shape
      ctx.moveTo(eX + eW * 0.85, eY);                   // Right point
      ctx.lineTo(eX + eW * 0.3, eY - eH * 0.85);       // Top-right
      ctx.lineTo(eX - eW * 0.55, eY - eH * 0.6);       // Top-left
      ctx.lineTo(eX - eW * 0.65, eY + eH * 0.1 * side);// Left
      ctx.lineTo(eX - eW * 0.4, eY + eH * 0.75);       // Bottom-left
      ctx.lineTo(eX + eW * 0.4, eY + eH * 0.8);        // Bottom-right
      ctx.closePath();
      ctx.fill();

      // ── Eye outline ──
      ctx.strokeStyle = '#08081a';
      ctx.lineWidth = HR * 0.055;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // ── Iris (big, bold) ──
      const iR = eW * 0.42;
      const pupilLook = Math.sin(t * 0.7) * HR * 0.04;
      const iX = eX + HR * 0.08 + pupilLook;
      const iY = eY + HR * 0.01;
      const iGrd = ctx.createRadialGradient(iX, iY, iR * 0.15, iX, iY, iR);
      iGrd.addColorStop(0, '#00ffcc');
      iGrd.addColorStop(0.4, '#00bb99');
      iGrd.addColorStop(0.8, '#006655');
      iGrd.addColorStop(1, '#003322');
      ctx.fillStyle = iGrd;
      ctx.beginPath(); ctx.arc(iX, iY, iR, 0, Math.PI * 2); ctx.fill();

      // ── Pupil (sharp vertical slit) ──
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(iX, iY, iR * 0.18, iR * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Eye highlights (2 bright spots) ──
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(eX - eW * 0.05, eY - eH * 0.2, iR * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(eX + eW * 0.2, eY + eH * 0.2, iR * 0.15, 0, Math.PI * 2); ctx.fill();
    }

    // ═══ WIDE MISCHIEVOUS SMILE ═══
    // Mouth background (dark)
    ctx.fillStyle = '#110022';
    ctx.beginPath();
    ctx.moveTo(HR * 0.95, 0);
    ctx.lineTo(HR * 0.55, -HR * 0.22);
    ctx.quadraticCurveTo(HR * 0.2, -HR * 0.08, HR * 0.15, 0);
    ctx.quadraticCurveTo(HR * 0.2, HR * 0.08, HR * 0.55, HR * 0.22);
    ctx.closePath();
    ctx.fill();

    // Teeth (sharp, confident grin)
    ctx.fillStyle = '#ffffff';
    const teethCount = 5;
    for (let ti = 0; ti < teethCount; ti++) {
      const tf = ti / (teethCount - 1);
      const tx = lerp(HR * 0.3, HR * 0.88, tf);
      const tSpread = HR * 0.15 * (1 - Math.abs(tf - 0.5) * 1.2);
      ctx.beginPath();
      ctx.moveTo(tx - HR * 0.04, -tSpread * 0.4);
      ctx.lineTo(tx, tSpread * 0.5);
      ctx.lineTo(tx + HR * 0.04, -tSpread * 0.4);
      ctx.closePath(); ctx.fill();
      // Bottom teeth (mirror)
      ctx.beginPath();
      ctx.moveTo(tx - HR * 0.035, tSpread * 0.35);
      ctx.lineTo(tx, -tSpread * 0.35);
      ctx.lineTo(tx + HR * 0.035, tSpread * 0.35);
      ctx.closePath(); ctx.fill();
    }

    // Mouth outline
    ctx.strokeStyle = '#08081a';
    ctx.lineWidth = HR * 0.06;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(HR * 0.95, 0);
    ctx.lineTo(HR * 0.55, -HR * 0.22);
    ctx.quadraticCurveTo(HR * 0.2, -HR * 0.08, HR * 0.15, 0);
    ctx.quadraticCurveTo(HR * 0.2, HR * 0.08, HR * 0.55, HR * 0.22);
    ctx.closePath();
    ctx.stroke();

    // ── Forked tongue (flicking out) ──
    const tonguePhase = Math.sin(t * 3) * 0.5 + 0.5;
    if (tonguePhase > 0.45) {
      const te = (tonguePhase - 0.45) / 0.55;
      const tLen = HR * (0.3 + te * 0.5);
      ctx.strokeStyle = '#ee2255';
      ctx.lineWidth = HR * 0.05;
      ctx.lineCap = 'round';
      // Main tongue
      ctx.beginPath();
      ctx.moveTo(HR * 1.1, 0);
      ctx.lineTo(HR * 1.1 + tLen, 0);
      ctx.stroke();
      // Fork
      ctx.lineWidth = HR * 0.035;
      ctx.beginPath();
      ctx.moveTo(HR * 1.1 + tLen, 0);
      ctx.lineTo(HR * 1.1 + tLen + HR * 0.15, -HR * 0.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(HR * 1.1 + tLen, 0);
      ctx.lineTo(HR * 1.1 + tLen + HR * 0.15, HR * 0.1);
      ctx.stroke();
    }

    ctx.restore(); // end head transform

    // ── Energy sparks orbiting snake body ──
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const sT = t * 2.8 + i * 0.785;
      const si = clamp(Math.floor(Math.abs(Math.sin(sT * 0.25 + i * 0.7)) * SEGS * 0.85), 0, SEGS - 1);
      const seg = segInfo[si];
      const sDist = seg.thick * (2.2 + Math.sin(sT * 1.5) * 0.6);
      const sA = sT * 3.5 + i * 2.2;
      const sx = seg.x + Math.cos(sA) * sDist;
      const sy = seg.y + Math.sin(sA) * sDist;
      const sSize = S * (0.004 + Math.sin(sT * 2.5) * 0.003);
      ctx.fillStyle = hsl(30 + i * 8, 100, 75, 0.6 + Math.sin(sT * 5) * 0.3);
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur = sSize * 10;
      ctx.beginPath(); ctx.arc(sx, sy, sSize, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

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
