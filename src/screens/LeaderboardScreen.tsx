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

  const top3 = sortedEntries.slice(0, 3);
  const rest = sortedEntries.slice(3);

  const getSortLabel = () => {
    if (sortBy === 'highScore') return 'pts';
    if (sortBy === 'totalKills') return 'kills';
    return 'seg';
  };

  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const podiumHeights = ['h-20', 'h-28', 'h-16'];
  const podiumColors = [
    'from-gray-400/30 to-gray-500/10 border-gray-400/40',
    'from-yellow-500/30 to-yellow-600/10 border-yellow-500/50',
    'from-orange-600/25 to-orange-700/10 border-orange-600/40',
  ];
  const podiumBadges = ['🥈', '🥇', '🥉'];
  const podiumBadgeSizes = ['text-2xl', 'text-3xl', 'text-2xl'];
  const podiumNameSizes = ['text-xs', 'text-sm font-bold', 'text-xs'];
  const podiumAvatarSizes = [
    'w-10 h-10 sm:w-12 sm:h-12',
    'w-14 h-14 sm:w-16 sm:h-16 ring-2 ring-yellow-500/60',
    'w-10 h-10 sm:w-12 sm:h-12',
  ];

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-950 relative overflow-hidden overflow-y-auto">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] sm:w-[900px] h-[250px] sm:h-[450px] bg-emerald-500/4 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-yellow-500/3 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-3 py-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 sm:mb-5">
          <button
            onClick={() => setScreen('menu')}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors cursor-pointer text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Menu
          </button>
          <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
            🏆 <span className="text-emerald-400">Ranking</span>
          </h1>
          <button
            onClick={loadLeaderboard}
            className={`text-gray-400 hover:text-emerald-400 transition-all cursor-pointer ${loading ? 'animate-spin' : ''}`}
            title="Atualizar"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Sort tabs — compact pill style */}
        <div className="flex gap-1 mb-4 bg-gray-900/60 p-1 rounded-xl border border-gray-800/50">
          {[
            { key: 'highScore' as const, label: 'Pontuação', icon: '⭐' },
            { key: 'totalKills' as const, label: 'Eliminações', icon: '💀' },
            { key: 'longestSnake' as const, label: 'Maior Cobra', icon: '🐍' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSortBy(tab.key)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] sm:text-xs font-medium transition-all cursor-pointer
                ${sortBy === tab.key
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm shadow-emerald-500/10'
                  : 'text-gray-500 hover:text-gray-300'
                }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && sortedEntries.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-4xl mb-4">🏜️</p>
            <p className="text-lg">Nenhum jogador ainda.</p>
            <p className="text-sm mt-1">Seja o primeiro a jogar!</p>
          </div>
        )}

        {!loading && sortedEntries.length > 0 && (
          <>
            {/* Podium — top 3 */}
            {top3.length >= 3 && (
              <div className="flex items-end justify-center gap-2 sm:gap-3 mb-5 px-2">
                {podiumOrder.map((entry, i) => (
                  <div key={entry.uid} className="flex flex-col items-center flex-1 max-w-[130px]">
                    {/* Badge */}
                    <span className={`${podiumBadgeSizes[i]} mb-1`}>{podiumBadges[i]}</span>
                    {/* Avatar */}
                    {entry.photoURL ? (
                      <img
                        src={entry.photoURL}
                        alt={entry.displayName}
                        className={`${podiumAvatarSizes[i]} rounded-full border border-gray-700 mb-1.5`}
                      />
                    ) : (
                      <div className={`${podiumAvatarSizes[i]} rounded-full bg-gray-800 flex items-center justify-center text-gray-300 font-bold mb-1.5`}>
                        {entry.displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    {/* Name */}
                    <p className={`text-white ${podiumNameSizes[i]} truncate max-w-full text-center`}>
                      {entry.displayName}
                      {entry.uid === user?.uid && <span className="text-emerald-400 text-[9px] ml-0.5">•</span>}
                    </p>
                    {/* Score */}
                    <p className="text-emerald-400 text-xs font-bold mt-0.5">
                      {(entry[sortBy] || 0).toLocaleString()}
                    </p>
                    {/* Podium bar */}
                    <div className={`w-full ${podiumHeights[i]} mt-2 rounded-t-xl bg-gradient-to-t border border-b-0 ${podiumColors[i]} flex items-center justify-center`}>
                      <span className="text-gray-400 text-[10px] font-medium">
                        {entry.gamesPlayed} 🎮
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Rest of leaderboard — compact table */}
            {rest.length > 0 && (
              <div className="space-y-1">
                {rest.map((entry, index) => {
                  const rank = index + 4;
                  return (
                    <div
                      key={entry.uid}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all
                        ${entry.uid === user?.uid
                          ? 'bg-emerald-500/8 border border-emerald-500/20'
                          : 'bg-gray-900/40 border border-transparent hover:border-gray-800/60'
                        }`}
                    >
                      {/* Rank */}
                      <span className="w-6 text-center text-gray-500 text-xs font-mono shrink-0">
                        {rank}
                      </span>

                      {/* Avatar */}
                      {entry.photoURL ? (
                        <img
                          src={entry.photoURL}
                          alt={entry.displayName}
                          className="w-7 h-7 rounded-full border border-gray-700/50 shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 font-bold text-[11px] shrink-0">
                          {entry.displayName[0]?.toUpperCase()}
                        </div>
                      )}

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">
                          {entry.displayName}
                          {entry.uid === user?.uid && (
                            <span className="text-emerald-400 text-[10px] ml-1">(você)</span>
                          )}
                        </p>
                      </div>

                      {/* Small stats */}
                      <span className="text-gray-600 text-[10px] shrink-0 hidden sm:block">
                        {entry.gamesPlayed}🎮
                      </span>

                      {/* Score */}
                      <div className="text-right shrink-0 min-w-[60px]">
                        <span className="text-white font-semibold text-sm">
                          {(entry[sortBy] || 0).toLocaleString()}
                        </span>
                        <span className="text-gray-500 text-[10px] ml-1">{getSortLabel()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* If less than 3 entries, show simple list without podium */}
            {top3.length < 3 && (
              <div className="space-y-1">
                {sortedEntries.map((entry, index) => (
                  <div
                    key={entry.uid}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all
                      ${entry.uid === user?.uid
                        ? 'bg-emerald-500/8 border border-emerald-500/20'
                        : 'bg-gray-900/40 border border-transparent hover:border-gray-800/60'
                      }`}
                  >
                    <span className="w-8 text-center text-lg shrink-0">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                    </span>
                    {entry.photoURL ? (
                      <img src={entry.photoURL} alt={entry.displayName} className="w-8 h-8 rounded-full border border-gray-700 shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 font-bold text-sm shrink-0">
                        {entry.displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{entry.displayName}</p>
                    </div>
                    <span className="text-white font-bold text-sm">{(entry[sortBy] || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Total players count */}
        {!loading && sortedEntries.length > 0 && (
          <p className="text-center text-gray-600 text-[11px] mt-4">
            {sortedEntries.length} jogadores no ranking
          </p>
        )}
      </div>
    </div>
  );
}
