import { useRef, useState, useEffect, useCallback } from 'react';
import type { DevilFruitAbility } from '../types/game';
import { DEVIL_FRUITS } from '../types/game';

interface LeaderboardPlayer {
  name: string;
  score: number;
  length: number;
  color: string;
  isLocal: boolean;
}
// ─────────────────────────────────────────────────────────────────

interface GameHUDProps {
  score: number;
  length: number;
  playerCount: number;
  ping: number;
  connectionMode: 'online' | 'local';
  playerName: string;
  leaderboard: LeaderboardPlayer[];
  activeAbility?: DevilFruitAbility | null;
  abilityTimeLeft?: number;
  onBoostStart?: () => void;
  onBoostEnd?: () => void;
  onJoystickMove?: (dx: number, dy: number) => void;
}

export default function GameHUD({
  score,
  length,
  playerCount,
  ping,
  connectionMode,
  playerName,
  leaderboard,
  activeAbility,
  abilityTimeLeft,
  onBoostStart,
  onBoostEnd,
  onJoystickMove,
}: GameHUDProps) {
  const isMobile = useRef('ontouchstart' in window || navigator.maxTouchPoints > 0).current;
  const [compact, setCompact] = useState(false);
  const [prevScore, setPrevScore] = useState(score);
  const [scoreDelta, setScoreDelta] = useState(0);
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const check = () => setCompact(window.innerWidth < 600 || window.innerHeight < 450);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Score delta pop
  useEffect(() => {
    if (score > prevScore) {
      setScoreDelta(score - prevScore);
      if (deltaTimer.current) clearTimeout(deltaTimer.current);
      deltaTimer.current = setTimeout(() => setScoreDelta(0), 900);
    }
    setPrevScore(score);
  }, [score]);

  const pingColor = ping === 0 ? '#6b7280' : ping < 60 ? '#10b981' : ping < 120 ? '#f59e0b' : '#ef4444';
  const abilityDef = activeAbility ? DEVIL_FRUITS.find(d => d.ability === activeAbility) : null;
  const abilityPct = abilityDef && abilityTimeLeft && abilityDef.duration > 0
    ? abilityTimeLeft / abilityDef.duration : 0;

  return (
    <>
      {/* ── Score panel ── */}
      <div className="fixed z-40 pointer-events-none" style={{ top: compact ? 6 : 10, left: compact ? 6 : 12 }}>
        <div style={{
          background: 'rgba(8,13,26,0.86)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(16,185,129,0.22)',
          borderRadius: compact ? 10 : 14,
          padding: compact ? '5px 10px' : '8px 16px',
          minWidth: compact ? 110 : 145,
          boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
        }}>
          <div style={{ fontSize: compact ? 7 : 9, color: '#10b981', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>
            ⚔️ Bentropy Arena
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, position: 'relative' }}>
            <span style={{ fontSize: compact ? 22 : 30, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {score.toLocaleString()}
            </span>
            {scoreDelta > 0 && (
              <span key={score} style={{ fontSize: compact ? 11 : 13, color: '#10b981', fontWeight: 700, animation: 'scorePopUp 0.9s ease-out forwards', position: 'absolute', left: '105%', top: -4, whiteSpace: 'nowrap' }}>
                +{scoreDelta}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: compact ? 8 : 12, fontSize: compact ? 9 : 11, color: '#6b7280', marginTop: 3 }}>
            <span>🐍 {Math.floor(length)}</span>
            <span>👥 {playerCount}</span>
            {!isMobile && <span style={{ color: pingColor }}>{connectionMode === 'online' ? `${ping}ms` : '⚡ local'}</span>}
          </div>
        </div>
        {!compact && (
          <div style={{ marginTop: 4, background: 'rgba(8,13,26,0.72)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '3px 10px', fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: connectionMode === 'online' ? '#10b981' : '#f59e0b', display: 'inline-block' }} />
            {playerName}
          </div>
        )}
      </div>

      {/* ── Active ability bar ── */}
      {abilityDef && (
        <div className="fixed z-40" style={{ top: compact ? 65 : 95, left: compact ? 6 : 12 }}>
          <div style={{
            background: 'rgba(8,13,26,0.9)',
            backdropFilter: 'blur(14px)',
            border: `1px solid ${abilityDef.color}45`,
            borderLeft: `3px solid ${abilityDef.color}`,
            borderRadius: compact ? 8 : 12,
            padding: compact ? '4px 8px' : '6px 12px',
            minWidth: compact ? 120 : 158,
            boxShadow: `0 0 22px ${abilityDef.glowColor}22`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ fontSize: compact ? 16 : 20 }}>{abilityDef.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: compact ? 9 : 11, fontWeight: 700, color: '#fff' }}>{abilityDef.name}</div>
                <div style={{ fontSize: compact ? 7 : 9, color: '#9ca3af' }}>{abilityDef.description}</div>
              </div>
              <div style={{ fontSize: compact ? 14 : 18, fontWeight: 900, color: abilityDef.color, fontVariantNumeric: 'tabular-nums' }}>
                {abilityTimeLeft ?? 0}s
              </div>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${abilityPct * 100}%`, background: `linear-gradient(90deg,${abilityDef.glowColor},${abilityDef.color})`, borderRadius: 2, transition: 'width 0.2s linear', boxShadow: `0 0 6px ${abilityDef.glowColor}` }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Leaderboard ── */}
      <div className="fixed z-40" style={{
        top: compact
          ? (abilityDef ? 100 : 52)
          : (abilityDef ? (isMobile ? 140 : 178) : (isMobile ? 76 : 108)),
        left: compact ? 4 : (isMobile ? 6 : 12),
        width: compact ? 130 : (isMobile ? 155 : 200),
      }}>
        <div style={{
          background: compact ? 'rgba(8,13,26,0.78)' : 'rgba(8,13,26,0.88)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: compact ? 8 : 14,
          padding: compact ? '5px 6px' : '10px 12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          {!compact && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
              <span style={{ fontSize: 12 }}>🏆</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#10b981', letterSpacing: 2, textTransform: 'uppercase' }}>Top 10</span>
            </div>
          )}
          {compact && (
            <div style={{ fontSize: 7, fontWeight: 700, color: '#10b981', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
              🏆 Top
            </div>
          )}
          {leaderboard.slice(0, compact ? 5 : 10).map((p, i) => {
            const medals = ['🥇', '🥈', '🥉'];
            const nameColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
            const isFirst = i === 0;
            return (
              <div key={p.name + i} style={{
                display: 'flex', alignItems: 'center', gap: compact ? 3 : 6,
                padding: compact ? '1.5px 3px' : '3px 6px',
                borderRadius: compact ? 4 : 8,
                background: p.isLocal ? 'rgba(16,185,129,0.12)' : isFirst ? 'rgba(255,215,0,0.06)' : 'transparent',
                border: p.isLocal ? '1px solid rgba(16,185,129,0.22)' : '1px solid transparent',
                fontSize: compact ? 8 : (isMobile ? 10 : 12),
                marginBottom: compact ? 0 : 2,
                transition: 'background 0.2s',
              }}>
                <span style={{ fontSize: compact ? 7 : (isMobile ? 9 : 11), minWidth: compact ? 13 : 18, textAlign: 'center', color: '#4b5563', fontWeight: 700 }}>
                  {i < 3 ? medals[i] : `${i + 1}`}
                </span>
                {!compact && <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0, boxShadow: `0 0 6px ${p.color}60` }} />}
                <span style={{
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: i < 3 ? nameColors[i] : p.isLocal ? '#fff' : '#9ca3af',
                  fontWeight: p.isLocal || i < 3 ? 700 : 400,
                  position: 'relative', display: 'inline-flex', alignItems: 'center',
                }}>
                  {!compact && isFirst && <span style={{ fontSize: 9, marginRight: 1, verticalAlign: 'top' }}>👑</span>}
                  {p.name}
                </span>
                <span style={{ fontSize: compact ? 7 : (isMobile ? 8 : 10), color: '#6b7280', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {compact ? Math.floor(p.length) : `🐍 ${Math.floor(p.length)}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Desktop hint ── */}
      {!isMobile && (
        <div className="fixed bottom-4 left-4 z-40" style={{ pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(8,13,26,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '6px 12px', fontSize: 11, color: '#4b5563', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span>🖱️ Mouse para mover</span>
            <span>🔥 Clique para boost</span>
          </div>
        </div>
      )}

      {/* ── Mobile boost button ── */}
      {isMobile && (
        <div className="fixed z-50" style={{ bottom: compact ? 8 : 24, right: compact ? 8 : 20 }}>
          <button
            style={{ width: compact ? 58 : 72, height: compact ? 58 : 72, borderRadius: '50%', background: 'linear-gradient(135deg,#f97316,#dc2626)', border: '2px solid rgba(249,115,22,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 0 22px rgba(249,115,22,0.3),0 4px 14px rgba(0,0,0,0.4)', userSelect: 'none', WebkitTapHighlightColor: 'transparent', touchAction: 'none' }}
            onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); onBoostStart?.(); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onBoostEnd?.(); }}
            onTouchCancel={(e) => { e.preventDefault(); onBoostEnd?.(); }}
          >
            <span style={{ fontSize: compact ? 24 : 30, pointerEvents: 'none' }}>🔥</span>
          </button>
          <div style={{ textAlign: 'center', fontSize: compact ? 7 : 9, color: '#6b7280', marginTop: 3, pointerEvents: 'none' }}>BOOST</div>
        </div>
      )}

      {/* ── Mobile joystick ── */}
      {isMobile && (
        <div className="fixed z-50" style={{ bottom: compact ? 6 : 14, left: compact ? 6 : 14 }}>
          <VirtualJoystick onMove={onJoystickMove} size={compact ? 90 : 116} />
        </div>
      )}

      <style>{`
        @keyframes scorePopUp {
          0%   { opacity:1; transform:translateY(0) scale(1); }
          60%  { opacity:1; transform:translateY(-18px) scale(1.25); }
          100% { opacity:0; transform:translateY(-32px) scale(0.9); }
        }
      `}</style>
    </>
  );
}

// ── Virtual Joystick ─────────────────────────────────────────────
function VirtualJoystick({ onMove, size = 110 }: { onMove?: (dx: number, dy: number) => void; size?: number }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [thumbPos, setThumbPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const touchIdRef = useRef<number | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const thumbSize = Math.round(size * 0.35);

  const updatePosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!outerRef.current) return;
      const rect = outerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxR = rect.width / 2 - thumbSize / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
      setThumbPos({ x: dx, y: dy });
      if (dist > 5) onMoveRef.current?.(dx / dist, dy / dist);
    },
    [thumbSize],
  );

  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      if (touchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          updatePosition(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          e.preventDefault(); break;
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (touchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          touchIdRef.current = null;
          setThumbPos({ x: 0, y: 0 });
          setActive(false); break;
        }
      }
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [updatePosition]);

  const activeColor = active ? 'rgba(16,185,129,0.28)' : 'rgba(255,255,255,0.06)';
  const borderColor = active ? 'rgba(16,185,129,0.55)' : 'rgba(255,255,255,0.14)';

  return (
    <div
      ref={outerRef}
      style={{ width: size, height: size, borderRadius: '50%', background: activeColor, border: `2px solid ${borderColor}`, position: 'relative', touchAction: 'none', userSelect: 'none', transition: 'background 0.12s, border-color 0.12s' }}
      onTouchStart={(e) => {
        e.preventDefault(); e.stopPropagation();
        const t = e.touches[0];
        touchIdRef.current = t.identifier;
        setActive(true);
        updatePosition(t.clientX, t.clientY);
      }}
    >
      <div style={{ position: 'absolute', top: '50%', left: 6, right: 6, height: 1, background: 'rgba(255,255,255,0.08)', transform: 'translateY(-50%)' }} />
      <div style={{ position: 'absolute', left: '50%', top: 6, bottom: 6, width: 1, background: 'rgba(255,255,255,0.08)', transform: 'translateX(-50%)' }} />
      <div
        style={{ width: thumbSize, height: thumbSize, borderRadius: '50%', background: active ? 'rgba(16,185,129,0.55)' : 'rgba(255,255,255,0.18)', position: 'absolute', top: '50%', left: '50%', transform: `translate(calc(-50% + ${thumbPos.x}px), calc(-50% + ${thumbPos.y}px))`, pointerEvents: 'none', boxShadow: active ? '0 0 14px rgba(16,185,129,0.4)' : 'none', transition: thumbPos.x === 0 && thumbPos.y === 0 ? 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1)' : 'none' }}
      />
      {(['▲','▼','◀','▶'] as const).map((a, i) => (
        <span key={i} style={{ position: 'absolute', fontSize: size * 0.07, color: 'rgba(255,255,255,0.18)', pointerEvents: 'none', ...[{ top: 2, left: '50%', transform: 'translateX(-50%)' }, { bottom: 2, left: '50%', transform: 'translateX(-50%)' }, { left: 3, top: '50%', transform: 'translateY(-50%)' }, { right: 3, top: '50%', transform: 'translateY(-50%)' }][i] }}>{a}</span>
      ))}
    </div>
  );
}
