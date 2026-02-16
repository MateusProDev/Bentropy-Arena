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
}

export default function GameHUD({
  score,
  length,
  playerCount,
  ping,
  connectionMode,
  playerName,
  leaderboard,
}: GameHUDProps) {
  return (
    <>
      {/* Top-left: Score */}
      <div className="fixed top-4 left-4 z-40">
        <div className="glass px-5 py-3 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-sm font-medium">Score</span>
            <span className="text-white font-bold text-2xl tabular-nums">{score.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>🐍 {length} seg</span>
            <span>👥 {playerCount}</span>
          </div>
        </div>
      </div>

      {/* Top-right: In-game leaderboard */}
      <div className="fixed top-4 right-4 z-40 w-48">
        <div className="glass px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">🏆 Top</span>
            <div className="flex items-center gap-2 text-[10px]">
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
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className={`truncate flex-1 ${p.isLocal ? 'text-white font-semibold' : 'text-gray-400'}`}>
                  {p.name}
                </span>
                <span className="text-gray-500 tabular-nums text-[10px]">{p.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom-left: Controls help */}
      <div className="fixed bottom-4 left-4 z-40">
        <div className="glass px-4 py-2 text-xs text-gray-500 flex flex-col gap-1">
          <span>🖱️ Mova o mouse para controlar</span>
          <span>🔥 Segure o clique para boost</span>
        </div>
      </div>

      {/* Top-center: Player name */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40">
        <div className="glass px-4 py-2 text-sm text-white font-medium">
          {playerName}
        </div>
      </div>
    </>
  );
}
