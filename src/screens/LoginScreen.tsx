import { useAuthStore } from '../stores/authStore';

export default function LoginScreen() {
  const { signInWithGoogle, loading, error } = useAuthStore();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 p-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4 animate-float">
          <div className="relative">
            <h1 className="text-7xl md:text-8xl font-black tracking-tighter">
              <span className="text-emerald-400 glow-text">B</span>
              <span className="text-white">entropy</span>
            </h1>
            <div className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 rounded-full" />
          </div>
          <p className="text-xl text-gray-400 font-medium tracking-widest uppercase">
            Arena
          </p>
        </div>

        {/* Snake illustration */}
        <div className="relative w-32 h-32 my-4">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle cx="50" cy="30" r="18" fill="#10b981" opacity="0.9">
              <animate attributeName="cy" values="30;28;30" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="43" cy="26" r="4" fill="white" />
            <circle cx="57" cy="26" r="4" fill="white" />
            <circle cx="44" cy="27" r="2" fill="#111827" />
            <circle cx="58" cy="27" r="2" fill="#111827" />
            <circle cx="50" cy="50" r="14" fill="#10b981" opacity="0.8" />
            <circle cx="50" cy="68" r="12" fill="#10b981" opacity="0.7" />
            <circle cx="50" cy="84" r="10" fill="#10b981" opacity="0.6" />
          </svg>
        </div>

        {/* Play description */}
        <p className="text-gray-400 text-center max-w-md text-lg">
          Jogo multiplayer estilo slither.io. Coma, cresça e domine a arena!
        </p>

        {/* Login button */}
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="group relative flex items-center gap-4 px-8 py-4 bg-white hover:bg-gray-100 
                     text-gray-900 font-bold rounded-2xl transition-all duration-300 
                     shadow-lg shadow-white/10 hover:shadow-white/20 hover:scale-105 
                     active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {/* Google Icon */}
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span className="text-lg">
            {loading ? 'Entrando...' : 'Entrar com Google'}
          </span>
          <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-emerald-400/30 transition-colors" />
        </button>

        {/* Error message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-6 py-3 text-red-400 text-sm max-w-md text-center">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 flex flex-col items-center gap-2 text-gray-600 text-sm">
          <p>Feito com ❤️ usando React + TypeScript + Firebase</p>
          <p>v1.0.0 — Bentropy Arena</p>
        </div>
      </div>
    </div>
  );
}
