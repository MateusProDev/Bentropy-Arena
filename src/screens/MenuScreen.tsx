import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { getPlayerStats } from '../services/leaderboard';
import type { LeaderboardEntry, SnakeAccessory, SnakeTheme } from '../types/game';
import { SNAKE_COLORS, SNAKE_ACCESSORIES, SNAKE_THEMES } from '../types/game';

export default function MenuScreen() {
  const { user, signOut } = useAuthStore();
  const { setScreen, initLocalPlayer } = useGameStore();
  const [stats, setStats] = useState<LeaderboardEntry | null>(null);
  const [selectedColor, setSelectedColor] = useState(SNAKE_COLORS[0]);
  const [playerName, setPlayerName] = useState('');
  const [selectedAccessory, setSelectedAccessory] = useState<SnakeAccessory>('none');
  const [selectedTheme, setSelectedTheme] = useState<SnakeTheme>('none');

  useEffect(() => {
    if (user) {
      setPlayerName(user.displayName || 'Player');
      getPlayerStats(user.uid).then(setStats);
    }
  }, [user]);

  const handlePlay = async () => {
    if (!user) return;
    // Try fullscreen + landscape on mobile (requires user gesture from button tap)
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isMobile) {
      try { await document.documentElement.requestFullscreen(); } catch {}
      try { await (screen.orientation as any).lock('landscape'); } catch {}
    }
    initLocalPlayer(user.uid, playerName || user.displayName || 'Player', user.photoURL, selectedColor, selectedAccessory, selectedTheme);
    setScreen('game');
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gray-950 relative overflow-hidden overflow-y-auto px-3 py-6 sm:px-0 sm:py-0">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/3 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4 sm:gap-6 p-4 sm:p-6 max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between w-full">
          <h1 className="text-2xl sm:text-3xl font-black">
            <span className="text-emerald-400">B</span>
            <span className="text-white">entropy</span>
            <span className="text-gray-500 text-sm sm:text-lg ml-1 sm:ml-2">Arena</span>
          </h1>
          <button
            onClick={signOut}
            className="text-gray-500 hover:text-gray-300 text-xs sm:text-sm transition-colors cursor-pointer"
          >
            Sair
          </button>
        </div>

        {/* Player Card */}
        <div className="card w-full !p-4 sm:!p-6">
          <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || ''}
                className="w-10 h-10 sm:w-14 sm:h-14 rounded-full border-2 border-emerald-500/50"
              />
            ) : (
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-lg sm:text-xl">
                {(user?.displayName || 'P')[0]}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-white font-bold text-base sm:text-lg truncate">{user?.displayName}</h2>
              <p className="text-gray-500 text-xs sm:text-sm truncate">{user?.email}</p>
            </div>
          </div>

          {/* Name input */}
          <div className="mb-3 sm:mb-4">
            <label className="text-gray-400 text-xs sm:text-sm mb-1 block">Nome no jogo</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 16))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white text-sm sm:text-base
                         focus:border-emerald-500 focus:outline-none transition-colors"
              maxLength={16}
              placeholder="Seu nome no jogo"
            />
          </div>

          {/* Color picker */}
          <div className="mb-3 sm:mb-4">
            <label className="text-gray-400 text-xs sm:text-sm mb-2 block">Cor da cobra</label>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {SNAKE_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full transition-all duration-200 cursor-pointer
                    ${selectedColor === color 
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' 
                      : 'hover:scale-110 opacity-70 hover:opacity-100'
                    }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Accessory picker */}
          <div className="mb-3 sm:mb-4">
            <label className="text-gray-400 text-xs sm:text-sm mb-2 block">Acessório</label>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {SNAKE_ACCESSORIES.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAccessory(acc.id)}
                  className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 transition-all duration-200 cursor-pointer
                    ${selectedAccessory === acc.id
                      ? 'bg-emerald-500/20 ring-2 ring-emerald-400 scale-105'
                      : 'bg-gray-800/50 hover:bg-gray-700/50 opacity-70 hover:opacity-100'
                    }`}
                  title={acc.name}
                >
                  <span className="text-xl sm:text-2xl leading-none">{acc.emoji}</span>
                  <span className="text-[9px] sm:text-[10px] text-gray-400 mt-1 truncate w-full text-center">{acc.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Theme picker */}
          <div className="mb-4 sm:mb-6">
            <label className="text-gray-400 text-xs sm:text-sm mb-2 block">Tema do corpo</label>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {SNAKE_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setSelectedTheme(theme.id)}
                  className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 transition-all duration-200 cursor-pointer
                    ${selectedTheme === theme.id
                      ? 'bg-purple-500/20 ring-2 ring-purple-400 scale-105'
                      : 'bg-gray-800/50 hover:bg-gray-700/50 opacity-70 hover:opacity-100'
                    }`}
                  title={theme.name}
                >
                  <span className="text-xl sm:text-2xl leading-none">{theme.emoji}</span>
                  <span className="text-[9px] sm:text-[10px] text-gray-400 mt-1 truncate w-full text-center">{theme.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Play button */}
          <button
            onClick={handlePlay}
            className="btn-primary w-full text-lg sm:text-xl py-3 sm:py-4 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            JOGAR
          </button>
        </div>

        {/* Stats Card */}
        {stats && (
          <div className="card w-full !p-4 sm:!p-6">
            <h3 className="text-gray-400 text-xs sm:text-sm font-semibold uppercase tracking-wider mb-3 sm:mb-4">
              Suas Estatísticas
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
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
            className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm sm:text-base py-2.5 sm:py-3"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <div className="bg-gray-800/50 rounded-xl p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
      <span className="text-xl sm:text-2xl">{icon}</span>
      <div className="min-w-0">
        <p className="text-white font-bold text-sm sm:text-lg leading-tight truncate">{value}</p>
        <p className="text-gray-500 text-[10px] sm:text-xs">{label}</p>
      </div>
    </div>
  );
}
