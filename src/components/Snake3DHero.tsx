import { useEffect, useRef, useCallback } from 'react';

// Helpers
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }
function hsl(h: number, s: number, l: number, a = 1) { return `hsla(${h % 360},${s}%,${l}%,${a})`; }

interface Sparkle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number; type: 'star' | 'heart' | 'circle'; rot: number; }

export default function Snake3DHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const timeRef = useRef(0);
  const stateRef = useRef<{ sparkles: Sparkle[]; init: boolean }>({ sparkles: [], init: false });

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

    // Draw a 5-point star
    function drawStar(scx: number, scy: number, r: number, rot: number) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = rot + (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.45;
        if (i === 0) ctx.moveTo(scx + Math.cos(a) * rad, scy + Math.sin(a) * rad);
        else ctx.lineTo(scx + Math.cos(a) * rad, scy + Math.sin(a) * rad);
      }
      ctx.closePath();
    }

    // Draw a heart
    function drawHeart(hcx: number, hcy: number, size: number) {
      ctx.beginPath();
      ctx.moveTo(hcx, hcy + size * 0.35);
      ctx.bezierCurveTo(hcx - size * 0.55, hcy - size * 0.1, hcx - size * 0.55, hcy - size * 0.55, hcx, hcy - size * 0.3);
      ctx.bezierCurveTo(hcx + size * 0.55, hcy - size * 0.55, hcx + size * 0.55, hcy - size * 0.1, hcx, hcy + size * 0.35);
      ctx.closePath();
    }

    // Spawn sparkles
    if (Math.random() < 0.5) {
      const types: Array<'star' | 'heart' | 'circle'> = ['star', 'star', 'star', 'heart', 'circle'];
      state.sparkles.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.8, vy: -Math.random() * 1.2 - 0.3,
        life: 0, maxLife: 50 + Math.random() * 60,
        size: S * (0.008 + Math.random() * 0.015),
        hue: [40, 60, 160, 280, 320, 200][Math.floor(Math.random() * 6)],
        type: types[Math.floor(Math.random() * types.length)],
        rot: Math.random() * Math.PI * 2,
      });
    }

    // BACKGROUND
    const bgGrad = ctx.createRadialGradient(W / 2, H * 0.35, S * 0.05, W / 2, H * 0.5, S * 1.0);
    bgGrad.addColorStop(0, '#1a0a3e'); bgGrad.addColorStop(0.3, '#120828');
    bgGrad.addColorStop(0.6, '#0a0518'); bgGrad.addColorStop(1, '#030210');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);

    // Soft pastel bokeh
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const bx = (Math.sin(i * 1.7 + t * 0.15) * 0.5 + 0.5) * W;
      const by = (Math.cos(i * 2.3 + t * 0.12) * 0.5 + 0.5) * H;
      const br = S * (0.05 + Math.sin(i * 3.1) * 0.03);
      const bAlpha = 0.04 + Math.sin(t * 0.8 + i * 0.9) * 0.02;
      const bHue = (i * 55 + t * 8) % 360;
      ctx.fillStyle = hsl(bHue, 70, 60, bAlpha);
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Update & draw sparkles
    for (let i = state.sparkles.length - 1; i >= 0; i--) {
      const sp = state.sparkles[i];
      sp.x += sp.vx; sp.y += sp.vy; sp.rot += 0.03; sp.life++;
      if (sp.life >= sp.maxLife) { state.sparkles.splice(i, 1); continue; }
      const alpha = sp.life < 10 ? sp.life / 10 : Math.max(0, 1 - (sp.life - sp.maxLife * 0.5) / (sp.maxLife * 0.5));
      const sz = sp.size * (1 - sp.life / sp.maxLife * 0.4);
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = hsl(sp.hue, 90, 75);
      ctx.shadowColor = hsl(sp.hue, 100, 70, 0.8);
      ctx.shadowBlur = sz * 4;
      if (sp.type === 'star') { drawStar(sp.x, sp.y, sz, sp.rot); ctx.fill(); }
      else if (sp.type === 'heart') { drawHeart(sp.x, sp.y, sz); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(sp.x, sp.y, sz * 0.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }

    // CUTE CARTOON SNAKE
    const SEGS = 26;
    const snakeScale = S * 0.80;
    const segLen = snakeScale / SEGS;
    const snakeCx = W / 2;
    const snakeCy = H * 0.44;

    // Smooth curvy S-path
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const f = i / (SEGS - 1);
      const waveX = Math.sin(f * Math.PI * 2.0 + t * 1.1) * snakeScale * 0.28;
      const spineY = (f - 0.45) * snakeScale * 0.75;
      const headBob = f < 0.1 ? Math.sin(t * 2.5) * S * 0.015 * (1 - f / 0.1) : 0;
      const breathe = Math.sin(t * 1.8 + f * 4) * snakeScale * 0.008;
      points.push({ x: snakeCx + waveX + breathe, y: snakeCy + spineY + headBob });
    }

    // Per-segment info
    const seg: { x: number; y: number; a: number; w: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const nx = points[Math.min(i + 1, SEGS - 1)];
      const pv = points[Math.max(i - 1, 0)];
      const a = Math.atan2(nx.y - pv.y, nx.x - pv.x);
      const f = i / (SEGS - 1);
      let w: number;
      if (f < 0.06) w = lerp(0.65, 1.0, f / 0.06);
      else if (f < 0.20) w = 1.0;
      else w = lerp(1.0, 0.15, (f - 0.20) / 0.80);
      w *= segLen * 1.1;
      seg.push({ ...points[i], a, w });
    }

    // Cute glow behind body
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < SEGS; i += 2) {
      const s = seg[i];
      const r = s.w * 4;
      const g = ctx.createRadialGradient(s.x, s.y, s.w * 0.3, s.x, s.y, r);
      g.addColorStop(0, 'rgba(100,255,150,0.3)');
      g.addColorStop(0.5, 'rgba(255,200,50,0.1)');
      g.addColorStop(1, 'rgba(255,100,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();

    // Tail sparkle trail
    const tailSeg = seg[SEGS - 1];
    if (Math.random() < 0.4) {
      const trailTypes: Array<'star' | 'heart' | 'circle'> = ['star', 'circle', 'star'];
      state.sparkles.push({
        x: tailSeg.x + (Math.random() - 0.5) * tailSeg.w * 3,
        y: tailSeg.y + (Math.random() - 0.5) * tailSeg.w * 2,
        vx: -Math.cos(tailSeg.a) * 1.0 + (Math.random() - 0.5) * 0.5,
        vy: -Math.sin(tailSeg.a) * 1.0 + (Math.random() - 0.5) * 0.5,
        life: 0, maxLife: 30 + Math.random() * 20,
        size: S * (0.006 + Math.random() * 0.008), hue: 60,
        type: trailTypes[Math.floor(Math.random() * trailTypes.length)],
        rot: Math.random() * Math.PI * 2,
      });
    }

    // BODY SEGMENTS — candy colored
    const candyColors = [
      { h: 130, s: 85, l: 52 },
      { h: 55, s: 95, l: 55 },
      { h: 170, s: 80, l: 50 },
      { h: 40, s: 95, l: 55 },
      { h: 130, s: 85, l: 52 },
      { h: 320, s: 75, l: 60 },
    ];

    for (let i = SEGS - 1; i >= 1; i--) {
      const s = seg[i]; const w = s.w;
      if (w < 0.5) continue;
      const cc = candyColors[i % candyColors.length];
      const bounce = 1 + Math.sin(t * 3 + i * 0.6) * 0.04;
      const bw = w * bounce;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.shadowColor = hsl(cc.h, 100, 65, 0.6);
      ctx.shadowBlur = bw * 2;

      // Dark outline
      ctx.fillStyle = hsl(cc.h, cc.s - 10, cc.l - 25);
      ctx.beginPath(); ctx.arc(0, 0, bw * 1.15, 0, Math.PI * 2); ctx.fill();

      // Main fill gradient
      const bg = ctx.createRadialGradient(-bw * 0.25, -bw * 0.3, bw * 0.1, 0, 0, bw);
      bg.addColorStop(0, hsl(cc.h, cc.s, cc.l + 25));
      bg.addColorStop(0.4, hsl(cc.h, cc.s, cc.l + 8));
      bg.addColorStop(0.8, hsl(cc.h, cc.s, cc.l));
      bg.addColorStop(1, hsl(cc.h, cc.s - 5, cc.l - 8));
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0, 0, bw, 0, Math.PI * 2); ctx.fill();

      // Shiny highlight
      ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.sin(t * 2 + i * 0.8) * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(-bw * 0.25, -bw * 0.3, bw * 0.35, bw * 0.25, -0.4, 0, Math.PI * 2);
      ctx.fill();

      // Belly dot
      if (i % 3 === 1) {
        ctx.fillStyle = hsl(cc.h, cc.s, cc.l + 18, 0.4);
        ctx.beginPath(); ctx.arc(bw * 0.15, bw * 0.1, bw * 0.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // HEAD — Big round cute cartoon head
    const hd = seg[0];
    const headBounce = 1 + Math.sin(t * 2.5) * 0.03;
    const HR = hd.w * 3.5 * headBounce;
    const headX = hd.x;
    const headY = hd.y;
    const hAng = hd.a;

    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(hAng);

    ctx.shadowColor = '#44ff88';
    ctx.shadowBlur = HR * 2;

    // Head outline
    ctx.fillStyle = '#1a6633';
    ctx.beginPath(); ctx.arc(0, 0, HR * 1.08, 0, Math.PI * 2); ctx.fill();

    // Head fill
    const hGrd = ctx.createRadialGradient(-HR * 0.2, -HR * 0.25, HR * 0.1, 0, 0, HR);
    hGrd.addColorStop(0, '#88ffaa'); hGrd.addColorStop(0.3, '#55ee77');
    hGrd.addColorStop(0.6, '#33cc55'); hGrd.addColorStop(1, '#22aa44');
    ctx.fillStyle = hGrd;
    ctx.beginPath(); ctx.arc(0, 0, HR, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Head shine
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(-HR * 0.15, -HR * 0.35, HR * 0.55, HR * 0.35, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    const snoutGrd = ctx.createRadialGradient(HR * 0.55, 0, HR * 0.05, HR * 0.45, 0, HR * 0.42);
    snoutGrd.addColorStop(0, '#99ffbb'); snoutGrd.addColorStop(0.6, '#55ee77'); snoutGrd.addColorStop(1, '#33cc55');
    ctx.fillStyle = snoutGrd;
    ctx.beginPath(); ctx.ellipse(HR * 0.5, 0, HR * 0.42, HR * 0.52, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(HR * 0.4, -HR * 0.15, HR * 0.22, HR * 0.14, -0.3, 0, Math.PI * 2); ctx.fill();

    // Nostrils
    for (const sd of [-1, 1]) {
      ctx.fillStyle = '#1a7733';
      ctx.beginPath(); ctx.ellipse(HR * 0.78, HR * 0.12 * sd, HR * 0.065, HR * 0.05, 0.1 * sd, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(HR * 0.77, HR * 0.11 * sd - HR * 0.01, HR * 0.02, 0, Math.PI * 2); ctx.fill();
    }

    // EYES — Enormous sparkling cartoon eyes
    for (const sd of [-1, 1]) {
      const eX = HR * 0.15;
      const eY = HR * 0.42 * sd;
      const eR = HR * 0.38;

      // Eye shadow
      ctx.fillStyle = 'rgba(0,60,20,0.2)';
      ctx.beginPath(); ctx.ellipse(eX + 2, eY + 3 * sd, eR * 1.12, eR * 1.08, 0, 0, Math.PI * 2); ctx.fill();

      // Eye white
      const ewGrad = ctx.createRadialGradient(eX - eR * 0.15, eY - eR * 0.15 * sd, eR * 0.1, eX, eY, eR);
      ewGrad.addColorStop(0, '#ffffff'); ewGrad.addColorStop(0.7, '#f5f5f5'); ewGrad.addColorStop(1, '#e0e0e0');
      ctx.fillStyle = ewGrad;
      ctx.beginPath(); ctx.arc(eX, eY, eR, 0, Math.PI * 2); ctx.fill();

      // Eye outline
      ctx.strokeStyle = '#1a5533';
      ctx.lineWidth = HR * 0.05;
      ctx.beginPath(); ctx.arc(eX, eY, eR, 0, Math.PI * 2); ctx.stroke();

      // Iris
      const iR = eR * 0.65;
      const lookX = Math.sin(t * 0.5) * HR * 0.04;
      const lookY = Math.cos(t * 0.7) * HR * 0.02;
      const iX = eX + HR * 0.06 + lookX;
      const iY = eY + lookY;

      const iGrad = ctx.createRadialGradient(iX - iR * 0.2, iY - iR * 0.2, iR * 0.05, iX, iY, iR);
      iGrad.addColorStop(0, '#44ffaa'); iGrad.addColorStop(0.25, '#33dd88');
      iGrad.addColorStop(0.5, '#22aa66'); iGrad.addColorStop(0.8, '#117744'); iGrad.addColorStop(1, '#0a5533');
      ctx.fillStyle = iGrad;
      ctx.beginPath(); ctx.arc(iX, iY, iR, 0, Math.PI * 2); ctx.fill();

      // Iris ring
      ctx.strokeStyle = 'rgba(100,255,170,0.3)';
      ctx.lineWidth = iR * 0.08;
      ctx.beginPath(); ctx.arc(iX, iY, iR * 0.88, 0, Math.PI * 2); ctx.stroke();

      // Pupil (round, cute)
      const pR = iR * 0.45;
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(iX + HR * 0.01, iY, pR, 0, Math.PI * 2); ctx.fill();

      // Big sparkle highlights
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(eX - eR * 0.1, eY - eR * 0.25, iR * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.70)';
      ctx.beginPath(); ctx.arc(eX + eR * 0.22, eY + eR * 0.2, iR * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(eX - eR * 0.25, eY + eR * 0.1, iR * 0.08, 0, Math.PI * 2); ctx.fill();

      // Happy eyelid
      const squint = Math.sin(t * 0.4) * 0.1;
      ctx.strokeStyle = '#1a6633';
      ctx.lineWidth = HR * 0.04;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(eX, eY, eR * 1.02, Math.PI * (-0.7 + squint) * sd, Math.PI * (-0.3 - squint) * sd, sd > 0);
      ctx.stroke();
    }

    // Rosy cheeks
    for (const sd of [-1, 1]) {
      const chX = HR * -0.05;
      const chY = HR * 0.68 * sd;
      ctx.fillStyle = 'rgba(255,120,150,0.30)';
      ctx.beginPath(); ctx.ellipse(chX, chY, HR * 0.2, HR * 0.13, 0.1 * sd, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,180,200,0.20)';
      ctx.beginPath(); ctx.arc(chX - HR * 0.05, chY - HR * 0.03, HR * 0.05, 0, Math.PI * 2); ctx.fill();
    }

    // Happy smile
    ctx.strokeStyle = '#1a5533';
    ctx.lineWidth = HR * 0.07;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(HR * 0.45, 0, HR * 0.32, Math.PI * -0.42, Math.PI * 0.42);
    ctx.stroke();

    ctx.strokeStyle = '#0d3322';
    ctx.lineWidth = HR * 0.04;
    ctx.beginPath();
    ctx.arc(HR * 0.45, 0, HR * 0.30, Math.PI * -0.35, Math.PI * 0.35);
    ctx.stroke();

    // Tongue
    const tongueShow = Math.sin(t * 2.0) * 0.5 + 0.5;
    if (tongueShow > 0.3) {
      const tScale = (tongueShow - 0.3) / 0.7;
      ctx.fillStyle = '#ff6688';
      ctx.beginPath();
      ctx.ellipse(HR * 0.65, HR * 0.08, HR * 0.1 * tScale, HR * 0.14 * tScale, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,150,170,0.5)';
      ctx.beginPath();
      ctx.ellipse(HR * 0.63, HR * 0.04, HR * 0.05 * tScale, HR * 0.06 * tScale, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crown
    ctx.save();
    ctx.translate(-HR * 0.1, -HR * 0.85);
    ctx.rotate(-0.25);
    const crownH = HR * 0.35;
    const crownW = HR * 0.45;

    const crGrad = ctx.createLinearGradient(0, 0, 0, crownH);
    crGrad.addColorStop(0, '#ffdd44'); crGrad.addColorStop(0.5, '#ffcc22'); crGrad.addColorStop(1, '#eebb00');
    ctx.fillStyle = crGrad;
    ctx.beginPath();
    ctx.moveTo(-crownW * 0.5, crownH * 0.1);
    ctx.lineTo(-crownW * 0.45, -crownH * 0.7);
    ctx.lineTo(-crownW * 0.2, -crownH * 0.3);
    ctx.lineTo(0, -crownH);
    ctx.lineTo(crownW * 0.2, -crownH * 0.3);
    ctx.lineTo(crownW * 0.45, -crownH * 0.7);
    ctx.lineTo(crownW * 0.5, crownH * 0.1);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = '#cc9900';
    ctx.lineWidth = HR * 0.025;
    ctx.stroke();

    const gemColors = ['#ff4466', '#44aaff', '#44ff88'];
    const gemPositions = [{ x: -crownW * 0.25, y: -crownH * 0.15 }, { x: 0, y: -crownH * 0.35 }, { x: crownW * 0.25, y: -crownH * 0.15 }];
    for (let gi = 0; gi < 3; gi++) {
      const gp = gemPositions[gi];
      ctx.fillStyle = gemColors[gi];
      ctx.shadowColor = gemColors[gi];
      ctx.shadowBlur = HR * 0.08;
      ctx.beginPath(); ctx.arc(gp.x, gp.y, HR * 0.04 + Math.sin(t * 3 + gi * 2) * HR * 0.008, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(gp.x - HR * 0.01, gp.y - HR * 0.015, HR * 0.015, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.restore(); // end head transform

    // Floating stars around snake
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const sT = t * 1.5 + i * 0.785;
      const si = clamp(Math.floor(Math.abs(Math.sin(sT * 0.3 + i * 0.8)) * SEGS * 0.7), 0, SEGS - 1);
      const s = seg[si];
      const dist = s.w * (2.5 + Math.sin(sT * 1.2) * 0.8);
      const angle = sT * 2.5 + i * 2.1;
      const sx = s.x + Math.cos(angle) * dist;
      const sy = s.y + Math.sin(angle) * dist;
      const sz = S * (0.008 + Math.sin(sT * 2) * 0.004);
      const sHue = (i * 50 + t * 20) % 360;
      ctx.fillStyle = hsl(sHue, 80, 75, 0.5 + Math.sin(sT * 4) * 0.25);
      ctx.shadowColor = hsl(sHue, 100, 65, 0.6);
      ctx.shadowBlur = sz * 6;
      drawStar(sx, sy, sz, sT * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

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
