interface GameHUDProps {
  score: number;
  length: number;
  playerCount: number;
  ping: number;
  connectionMode: 'online' | 'local';
  playerName: string;
}

export default function GameHUD({
  score,
  length,
  playerCount,
  ping,
  connectionMode,
  playerName,
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

      {/* Top-right: Connection info */}
      <div className="fixed top-4 right-4 z-40">
        <div className="glass px-4 py-2 flex items-center gap-3 text-xs">
          <div className={`w-2 h-2 rounded-full ${connectionMode === 'online' ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
          <span className="text-gray-400">
            {connectionMode === 'online' ? 'Online' : 'Local + Bots'}
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">{ping}ms</span>
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
