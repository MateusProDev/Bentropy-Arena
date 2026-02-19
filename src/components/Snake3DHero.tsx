import { useEffect, useRef, useCallback } from 'react';

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }

interface Dot { x: number; y: number; vx: number; vy: number; r: number; hue: number; life: number; maxLife: number; }

export default function Snake3DHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const timeRef = useRef(0);
  const stateRef = useRef<{ dots: Dot[]; init: boolean }>({ dots: [], init: false });

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const W = rect.width; const H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t = timeRef.current;
    const state = stateRef.current;
    const S = Math.min(W, H);

    // Ambient floating dots
    if (state.dots.length < 40 && Math.random() < 0.3) {
      state.dots.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
        r: S * (0.003 + Math.random() * 0.006),
        hue: [140, 180, 50, 200, 280, 100][Math.floor(Math.random() * 6)],
        life: 0, maxLife: 120 + Math.random() * 120,
      });
    }

    // BACKGROUND — deep dark arena
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.4, S * 0.05, W * 0.5, H * 0.5, S * 1.1);
    bg.addColorStop(0, '#0d1a2a'); bg.addColorStop(0.4, '#080f1a');
    bg.addColorStop(0.7, '#050a12'); bg.addColorStop(1, '#020508');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = 'rgba(40,80,120,0.04)';
    ctx.lineWidth = 1;
    const gridSize = S * 0.06;
    for (let gx = 0; gx < W; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // Update & draw dots
    for (let i = state.dots.length - 1; i >= 0; i--) {
      const d = state.dots[i];
      d.x += d.vx; d.y += d.vy; d.life++;
      if (d.life >= d.maxLife) { state.dots.splice(i, 1); continue; }
      const alpha = d.life < 15 ? d.life / 15 : Math.max(0, 1 - (d.life - d.maxLife * 0.6) / (d.maxLife * 0.4));
      ctx.fillStyle = `hsla(${d.hue},60%,60%,${alpha * 0.35})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    }

    // SNAKE PATH — smooth S-curve
    const SEGS = 30;
    const snakeLen = S * 0.85;
    const segLen = snakeLen / SEGS;
    const cx = W / 2;
    const cy = H * 0.46;

    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const f = i / (SEGS - 1);
      const waveX = Math.sin(f * Math.PI * 2.2 + t * 1.2) * snakeLen * 0.22;
      const spineY = (f - 0.42) * snakeLen * 0.78;
      const breathe = Math.sin(t * 2.0 + f * 5) * snakeLen * 0.005;
      const headWave = f < 0.08 ? Math.sin(t * 2.8) * S * 0.012 * (1 - f / 0.08) : 0;
      pts.push({ x: cx + waveX + breathe, y: cy + spineY + headWave });
    }

    // Segment data
    const seg: { x: number; y: number; a: number; w: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const nx = pts[Math.min(i + 1, SEGS - 1)];
      const pv = pts[Math.max(i - 1, 0)];
      const a = Math.atan2(nx.y - pv.y, nx.x - pv.x);
      const f = i / (SEGS - 1);
      let w: number;
      if (f < 0.05) w = lerp(0.7, 1.0, f / 0.05);
      else if (f < 0.18) w = 1.0;
      else w = lerp(1.0, 0.12, (f - 0.18) / 0.82);
      w *= segLen * 1.05;
      seg.push({ ...pts[i], a, w });
    }

    // Color = bright green neon, slither.io classic
    const snakeHue = 140 + Math.sin(t * 0.3) * 10;

    // Body glow (behind)
    ctx.save();
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < SEGS; i += 3) {
      const s = seg[i];
      const r = s.w * 3.5;
      const g = ctx.createRadialGradient(s.x, s.y, s.w * 0.2, s.x, s.y, r);
      g.addColorStop(0, `hsla(${snakeHue},90%,55%,0.4)`);
      g.addColorStop(1, `hsla(${snakeHue},90%,55%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // BODY SEGMENTS — smooth round, slither.io style
    for (let i = SEGS - 1; i >= 1; i--) {
      const s = seg[i];
      if (s.w < 0.5) continue;
      const bw = s.w * (1 + Math.sin(t * 2.5 + i * 0.5) * 0.015);

      ctx.save();
      ctx.translate(s.x, s.y);

      // Outer glow
      ctx.shadowColor = `hsla(${snakeHue},100%,50%,0.5)`;
      ctx.shadowBlur = bw * 1.2;

      // Dark outline
      ctx.fillStyle = `hsla(${snakeHue},70%,18%,1)`;
      ctx.beginPath(); ctx.arc(0, 0, bw * 1.12, 0, Math.PI * 2); ctx.fill();

      // Main body gradient
      const sg = ctx.createRadialGradient(-bw * 0.2, -bw * 0.25, bw * 0.08, 0, 0, bw);
      sg.addColorStop(0, `hsla(${snakeHue},85%,65%,1)`);
      sg.addColorStop(0.4, `hsla(${snakeHue},80%,48%,1)`);
      sg.addColorStop(0.85, `hsla(${snakeHue},75%,35%,1)`);
      sg.addColorStop(1, `hsla(${snakeHue},70%,25%,1)`);
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(0, 0, bw, 0, Math.PI * 2); ctx.fill();

      // Specular highlight
      ctx.fillStyle = `rgba(255,255,255,${0.18 + Math.sin(t * 1.5 + i * 0.7) * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(-bw * 0.2, -bw * 0.28, bw * 0.3, bw * 0.2, -0.4, 0, Math.PI * 2);
      ctx.fill();

      // Pattern stripe (alternating lighter band, like slither.io)
      if (i % 2 === 0) {
        ctx.fillStyle = `hsla(${snakeHue + 15},85%,55%,0.2)`;
        ctx.beginPath(); ctx.arc(0, 0, bw * 0.75, 0, Math.PI * 2); ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // HEAD — round, clean, slither.io style
    const hd = seg[0];
    const headBob = 1 + Math.sin(t * 2.5) * 0.015;
    const HR = hd.w * 3.2 * headBob;
    const hAng = hd.a;

    ctx.save();
    ctx.translate(hd.x, hd.y);
    ctx.rotate(hAng);

    // Head glow
    ctx.shadowColor = `hsla(${snakeHue},100%,50%,0.6)`;
    ctx.shadowBlur = HR * 1.5;

    // Head outline
    ctx.fillStyle = `hsla(${snakeHue},70%,18%,1)`;
    ctx.beginPath(); ctx.ellipse(HR * 0.06, 0, HR * 1.1, HR * 1.0, 0, 0, Math.PI * 2); ctx.fill();

    // Head fill
    const hg = ctx.createRadialGradient(-HR * 0.15, -HR * 0.2, HR * 0.1, 0, 0, HR);
    hg.addColorStop(0, `hsla(${snakeHue},85%,65%,1)`);
    hg.addColorStop(0.35, `hsla(${snakeHue},80%,48%,1)`);
    hg.addColorStop(0.8, `hsla(${snakeHue},75%,35%,1)`);
    hg.addColorStop(1, `hsla(${snakeHue},70%,25%,1)`);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(HR * 0.06, 0, HR * 1.0, HR * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Specular shine
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.ellipse(-HR * 0.1, -HR * 0.35, HR * 0.5, HR * 0.3, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // EYES — big round, wormate.io / slither.io style
    for (const sd of [-1, 1]) {
      const eX = HR * 0.25;
      const eY = HR * 0.38 * sd;
      const eR = HR * 0.32;

      // White
      const ew = ctx.createRadialGradient(eX - eR * 0.1, eY - eR * 0.1 * sd, eR * 0.05, eX, eY, eR);
      ew.addColorStop(0, '#ffffff'); ew.addColorStop(0.8, '#f0f0f0'); ew.addColorStop(1, '#dddddd');
      ctx.fillStyle = ew;
      ctx.beginPath(); ctx.arc(eX, eY, eR, 0, Math.PI * 2); ctx.fill();

      // Eye border
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = HR * 0.04;
      ctx.beginPath(); ctx.arc(eX, eY, eR, 0, Math.PI * 2); ctx.stroke();

      // Pupil — round, looking slightly forward
      const lookX = Math.sin(t * 0.6) * HR * 0.03;
      const lookY = Math.cos(t * 0.8) * HR * 0.02;
      const pX = eX + HR * 0.06 + lookX;
      const pY = eY + lookY;
      const pR = eR * 0.52;

      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(pX, pY, pR, 0, Math.PI * 2); ctx.fill();

      // Glint
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(eX + eR * 0.05, eY - eR * 0.15, pR * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(eX + eR * 0.2, eY + eR * 0.15, pR * 0.15, 0, Math.PI * 2); ctx.fill();
    }

    // Mouth — subtle line
    ctx.strokeStyle = `hsla(${snakeHue},60%,15%,0.5)`;
    ctx.lineWidth = HR * 0.04;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(HR * 0.5, 0, HR * 0.28, -0.4, 0.4);
    ctx.stroke();

    // Tongue (forked, animated)
    const tonguePhase = Math.sin(t * 2.5);
    if (tonguePhase > 0.2) {
      const tExt = (tonguePhase - 0.2) / 0.8;
      const tLen = HR * (0.4 + tExt * 0.5);
      const tx = HR * 0.9;
      const tWiggle = Math.sin(t * 6) * 0.15;
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = Math.max(1, HR * 0.04);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, 0);
      ctx.quadraticCurveTo(tx + tLen * 0.5, tWiggle * HR * 0.2, tx + tLen, 0);
      ctx.stroke();
      const forkLen = tLen * 0.3;
      ctx.beginPath();
      ctx.moveTo(tx + tLen, 0);
      ctx.lineTo(tx + tLen + forkLen * 0.7, -forkLen * 0.5);
      ctx.moveTo(tx + tLen, 0);
      ctx.lineTo(tx + tLen + forkLen * 0.7, forkLen * 0.5);
      ctx.stroke();
    }

    ctx.restore();

    // Floating food particles around snake (like arena food orbs)
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const ft = t * 1.2 + i * 0.52;
      const si = clamp(Math.floor(Math.abs(Math.sin(ft * 0.4 + i)) * SEGS * 0.6), 0, SEGS - 1);
      const s = seg[si];
      const dist = s.w * (3 + Math.sin(ft * 1.5) * 1.2);
      const angle = ft * 2.0 + i * 1.8;
      const fx = s.x + Math.cos(angle) * dist;
      const fy = s.y + Math.sin(angle) * dist;
      const fr = S * (0.005 + Math.sin(ft * 2.5) * 0.002);
      const fHue = [50, 140, 200, 320, 40, 280, 170, 60, 350, 120, 220, 90][i];
      const fAlpha = 0.4 + Math.sin(ft * 3) * 0.2;
      ctx.fillStyle = `hsla(${fHue},80%,60%,${fAlpha})`;
      ctx.shadowColor = `hsla(${fHue},100%,50%,0.5)`;
      ctx.shadowBlur = fr * 5;
      ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill();
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
