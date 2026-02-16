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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="card max-w-md w-full text-center animate-in fade-in zoom-in duration-300 !p-5 sm:!p-8">
        {/* Death icon */}
        <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">💀</div>

        <h2 className="text-2xl sm:text-3xl font-black text-white mb-1.5 sm:mb-2">Game Over!</h2>

        {killedBy && (
          <p className="text-gray-400 text-sm sm:text-base mb-3 sm:mb-4">
            Eliminado por <span className="text-red-400 font-bold">{killedBy}</span>
          </p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 my-4 sm:my-6">
          <div className="bg-gray-800/50 rounded-xl p-3 sm:p-4">
            <p className="text-2xl sm:text-3xl font-black text-emerald-400">{score.toLocaleString()}</p>
            <p className="text-gray-500 text-xs sm:text-sm mt-1">Pontuação</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 sm:p-4">
            <p className="text-2xl sm:text-3xl font-black text-blue-400">{length}</p>
            <p className="text-gray-500 text-xs sm:text-sm mt-1">Tamanho</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5 sm:gap-3">
          <button
            onClick={onPlayAgain}
            className="btn-primary w-full text-base sm:text-lg py-3 sm:py-4"
          >
            🔄 Jogar Novamente
          </button>
          <button
            onClick={onBackToMenu}
            className="btn-secondary w-full text-sm sm:text-base py-2.5 sm:py-3"
          >
            ← Menu Principal
          </button>
        </div>
      </div>
    </div>
  );
}
