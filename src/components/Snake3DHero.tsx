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

    // === SNAKE  Vibrant 2D Cartoon Zigzag ===
    const SEGS = 28;
    const snakeScale = S * 0.55;
    const segLen = snakeScale / SEGS;
    const centerX = W / 2;
    const centerY = H * 0.42;

    // Build zigzag lightning-bolt path
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const frac = i / (SEGS - 1);
      const waveX = Math.sin(frac * Math.PI * 2.5 + t * 1.2) * snakeScale * 0.32;
      const progress = (frac - 0.5) * snakeScale * 0.8;
      const zigAmp = snakeScale * 0.1 * (1 - Math.abs(frac - 0.5) * 1.2);
      const zigX = ((i % 2) === 0 ? 1 : -1) * zigAmp;
      const breathe = Math.sin(t * 2 + frac * 6) * snakeScale * 0.015;
      points.push({ x: centerX + waveX + zigX + breathe, y: centerY + progress });
    }

    // Per-segment info
    const segInfo: { x: number; y: number; angle: number; thick: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const next = points[Math.min(i + 1, SEGS - 1)]; const prev = points[Math.max(i - 1, 0)];
      const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
      let thick: number; const frac = i / (SEGS - 1);
      if (frac < 0.06) thick = lerp(0.5, 1.0, frac / 0.06);
      else if (frac < 0.18) thick = 1.0;
      else thick = lerp(1.0, 0.2, (frac - 0.18) / 0.82);
      thick *= segLen * 0.85;
      segInfo.push({ ...points[i], angle, thick });
    }

    // Motion streaks behind body
    ctx.save();
    for (let i = Math.floor(SEGS * 0.4); i < SEGS; i += 2) {
      const seg = segInfo[i]; const frac = i / SEGS;
      const sLen = seg.thick * (2 + frac * 4);
      ctx.strokeStyle = hsl(200, 100, 70, (1 - frac) * 0.25);
      ctx.lineWidth = seg.thick * 0.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(seg.x, seg.y);
      ctx.lineTo(seg.x - Math.cos(seg.angle) * sLen, seg.y - Math.sin(seg.angle) * sLen); ctx.stroke();
    }
    ctx.restore();

    // Trail particles from tail
    if (SEGS > 5) {
      const tail = segInfo[SEGS - 1];
      if (Math.random() < 0.5) {
        state.particles.push({
          x: tail.x + (Math.random() - 0.5) * tail.thick * 2, y: tail.y + (Math.random() - 0.5) * tail.thick,
          vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
          life: 0, maxLife: 25 + Math.random() * 20, size: S * (0.003 + Math.random() * 0.004), hue: 20,
        });
      }
    }

    // Draw body segments back-to-front
    for (let i = SEGS - 1; i >= 1; i--) {
      const seg = segInfo[i]; const thick = seg.thick;
      const isBlue = i % 2 === 0;
      const bHue = isBlue ? 210 : 25; const bSat = 100; const bLit = isBlue ? 55 : 58;

      ctx.save();
      ctx.shadowColor = hsl(bHue, 100, 60, 0.8); ctx.shadowBlur = thick * 1.5;
      // Outline
      ctx.fillStyle = '#0a0a1a'; ctx.beginPath(); ctx.arc(seg.x, seg.y, thick + thick * 0.22, 0, Math.PI * 2); ctx.fill();
      // Fill gradient
      const sg = ctx.createRadialGradient(seg.x - thick * 0.25, seg.y - thick * 0.3, thick * 0.1, seg.x, seg.y, thick);
      sg.addColorStop(0, hsl(bHue, bSat, bLit + 25)); sg.addColorStop(0.5, hsl(bHue, bSat, bLit));
      sg.addColorStop(1, hsl(bHue, bSat - 10, bLit - 15));
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(seg.x, seg.y, thick, 0, Math.PI * 2); ctx.fill();
      // Highlight
      ctx.fillStyle = hsl(bHue, 100, 85, 0.3); ctx.beginPath();
      ctx.ellipse(seg.x - thick * 0.2, seg.y - thick * 0.25, thick * 0.35, thick * 0.25, -0.5, 0, Math.PI * 2); ctx.fill();
      // Lightning accent
      if (i % 3 === 0 && i > 2 && i < SEGS - 2) {
        const nx = segInfo[i - 1];
        ctx.strokeStyle = hsl(50, 100, 85, 0.4 + Math.sin(t * 3 + i) * 0.2);
        ctx.lineWidth = thick * 0.12; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(seg.x, seg.y); ctx.lineTo(nx.x, nx.y); ctx.stroke();
      }
      ctx.restore();
    }

    // === HEAD ===
    const head = segInfo[0]; const headR = head.thick * 2.0;
    const hx = head.x; const hy = head.y; const hAngle = head.angle;

    ctx.save();
    ctx.shadowColor = '#22ccff'; ctx.shadowBlur = headR * 1.2;
    // Outline
    ctx.fillStyle = '#0a0a1a'; ctx.beginPath(); ctx.arc(hx, hy, headR + headR * 0.12, 0, Math.PI * 2); ctx.fill();
    // Fill
    const hg = ctx.createRadialGradient(hx - headR * 0.25, hy - headR * 0.3, headR * 0.1, hx, hy, headR);
    hg.addColorStop(0, '#66eeff'); hg.addColorStop(0.35, '#22bbff'); hg.addColorStop(0.7, '#1188dd'); hg.addColorStop(1, '#0055aa');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, headR, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Snout bump
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(hAngle);
    const sng = ctx.createRadialGradient(headR * 0.55, 0, headR * 0.05, headR * 0.45, 0, headR * 0.45);
    sng.addColorStop(0, '#88ffff'); sng.addColorStop(0.6, '#22bbff'); sng.addColorStop(1, '#1188dd');
    ctx.fillStyle = sng; ctx.beginPath(); ctx.ellipse(headR * 0.5, 0, headR * 0.45, headR * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Nostrils
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(hAngle);
    ctx.fillStyle = '#004488';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(headR * 0.82, headR * 0.15 * s, headR * 0.06, headR * 0.045, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();

    // EYES
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(hAngle);
    for (const side of [-1, 1]) {
      const eX = headR * 0.22; const eY = headR * 0.42 * side;
      const eRx = headR * 0.32; const eRy = headR * 0.38;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath();
      ctx.ellipse(eX + headR * 0.02, eY + headR * 0.04, eRx * 1.1, eRy * 1.05, 0, 0, Math.PI * 2); ctx.fill();
      // White
      const eg = ctx.createRadialGradient(eX - eRx * 0.15, eY - eRy * 0.2, eRx * 0.1, eX, eY, eRx);
      eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.7, '#f0f0f0'); eg.addColorStop(1, '#d8d8d8');
      ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(eX, eY, eRx, eRy, 0, 0, Math.PI * 2); ctx.fill();
      // Outline
      ctx.strokeStyle = '#0a0a1a'; ctx.lineWidth = headR * 0.06; ctx.beginPath();
      ctx.ellipse(eX, eY, eRx, eRy, 0, 0, Math.PI * 2); ctx.stroke();
      // Pupil
      const pOff = Math.sin(t * 0.8) * headR * 0.05; const pr = eRx * 0.52;
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(eX + headR * 0.06 + pOff, eY + headR * 0.02, pr, 0, Math.PI * 2); ctx.fill();
      // Highlights
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(eX + headR * 0.02, eY - headR * 0.06 * side * 0.3, pr * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(eX + headR * 0.1, eY + headR * 0.06, pr * 0.18, 0, Math.PI * 2); ctx.fill();
      // Eyelid
      ctx.strokeStyle = hsl(210, 60, 35, 0.5); ctx.lineWidth = headR * 0.04; ctx.beginPath();
      ctx.arc(eX, eY, eRy * 1.05, Math.PI * (-0.85 + (side > 0 ? 0 : 0.15)), Math.PI * (-0.15 + (side > 0 ? -0.15 : 0))); ctx.stroke();
    }
    ctx.restore();

    // Smile
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(hAngle);
    ctx.strokeStyle = '#003366'; ctx.lineWidth = headR * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(headR * 0.52, 0, headR * 0.32, Math.PI * -0.35, Math.PI * 0.35); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath();
    ctx.arc(headR * 0.52, 0, headR * 0.28, Math.PI * -0.2, Math.PI * 0.2);
    ctx.lineTo(headR * 0.52 + headR * 0.24, 0); ctx.fill();
    // Tongue
    const tongueOut = Math.sin(t * 2.5) * 0.5 + 0.5;
    if (tongueOut > 0.6) {
      ctx.fillStyle = '#ff5577'; const te = (tongueOut - 0.6) / 0.4;
      ctx.beginPath(); ctx.ellipse(headR * 0.85 + te * headR * 0.3, 0, headR * 0.08 + te * headR * 0.08, headR * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Cheek blush
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(hAngle);
    ctx.fillStyle = 'rgba(255,100,130,0.18)';
    ctx.beginPath(); ctx.ellipse(headR * 0.1, -headR * 0.6, headR * 0.2, headR * 0.12, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(headR * 0.1, headR * 0.6, headR * 0.2, headR * 0.12, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Crown highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath();
    ctx.ellipse(hx - headR * 0.15, hy - headR * 0.35, headR * 0.5, headR * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Energy sparks around snake
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const sT = t * 2.5 + i * 1.047;
      const si = clamp(Math.floor(Math.abs(Math.sin(sT * 0.3 + i)) * SEGS * 0.8), 0, SEGS - 1);
      const seg = segInfo[si]; const sDist = seg.thick * (2 + Math.sin(sT) * 0.5);
      const sA = sT * 3 + i * 2; const sx = seg.x + Math.cos(sA) * sDist; const sy = seg.y + Math.sin(sA) * sDist;
      const sSize = S * (0.004 + Math.sin(sT * 2) * 0.002);
      ctx.fillStyle = hsl(50, 100, 80, 0.7 + Math.sin(sT * 4) * 0.3);
      ctx.shadowColor = '#ffff44'; ctx.shadowBlur = sSize * 8;
      ctx.beginPath(); ctx.arc(sx, sy, sSize, 0, Math.PI * 2); ctx.fill();
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
