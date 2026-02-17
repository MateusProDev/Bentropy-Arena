import { useRef, useState, useEffect, useCallback } from 'react';
import type { DevilFruitAbility } from '../types/game';
import { DEVIL_FRUITS } from '../types/game';

interface LeaderboardPlayer {
  name: string;
  score: number;
  color: string;
  isLocal: boolean;
}

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

  useEffect(() => {
    const check = () => setCompact(window.innerHeight < 450);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <>
      {/* ======== Score — top-left ======== */}
      <div
        className="fixed z-40"
        style={{ top: compact ? 4 : 8, left: compact ? 4 : 8 }}
      >
        <div className="glass" style={{ padding: compact ? '3px 8px' : '6px 14px' }}>
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-medium" style={{ fontSize: compact ? 9 : 12 }}>
              Score
            </span>
            <span className="text-white font-bold tabular-nums" style={{ fontSize: compact ? 14 : 20 }}>
              {score.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2 text-gray-400" style={{ fontSize: compact ? 8 : 11 }}>
            <span>🐍 {length}</span>
            <span>👥 {playerCount}</span>
            {!isMobile && (
              <>
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    connectionMode === 'online' ? 'bg-emerald-400' : 'bg-yellow-400'
                  }`}
                />
                <span>{ping}ms</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ======== Player name — top-center (hidden in compact landscape) ======== */}
      {!compact && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40">
          <div className="glass px-3 py-1 text-xs text-white font-medium">{playerName}</div>
        </div>
      )}

      {/* ======== Active Ability indicator — below score ======== */}
      {activeAbility && (() => {
        const def = DEVIL_FRUITS.find(d => d.ability === activeAbility);
        if (!def) return null;
        return (
          <div
            className="fixed z-40"
            style={{ top: compact ? 34 : 58, left: compact ? 4 : 8 }}
          >
            <div
              className="glass flex items-center gap-1.5 animate-pulse"
              style={{
                padding: compact ? '2px 8px' : '4px 12px',
                borderLeft: `3px solid ${def.color}`,
              }}
            >
              <span style={{ fontSize: compact ? 12 : 16 }}>{def.emoji}</span>
              <div>
                <div className="text-white font-bold" style={{ fontSize: compact ? 9 : 11 }}>
                  {def.name}
                </div>
                <div className="text-gray-400" style={{ fontSize: compact ? 7 : 9 }}>
                  {def.description} — {abilityTimeLeft ?? 0}s
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======== Ranking Top 10 — below score (left side) ======== */}
      {!compact && (
        <div
          className="fixed z-40"
          style={{ top: activeAbility ? 100 : 62, left: 8, width: isMobile ? 150 : 185 }}
        >
          <div className="glass px-2 py-1.5" style={{ background: 'rgba(0,0,0,0.55)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span style={{ fontSize: 10 }}>🏆</span>
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Ranking</span>
            </div>
            <div className="flex flex-col gap-px">
              {leaderboard.slice(0, 10).map((p, i) => {
                const crown = i === 0 ? '👑 ' : i === 1 ? '🪙 ' : i === 2 ? '🥉 ' : '';
                const nameColor = i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : undefined;
                return (
                  <div
                    key={p.name + i}
                    className={`flex items-center gap-1.5 py-px px-1 rounded ${
                      p.isLocal ? 'bg-white/10' : ''
                    }`}
                    style={{ fontSize: isMobile ? 9 : 11 }}
                  >
                    <span className="text-gray-500 w-3 text-right font-mono" style={{ fontSize: isMobile ? 8 : 9 }}>
                      {i + 1}
                    </span>
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span
                      className={`truncate flex-1 ${
                        p.isLocal ? 'font-semibold' : ''
                      }`}
                      style={{ color: nameColor || (p.isLocal ? '#fff' : '#9ca3af') }}
                    >
                      {crown}{p.name}
                    </span>
                    <span className="text-gray-500 tabular-nums" style={{ fontSize: isMobile ? 8 : 9 }}>
                      {p.score.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ======== Desktop-only: Controls help ======== */}
      {!isMobile && (
        <div className="fixed bottom-4 left-4 z-40">
          <div className="glass px-4 py-2 text-xs text-gray-500 flex flex-col gap-1">
            <span>🖱️ Mova o mouse para controlar</span>
            <span>🔥 Segure o clique para boost</span>
          </div>
        </div>
      )}

      {/* ======== MOBILE: Boost button — bottom-right ======== */}
      {isMobile && (
        <div
          className="fixed z-50"
          style={{ bottom: compact ? 6 : 20, right: compact ? 6 : 16 }}
        >
          <button
            className="rounded-full bg-gradient-to-br from-orange-500 to-red-600
                       flex items-center justify-center shadow-lg shadow-orange-500/30
                       active:scale-90 transition-transform
                       border-2 border-orange-400/50 select-none touch-none"
            style={{ width: compact ? 52 : 65, height: compact ? 52 : 65 }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBoostStart?.();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBoostEnd?.();
            }}
            onTouchCancel={(e) => {
              e.preventDefault();
              onBoostEnd?.();
            }}
          >
            <span
              className="text-white font-black pointer-events-none"
              style={{ fontSize: compact ? 16 : 22 }}
            >
              🔥
            </span>
          </button>
          <span
            className="block text-center text-gray-400 pointer-events-none"
            style={{ fontSize: compact ? 6 : 8, marginTop: 2 }}
          >
            BOOST
          </span>
        </div>
      )}

      {/* ======== MOBILE: Virtual Joystick — bottom-left ======== */}
      {isMobile && (
        <div
          className="fixed z-50"
          style={{ bottom: compact ? 4 : 10, left: compact ? 4 : 10 }}
        >
          <VirtualJoystick onMove={onJoystickMove} size={compact ? 85 : 110} />
        </div>
      )}
    </>
  );
}

// ============================================
// Virtual Joystick Component
// ============================================

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
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxRadius = rect.width / 2 - thumbSize / 2;

      let dx = clientX - centerX;
      let dy = clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }

      setThumbPos({ x: dx, y: dy });

      if (dist > 5) {
        onMoveRef.current?.(dx / dist, dy / dist);
      }
    },
    [thumbSize],
  );

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (touchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          updatePosition(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          e.preventDefault();
          break;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          touchIdRef.current = null;
          setThumbPos({ x: 0, y: 0 });
          setActive(false);
          break;
        }
      }
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [updatePosition]);

  return (
    <div
      ref={outerRef}
      className="rounded-full bg-white/[0.07] border-2 border-white/[0.15] relative touch-none select-none"
      style={{ width: size, height: size }}
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        touchIdRef.current = touch.identifier;
        setActive(true);
        updatePosition(touch.clientX, touch.clientY);
      }}
    >
      {/* Cross-hairs */}
      <div className="absolute top-1/2 left-2 right-2 h-px bg-white/10 -translate-y-1/2" />
      <div className="absolute left-1/2 top-2 bottom-2 w-px bg-white/10 -translate-x-1/2" />

      {/* Thumb */}
      <div
        className={`rounded-full absolute top-1/2 left-1/2 pointer-events-none transition-colors duration-75
          ${active ? 'bg-white/30 shadow-lg shadow-emerald-500/20' : 'bg-white/15'}`}
        style={{
          width: thumbSize,
          height: thumbSize,
          transform: `translate(calc(-50% + ${thumbPos.x}px), calc(-50% + ${thumbPos.y}px))`,
        }}
      />

      {/* Direction arrows */}
      <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-white/20 pointer-events-none" style={{ fontSize: size * 0.07 }}>▲</span>
      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-white/20 pointer-events-none" style={{ fontSize: size * 0.07 }}>▼</span>
      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" style={{ fontSize: size * 0.07 }}>◀</span>
      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" style={{ fontSize: size * 0.07 }}>▶</span>
    </div>
  );
}
