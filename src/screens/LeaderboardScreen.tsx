import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { getLeaderboard } from '../services/leaderboard';
import type { LeaderboardEntry } from '../types/game';

export default function LeaderboardScreen() {
  const { setScreen } = useGameStore();
  const { user } = useAuthStore();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'highScore' | 'totalKills' | 'longestSnake'>('highScore');

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    setLoading(true);
    const data = await getLeaderboard(50);
    setEntries(data);
    setLoading(false);
  };

  const sortedEntries = [...entries].sort((a, b) => {
    return (b[sortBy] || 0) - (a[sortBy] || 0);
  });

  const getRankBadge = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  const getRankColor = (index: number) => {
    if (index === 0) return 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/30';
    if (index === 1) return 'from-gray-400/20 to-gray-500/5 border-gray-400/30';
    if (index === 2) return 'from-orange-500/20 to-orange-600/5 border-orange-500/30';
    return 'from-transparent to-transparent border-gray-800';
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-950 relative overflow-hidden overflow-y-auto">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] sm:w-[800px] h-[200px] sm:h-[400px] bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-3 py-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-8">
          <button
            onClick={() => setScreen('menu')}
            className="flex items-center gap-1 sm:gap-2 text-gray-400 hover:text-white transition-colors cursor-pointer text-sm sm:text-base"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </button>
          <h1 className="text-lg sm:text-2xl font-black text-white">
            🏆 Ranking
          </h1>
          <button
            onClick={loadLeaderboard}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Atualizar"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Sort tabs */}
        <div className="flex gap-1.5 sm:gap-2 mb-4 sm:mb-6">
          {[
            { key: 'highScore' as const, label: 'Pontuação', shortLabel: 'Pts', icon: '⭐' },
            { key: 'totalKills' as const, label: 'Eliminações', shortLabel: 'Kills', icon: '💀' },
            { key: 'longestSnake' as const, label: 'Maior Cobra', shortLabel: 'Cobra', icon: '🐍' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSortBy(tab.key)}
              className={`flex-1 py-2 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer
                ${sortBy === tab.key
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-gray-800/50 text-gray-400 border border-gray-800 hover:border-gray-700'
                }`}
            >
              {tab.icon} <span className="hidden sm:inline">{tab.label}</span><span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Entries */}
        {!loading && sortedEntries.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-4xl mb-4">🏜️</p>
            <p className="text-lg">Nenhum jogador ainda.</p>
            <p className="text-sm mt-1">Seja o primeiro a jogar!</p>
          </div>
        )}

        {!loading && (
          <div className="space-y-1.5 sm:space-y-2">
            {sortedEntries.map((entry, index) => (
              <div
                key={entry.uid}
                className={`flex items-center gap-2 sm:gap-4 p-2.5 sm:p-4 rounded-xl border bg-gradient-to-r transition-all
                  ${getRankColor(index)}
                  ${entry.uid === user?.uid ? 'ring-1 ring-emerald-500/50' : ''}
                `}
              >
                {/* Rank */}
                <div className="w-8 sm:w-12 text-center text-sm sm:text-lg font-bold shrink-0">
                  {getRankBadge(index)}
                </div>

                {/* Avatar */}
                {entry.photoURL ? (
                  <img
                    src={entry.photoURL}
                    alt={entry.displayName}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-gray-700 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 font-bold text-sm sm:text-base shrink-0">
                    {entry.displayName[0]?.toUpperCase()}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm sm:text-base truncate">
                    {entry.displayName}
                    {entry.uid === user?.uid && (
                      <span className="text-emerald-400 text-[10px] sm:text-xs ml-1 sm:ml-2">(você)</span>
                    )}
                  </p>
                  <p className="text-gray-500 text-[10px] sm:text-xs">
                    {entry.gamesPlayed} partidas
                  </p>
                </div>

                {/* Score */}
                <div className="text-right shrink-0">
                  <p className="text-white font-bold text-sm sm:text-lg">
                    {(entry[sortBy] || 0).toLocaleString()}
                  </p>
                  <p className="text-gray-500 text-[10px] sm:text-xs">
                    {sortBy === 'highScore' ? 'pts' : sortBy === 'totalKills' ? 'kills' : 'seg'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
