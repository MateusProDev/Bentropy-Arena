interface DeathModalProps {
  score: number;
  length: number;
  killedBy: string | null;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
}

export default function DeathModal({
  score,
  length,
  killedBy,
  onPlayAgain,
  onBackToMenu,
}: DeathModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="card max-w-md w-full mx-4 text-center animate-in fade-in zoom-in duration-300">
        {/* Death icon */}
        <div className="text-6xl mb-4">💀</div>

        <h2 className="text-3xl font-black text-white mb-2">Game Over!</h2>

        {killedBy && (
          <p className="text-gray-400 mb-4">
            Eliminado por <span className="text-red-400 font-bold">{killedBy}</span>
          </p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 my-6">
          <div className="bg-gray-800/50 rounded-xl p-4">
            <p className="text-3xl font-black text-emerald-400">{score.toLocaleString()}</p>
            <p className="text-gray-500 text-sm mt-1">Pontuação</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-4">
            <p className="text-3xl font-black text-blue-400">{length}</p>
            <p className="text-gray-500 text-sm mt-1">Tamanho</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onPlayAgain}
            className="btn-primary w-full text-lg py-4"
          >
            🔄 Jogar Novamente
          </button>
          <button
            onClick={onBackToMenu}
            className="btn-secondary w-full"
          >
            ← Menu Principal
          </button>
        </div>
      </div>
    </div>
  );
}
