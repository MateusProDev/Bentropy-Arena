import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { getPlayerStats } from '../services/leaderboard';
import type { LeaderboardEntry } from '../types/game';
import { SNAKE_COLORS } from '../types/game';

export default function MenuScreen() {
  const { user, signOut } = useAuthStore();
  const { setScreen, initLocalPlayer } = useGameStore();
  const [stats, setStats] = useState<LeaderboardEntry | null>(null);
  const [selectedColor, setSelectedColor] = useState(SNAKE_COLORS[0]);
  const [playerName, setPlayerName] = useState('');

  useEffect(() => {
    if (user) {
      setPlayerName(user.displayName || 'Player');
      getPlayerStats(user.uid).then(setStats);
    }
  }, [user]);

  const handlePlay = () => {
    if (!user) return;
    initLocalPlayer(user.uid, playerName || user.displayName || 'Player', user.photoURL, selectedColor);
    setScreen('game');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 p-6 max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between w-full">
          <h1 className="text-3xl font-black">
            <span className="text-emerald-400">B</span>
            <span className="text-white">entropy</span>
            <span className="text-gray-500 text-lg ml-2">Arena</span>
          </h1>
          <button
            onClick={signOut}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors cursor-pointer"
          >
            Sair
          </button>
        </div>

        {/* Player Card */}
        <div className="card w-full">
          <div className="flex items-center gap-4 mb-6">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || ''}
                className="w-14 h-14 rounded-full border-2 border-emerald-500/50"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xl">
                {(user?.displayName || 'P')[0]}
              </div>
            )}
            <div>
              <h2 className="text-white font-bold text-lg">{user?.displayName}</h2>
              <p className="text-gray-500 text-sm">{user?.email}</p>
            </div>
          </div>

          {/* Name input */}
          <div className="mb-4">
            <label className="text-gray-400 text-sm mb-1 block">Nome no jogo</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 16))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white 
                         focus:border-emerald-500 focus:outline-none transition-colors"
              maxLength={16}
              placeholder="Seu nome no jogo"
            />
          </div>

          {/* Color picker */}
          <div className="mb-6">
            <label className="text-gray-400 text-sm mb-2 block">Cor da cobra</label>
            <div className="flex flex-wrap gap-2">
              {SNAKE_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-9 h-9 rounded-full transition-all duration-200 cursor-pointer
                    ${selectedColor === color 
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' 
                      : 'hover:scale-110 opacity-70 hover:opacity-100'
                    }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Play button */}
          <button
            onClick={handlePlay}
            className="btn-primary w-full text-xl py-4 flex items-center justify-center gap-3"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            JOGAR
          </button>
        </div>

        {/* Stats Card */}
        {stats && (
          <div className="card w-full">
            <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4">
              Suas Estatísticas
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <StatItem label="Recorde" value={stats.highScore.toLocaleString()} icon="🏆" />
              <StatItem label="Eliminações" value={stats.totalKills.toString()} icon="💀" />
              <StatItem label="Partidas" value={stats.gamesPlayed.toString()} icon="🎮" />
              <StatItem label="Maior Cobra" value={stats.longestSnake.toString()} icon="🐍" />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 w-full">
          <button
            onClick={() => setScreen('leaderboard')}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Ranking
          </button>
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-3 flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-white font-bold text-lg leading-tight">{value}</p>
        <p className="text-gray-500 text-xs">{label}</p>
      </div>
    </div>
  );
}
