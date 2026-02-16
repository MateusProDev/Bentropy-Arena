import { useRef, useState, useEffect, useCallback } from 'react';

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
  onBoostStart,
  onBoostEnd,
  onJoystickMove,
}: GameHUDProps) {
  return (
    <>
      {/* Top-left: Score — compact on mobile */}
      <div className="fixed top-2 left-2 sm:top-4 sm:left-4 z-40">
        <div className="glass px-3 py-2 sm:px-5 sm:py-3 flex flex-col gap-0.5 sm:gap-1">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-emerald-400 text-[10px] sm:text-sm font-medium">Score</span>
            <span className="text-white font-bold text-lg sm:text-2xl tabular-nums">{score.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-400">
            <span>🐍 {length}</span>
            <span>👥 {playerCount}</span>
          </div>
        </div>
      </div>

      {/* Desktop only: Leaderboard (offset down for minimap above it) */}
      <div className="fixed top-[170px] right-4 z-40 w-48 hidden sm:block">
        <div className="glass px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">🏆 Top</span>
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className={`w-1.5 h-1.5 rounded-full ${connectionMode === 'online' ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
              <span className="text-gray-500">{ping}ms</span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            {leaderboard.slice(0, 8).map((p, i) => (
              <div
                key={p.name + i}
                className={`flex items-center gap-2 text-xs py-0.5 px-1 rounded ${p.isLocal ? 'bg-white/10' : ''}`}
              >
                <span className="text-gray-500 w-4 text-right font-mono text-[10px]">{i + 1}</span>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className={`truncate flex-1 ${p.isLocal ? 'text-white font-semibold' : 'text-gray-400'}`}>
                  {p.name}
                </span>
                <span className="text-gray-500 tabular-nums text-[10px]">{p.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop: Bottom-left controls help (hidden on mobile) */}
      <div className="fixed bottom-4 left-4 z-40 hidden sm:block">
        <div className="glass px-4 py-2 text-xs text-gray-500 flex flex-col gap-1">
          <span>🖱️ Mova o mouse para controlar</span>
          <span>🔥 Segure o clique para boost</span>
        </div>
      </div>

      {/* Top-center: Player name — smaller on mobile */}
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40">
        <div className="glass px-3 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm text-white font-medium">
          {playerName}
        </div>
      </div>

      {/* =========================================
          MOBILE: Boost button (bottom-right)
          ========================================= */}
      <div className="fixed bottom-8 right-6 z-50 sm:hidden">
        <button
          className="w-[70px] h-[70px] rounded-full bg-gradient-to-br from-orange-500 to-red-600 
                     flex items-center justify-center shadow-lg shadow-orange-500/30
                     active:scale-90 transition-transform
                     border-2 border-orange-400/50 select-none touch-none"
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
          <span className="text-white text-2xl font-black pointer-events-none">🔥</span>
        </button>
        <span className="block text-center text-[8px] text-gray-400 mt-1 pointer-events-none">BOOST</span>
      </div>

      {/* =========================================
          MOBILE: Virtual Joystick (bottom-left)
          ========================================= */}
      <div className="fixed bottom-4 left-4 z-50 sm:hidden">
        <VirtualJoystick onMove={onJoystickMove} />
      </div>
    </>
  );
}

// ============================================
// Virtual Joystick Component (PS2-style)
// ============================================

function VirtualJoystick({ onMove }: { onMove?: (dx: number, dy: number) => void }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [thumbPos, setThumbPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const touchIdRef = useRef<number | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const updatePosition = useCallback((clientX: number, clientY: number) => {
    if (!outerRef.current) return;
    const rect = outerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width / 2 - 14;

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
  }, []);

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
      className="w-[120px] h-[120px] rounded-full bg-white/[0.07] border-2 border-white/[0.15] relative touch-none select-none"
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
      <div className="absolute top-1/2 left-3 right-3 h-px bg-white/10 -translate-y-1/2" />
      <div className="absolute left-1/2 top-3 bottom-3 w-px bg-white/10 -translate-x-1/2" />

      {/* Thumb */}
      <div
        className={`w-11 h-11 rounded-full absolute top-1/2 left-1/2 pointer-events-none transition-colors duration-75
          ${active ? 'bg-white/30 shadow-lg shadow-emerald-500/20' : 'bg-white/15'}`}
        style={{
          transform: `translate(calc(-50% + ${thumbPos.x}px), calc(-50% + ${thumbPos.y}px))`,
        }}
      />

      {/* Direction arrows */}
      <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-white/20 pointer-events-none">▲</span>
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-white/20 pointer-events-none">▼</span>
      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[8px] text-white/20 pointer-events-none">◀</span>
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-white/20 pointer-events-none">▶</span>
    </div>
  );
}
