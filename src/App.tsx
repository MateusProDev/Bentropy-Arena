import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { useGameStore } from './stores/gameStore';
import LoginScreen from './screens/LoginScreen';
import MenuScreen from './screens/MenuScreen';
import GameScreen from './screens/GameScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';

export default function App() {
  const { user, loading, init } = useAuthStore();
  const { currentScreen, setScreen } = useGameStore();

  // Initialize auth listener
  useEffect(() => {
    const unsubscribe = init();
    return unsubscribe;
  }, [init]);

  // Redirect to menu after login
  useEffect(() => {
    if (user && currentScreen === 'login') {
      setScreen('menu');
    }
    if (!user && !loading && currentScreen !== 'login') {
      setScreen('login');
    }
  }, [user, loading, currentScreen, setScreen]);

  // Loading screen
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-emerald-500/30 rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-emerald-500 rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-white">
          <span className="text-emerald-400">B</span>entropy Arena
        </h2>
        <p className="text-gray-500 text-sm">Carregando...</p>
      </div>
    );
  }

  // Screen router
  switch (currentScreen) {
    case 'login':
      return <LoginScreen />;
    case 'menu':
      return <MenuScreen />;
    case 'game':
      return <GameScreen />;
    case 'leaderboard':
      return <LeaderboardScreen />;
    default:
      return <LoginScreen />;
  }
}
