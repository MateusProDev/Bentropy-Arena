import { useEffect, useRef, useCallback } from 'react';

// ─── Helpers ───────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }

interface Vec3 { x: number; y: number; z: number; }

function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${h % 360},${s}%,${l}%,${a})`;
}

// Soft noise for organic movement
function noise(t: number, seed = 0): number {
  return Math.sin(t * 1.3 + seed) * 0.5
    + Math.sin(t * 2.7 + seed * 2.1) * 0.25
    + Math.sin(t * 0.8 + seed * 0.7) * 0.25;
}

// 3D → screen projection (perspective)
function project(p: Vec3, cx: number, cy: number, fov: number): { sx: number; sy: number; scale: number } {
  const d = fov / (fov + p.z);
  return { sx: cx + p.x * d, sy: cy + p.y * d, scale: d };
}

// ─── Snake3DHero ───────────────────────────────────────────────────
export default function Snake3DHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const timeRef = useRef(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = W / 2;
    const cy = H / 2;
    const FOV = Math.min(W, H) * 1.1;
    const t = timeRef.current;
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    ctx.clearRect(0, 0, W, H);

    // ─── Build spine ─────────────────────────────────────────
    const SEGS = 120;
    const spine: Vec3[] = [];
    const segLen = Math.min(W, H) * 0.025;

    // Head target influenced by mouse
    const headTargetX = (mx - 0.5) * W * 0.45;
    const headTargetY = (my - 0.5) * H * 0.35;

    for (let i = 0; i < SEGS; i++) {
      const frac = i / SEGS;
      const delay = frac * 3.5;
      const tt = t - delay;

      // Organic sinusoidal path with mouse influence
      const influence = Math.max(0, 1 - frac * 1.8);
      const xBase = noise(tt * 0.7, 0) * W * 0.32;
      const yBase = noise(tt * 0.55, 100) * H * 0.25;
      const zBase = noise(tt * 0.4, 200) * 180 + Math.sin(tt * 0.3 + frac * 4) * 80;

      spine.push({
        x: lerp(xBase, headTargetX, influence * 0.4),
        y: lerp(yBase, headTargetY, influence * 0.35),
        z: zBase + frac * 40,
      });
    }

    // ─── Compute per-segment data ────────────────────────────
    const segData: {
      pos: Vec3;
      sx: number; sy: number; scale: number;
      radius: number;
      nx: number; ny: number; // perpendicular normal (screen)
    }[] = [];

    for (let i = 0; i < SEGS; i++) {
      const p = spine[i];
      const { sx, sy, scale } = project(p, cx, cy, FOV);

      // Body thickness: thicker in front, tapers to tail
      let thick: number;
      const frac = i / SEGS;
      if (frac < 0.05) {
        // Head ramp-up
        thick = lerp(0.75, 1.0, frac / 0.05);
      } else if (frac < 0.15) {
        thick = 1.0;
      } else {
        thick = lerp(1.0, 0.15, (frac - 0.15) / 0.85);
      }
      const baseR = segLen * 0.82;
      const radius = baseR * thick * scale;

      // Screen-space normal perpendicular to path
      let nx = 0; let ny = -1;
      if (i < SEGS - 1) {
        const next = project(spine[i + 1], cx, cy, FOV);
        const dx = next.sx - sx;
        const dy = next.sy - sy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        nx = -dy / len;
        ny = dx / len;
      } else if (segData.length > 0) {
        nx = segData[segData.length - 1].nx;
        ny = segData[segData.length - 1].ny;
      }

      segData.push({ pos: p, sx, sy, scale, radius, nx, ny });
    }

    // Sort by depth (back-to-front)
    const indices = Array.from({ length: SEGS }, (_, i) => i);
    indices.sort((a, b) => segData[b].pos.z - segData[a].pos.z);

    // ─── Light direction (from upper-left-front) ─────────────
    const lightDir = { x: -0.45, y: -0.6, z: -0.65 };
    const lLen = Math.sqrt(lightDir.x ** 2 + lightDir.y ** 2 + lightDir.z ** 2);
    lightDir.x /= lLen; lightDir.y /= lLen; lightDir.z /= lLen;

    // ─── Ambient particles (floating orbs behind snake) ──────
    const particleCount = 35;
    for (let pi = 0; pi < particleCount; pi++) {
      const seed = pi * 137.508;
      const px = noise(t * 0.2 + seed, seed) * W * 0.5;
      const py = noise(t * 0.18 + seed * 0.7, seed + 50) * H * 0.4;
      const pz = 200 + noise(t * 0.15 + seed, seed + 100) * 150;
      const proj = project({ x: px, y: py, z: pz }, cx, cy, FOV);
      const pr = (2 + Math.sin(t * 0.5 + seed) * 1.5) * proj.scale;
      if (pr < 0.3) continue;
      const alpha = clamp(0.15 + Math.sin(t * 0.8 + seed * 2) * 0.12, 0.03, 0.3);
      const hue = (120 + pi * 12 + t * 15) % 360;
      ctx.fillStyle = hsl(hue, 80, 65, alpha);
      ctx.beginPath();
      ctx.arc(proj.sx, proj.sy, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // ─── Render body segments (back-to-front) ────────────────
    const HUE_BASE = 152; // emerald base
    const HUE_RANGE = 30;

    for (const idx of indices) {
      const seg = segData[idx];
      if (seg.radius < 0.5) continue;

      const frac = idx / SEGS;
      const r = seg.radius;

      // ── Shadow beneath each segment ──
      const shadowOff = r * 0.3;
      ctx.fillStyle = `rgba(0,0,0,${0.12 * seg.scale})`;
      ctx.beginPath();
      ctx.ellipse(seg.sx + shadowOff, seg.sy + shadowOff * 1.5, r * 1.1, r * 0.55, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // ── 3D sphere-like gradient per segment ──
      // Calculate local normal for lighting
      const zNorm = clamp(-seg.pos.z / 300, -1, 1);
      const dotL = clamp(
        seg.nx * lightDir.x + seg.ny * lightDir.y + zNorm * lightDir.z,
        -1, 1
      );
      const lit = clamp(dotL * 0.5 + 0.5, 0.15, 1.0);

      const hue = HUE_BASE + Math.sin(frac * Math.PI * 2 + t * 0.3) * HUE_RANGE;
      const sat = 65 + lit * 20;
      const baseLightness = 28 + lit * 32;

      // Radial gradient for 3D spherical look
      const grd = ctx.createRadialGradient(
        seg.sx - r * 0.3, seg.sy - r * 0.35, r * 0.08,
        seg.sx, seg.sy, r
      );
      grd.addColorStop(0, hsl(hue, sat + 15, baseLightness + 28, 0.98));
      grd.addColorStop(0.45, hsl(hue, sat, baseLightness, 0.95));
      grd.addColorStop(0.8, hsl(hue, sat - 10, baseLightness - 12, 0.92));
      grd.addColorStop(1, hsl(hue, sat - 15, baseLightness - 20, 0.85));

      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(seg.sx, seg.sy, r, 0, Math.PI * 2);
      ctx.fill();

      // ── Scale pattern overlay (diamond shape per segment) ──
      if (r > 4 && idx % 2 === 0) {
        const scaleAlpha = clamp(0.12 + lit * 0.1, 0.05, 0.25);
        const sR = r * 0.7;
        ctx.save();
        ctx.translate(seg.sx, seg.sy);
        // Rotate scale to align with body direction
        const angle = Math.atan2(seg.ny, seg.nx) + Math.PI / 2;
        ctx.rotate(angle);

        // Diamond scale shape
        ctx.fillStyle = hsl(hue + 10, sat + 10, baseLightness + 15, scaleAlpha);
        ctx.beginPath();
        ctx.moveTo(0, -sR * 0.85);
        ctx.quadraticCurveTo(sR * 0.45, 0, 0, sR * 0.85);
        ctx.quadraticCurveTo(-sR * 0.45, 0, 0, -sR * 0.85);
        ctx.fill();

        // Scale edge highlight
        ctx.strokeStyle = hsl(hue, sat, baseLightness + 25, scaleAlpha * 0.8);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, sR * 0.55, -Math.PI * 0.4, Math.PI * 0.4);
        ctx.stroke();

        ctx.restore();
      }

      // ── Specular highlight (top-left bright spot) ──
      if (r > 3) {
        const specIntensity = Math.pow(clamp(dotL, 0, 1), 3) * 0.6;
        if (specIntensity > 0.02) {
          const specGrd = ctx.createRadialGradient(
            seg.sx - r * 0.28, seg.sy - r * 0.32, 0,
            seg.sx - r * 0.28, seg.sy - r * 0.32, r * 0.55
          );
          specGrd.addColorStop(0, `rgba(255,255,255,${specIntensity})`);
          specGrd.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = specGrd;
          ctx.beginPath();
          ctx.arc(seg.sx, seg.sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Rim light (edge glow opposite to light) ──
      if (r > 3) {
        const rimIntensity = clamp((1 - dotL) * 0.35, 0, 0.35);
        if (rimIntensity > 0.02) {
          ctx.strokeStyle = hsl(180, 90, 75, rimIntensity);
          ctx.lineWidth = r * 0.12;
          ctx.beginPath();
          ctx.arc(seg.sx, seg.sy, r * 0.92, Math.PI * 0.6, Math.PI * 1.4);
          ctx.stroke();
        }
      }
    }

    // ─── Head features (always draw on top) ──────────────────
    const head = segData[0];
    const hr = head.radius;
    if (hr > 2) {
      // ── Brow ridge ──
      const browAngle = Math.atan2(head.ny, head.nx);
      ctx.save();
      ctx.translate(head.sx, head.sy);
      ctx.rotate(browAngle + Math.PI / 2);

      ctx.fillStyle = hsl(HUE_BASE, 50, 22, 0.5);
      ctx.beginPath();
      ctx.ellipse(hr * 0.15, 0, hr * 0.65, hr * 0.18, 0, Math.PI, 0);
      ctx.fill();
      ctx.restore();

      // ── Eyes (3D with reflection) ──
      const eyeSep = hr * 0.42;
      const eyeFwd = hr * 0.35;

      for (const side of [-1, 1]) {
        const ex = head.sx + head.nx * eyeSep * side + (segData[1] ? (head.sx - segData[1].sx) : 0) * 0.3;
        const ey = head.sy + head.ny * eyeSep * side + (segData[1] ? (head.sy - segData[1].sy) : 0) * 0.3;
        // Move forward along direction
        const fwdX = -head.ny;
        const fwdY = head.nx;
        const ecx = ex + fwdX * eyeFwd;
        const ecy = ey + fwdY * eyeFwd;
        const er = hr * 0.22;

        // Eye white with gradient
        const eyeGrd = ctx.createRadialGradient(
          ecx - er * 0.2, ecy - er * 0.25, er * 0.1,
          ecx, ecy, er
        );
        eyeGrd.addColorStop(0, '#ffffee');
        eyeGrd.addColorStop(0.7, '#e8e8d0');
        eyeGrd.addColorStop(1, '#c8c8a0');
        ctx.fillStyle = eyeGrd;
        ctx.beginPath();
        ctx.arc(ecx, ecy, er, 0, Math.PI * 2);
        ctx.fill();

        // Iris (animated look direction)
        const lookX = (mx - 0.5) * 0.25;
        const lookY = (my - 0.5) * 0.2;
        const ir = er * 0.65;
        const irisGrd = ctx.createRadialGradient(
          ecx + lookX * er, ecy + lookY * er, ir * 0.15,
          ecx + lookX * er, ecy + lookY * er, ir
        );
        irisGrd.addColorStop(0, '#ffcc00');
        irisGrd.addColorStop(0.4, '#ff8800');
        irisGrd.addColorStop(0.85, '#cc4400');
        irisGrd.addColorStop(1, '#661100');
        ctx.fillStyle = irisGrd;
        ctx.beginPath();
        ctx.arc(ecx + lookX * er, ecy + lookY * er, ir, 0, Math.PI * 2);
        ctx.fill();

        // Slit pupil
        ctx.fillStyle = '#000';
        ctx.save();
        ctx.translate(ecx + lookX * er, ecy + lookY * er);
        const slitAngle = Math.atan2(head.ny, head.nx);
        ctx.rotate(slitAngle);
        ctx.beginPath();
        ctx.ellipse(0, 0, ir * 0.18, ir * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Eye specular reflection
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.arc(ecx - er * 0.22, ecy - er * 0.25, er * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(ecx + er * 0.15, ecy + er * 0.15, er * 0.09, 0, Math.PI * 2);
        ctx.fill();

        // Eye outline
        ctx.strokeStyle = hsl(HUE_BASE, 40, 18, 0.6);
        ctx.lineWidth = er * 0.12;
        ctx.beginPath();
        ctx.arc(ecx, ecy, er, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── Forked tongue ──
      const tonguePhase = (Math.sin(t * 4) * 0.5 + 0.5); // 0-1 flick
      if (tonguePhase > 0.3) {
        const tLen = hr * (0.6 + tonguePhase * 0.8);
        const fwdX2 = -head.ny;
        const fwdY2 = head.nx;
        const tongueBase = { x: head.sx + fwdX2 * hr * 0.75, y: head.sy + fwdY2 * hr * 0.75 };
        const tongueTip = { x: tongueBase.x + fwdX2 * tLen, y: tongueBase.y + fwdY2 * tLen };
        const forkLen = tLen * 0.3;
        const forkSpread = hr * 0.25;

        ctx.strokeStyle = '#cc2244';
        ctx.lineWidth = hr * 0.08;
        ctx.lineCap = 'round';

        // Main tongue
        ctx.beginPath();
        ctx.moveTo(tongueBase.x, tongueBase.y);
        ctx.lineTo(tongueTip.x, tongueTip.y);
        ctx.stroke();

        // Fork left
        ctx.beginPath();
        ctx.moveTo(tongueTip.x, tongueTip.y);
        ctx.lineTo(
          tongueTip.x + fwdX2 * forkLen + head.nx * forkSpread,
          tongueTip.y + fwdY2 * forkLen + head.ny * forkSpread
        );
        ctx.stroke();

        // Fork right
        ctx.beginPath();
        ctx.moveTo(tongueTip.x, tongueTip.y);
        ctx.lineTo(
          tongueTip.x + fwdX2 * forkLen - head.nx * forkSpread,
          tongueTip.y + fwdY2 * forkLen - head.ny * forkSpread
        );
        ctx.stroke();
      }

      // ── Nostrils ──
      for (const s of [-1, 1]) {
        const nostrilX = head.sx + (-head.ny) * hr * 0.7 + head.nx * hr * 0.18 * s;
        const nostrilY = head.sy + head.nx * hr * 0.7 + head.ny * hr * 0.18 * s;
        ctx.fillStyle = hsl(HUE_BASE, 30, 15, 0.6);
        ctx.beginPath();
        ctx.ellipse(nostrilX, nostrilY, hr * 0.06, hr * 0.04, Math.atan2(head.ny, head.nx), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ─── Foreground sparkle particles ────────────────────────
    for (let pi = 0; pi < 20; pi++) {
      const seed = pi * 73.1;
      const px = noise(t * 0.3 + seed, seed + 300) * W * 0.5;
      const py = noise(t * 0.25 + seed * 0.6, seed + 400) * H * 0.4;
      const pz = -50 + noise(t * 0.2 + seed, seed + 500) * 80;
      const proj = project({ x: px, y: py, z: pz }, cx, cy, FOV);
      const pr = (1.5 + Math.sin(t * 1.2 + seed) * 1) * proj.scale;
      if (pr < 0.4) continue;
      const alpha = clamp(0.2 + Math.sin(t * 1.5 + seed * 3) * 0.15, 0.05, 0.4);
      ctx.fillStyle = hsl(152, 90, 80, alpha);
      ctx.shadowColor = hsl(152, 90, 70, 0.5);
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(proj.sx, proj.sy, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // ─── Tail energy trail ───────────────────────────────────
    const tailCount = 15;
    for (let ti = 0; ti < tailCount; ti++) {
      const tailIdx = SEGS - 1 - ti;
      if (tailIdx < 0) break;
      const seg = segData[tailIdx];
      if (seg.radius < 0.5) continue;
      const alpha = (1 - ti / tailCount) * 0.25;
      const pr = seg.radius * (0.5 + ti * 0.08);
      const offset = Math.sin(t * 3 + ti * 0.5) * seg.radius * 0.5;
      ctx.fillStyle = hsl(152 + ti * 5, 80, 60, alpha);
      ctx.beginPath();
      ctx.arc(seg.sx + seg.nx * offset, seg.sy + seg.ny * offset, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // ─── Loop ────────────────────────────────────────────────
    timeRef.current += 0.016;
    rafRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? rect.width / 2 : e.clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY ?? rect.height / 2 : e.clientY;
      mouseRef.current = {
        x: clamp((clientX - rect.left) / rect.width, 0, 1),
        y: clamp((clientY - rect.top) / rect.height, 0, 1),
      };
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('touchmove', handleMove, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
    };
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
