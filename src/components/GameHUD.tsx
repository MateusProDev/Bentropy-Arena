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

      {/* Top-right: Leaderboard — hidden on very small screens, compact on mobile */}
      <div className="fixed top-2 right-2 sm:top-4 sm:right-4 z-40 w-36 sm:w-48 hidden xs:block">
        <div className="glass px-2 py-1.5 sm:px-3 sm:py-2">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[9px] sm:text-xs font-bold text-gray-300 uppercase tracking-wider">🏆 Top</span>
            <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px]">
              <div className={`w-1.5 h-1.5 rounded-full ${connectionMode === 'online' ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
              <span className="text-gray-500">{ping}ms</span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            {leaderboard.slice(0, 5).map((p, i) => (
              <div
                key={p.name + i}
                className={`flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs py-0.5 px-1 rounded ${p.isLocal ? 'bg-white/10' : ''}`}
              >
                <span className="text-gray-500 w-3 sm:w-4 text-right font-mono text-[9px] sm:text-[10px]">{i + 1}</span>
                <div
                  className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className={`truncate flex-1 ${p.isLocal ? 'text-white font-semibold' : 'text-gray-400'}`}>
                  {p.name}
                </span>
                <span className="text-gray-500 tabular-nums text-[9px] sm:text-[10px]">{p.score.toLocaleString()}</span>
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
      <div className="fixed bottom-6 right-6 z-50 sm:hidden">
        <button
          className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-red-600 
                     flex items-center justify-center shadow-lg shadow-orange-500/30
                     active:scale-90 active:shadow-orange-500/50 transition-transform
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
        <span className="block text-center text-[9px] text-gray-400 mt-1 pointer-events-none">BOOST</span>
      </div>

      {/* MOBILE: Direction hint (bottom-left) */}
      <div className="fixed bottom-6 left-4 z-40 sm:hidden">
        <div className="glass px-3 py-1.5 text-[10px] text-gray-500">
          👆 Toque na tela para direcionar
        </div>
      </div>
    </>
  );
}
