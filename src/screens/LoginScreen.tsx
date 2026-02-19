import { useAuthStore } from '../stores/authStore';
import Snake3DHero from '../components/Snake3DHero';

export default function LoginScreen() {
  const { signInWithGoogle, loading, error } = useAuthStore();

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gray-950 relative overflow-hidden px-4">
      {/* ── 3D Snake Canvas (fullscreen behind everything) ── */}
      <Snake3DHero />

      {/* Subtle vignette overlay for contrast */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(3,7,18,0.65) 80%, rgba(3,7,18,0.92) 100%)',
      }} />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-5 sm:gap-8 p-4 sm:p-8 w-full max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 sm:gap-4 animate-float">
          <div className="relative">
            <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter" style={{ textShadow: '0 0 40px rgba(16,185,129,0.3), 0 2px 6px rgba(0,0,0,0.5)' }}>
              <span className="text-emerald-400 glow-text">B</span>
              <span className="text-white">entropy</span>
            </h1>
            <div className="absolute -bottom-1 sm:-bottom-2 left-0 right-0 h-0.5 sm:h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 rounded-full" style={{ boxShadow: '0 0 16px rgba(16,185,129,0.5)' }} />
          </div>
          <p className="text-base sm:text-xl text-gray-400 font-medium tracking-widest uppercase" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
            Arena
          </p>
        </div>

        {/* Play description */}
        <p className="text-gray-300 text-center max-w-md text-sm sm:text-lg px-2" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>
          Jogo multiplayer estilo slither.io. Coma, cresça e domine a arena!
        </p>

        {/* Login button */}
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="group relative flex items-center gap-3 sm:gap-4 px-6 sm:px-8 py-3 sm:py-4 
                     bg-white/95 hover:bg-white text-gray-900 font-bold rounded-2xl 
                     transition-all duration-300 
                     shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/30 hover:scale-105 
                     active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer
                     w-full sm:w-auto justify-center backdrop-blur-sm"
        >
          {/* Google Icon */}
          <svg className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span className="text-base sm:text-lg">
            {loading ? 'Entrando...' : 'Entrar com Google'}
          </span>
          <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-emerald-400/30 transition-colors" />
        </button>

        {/* Error message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 sm:px-6 py-3 text-red-400 text-xs sm:text-sm max-w-md text-center backdrop-blur-sm">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 sm:mt-8 flex flex-col items-center gap-1 sm:gap-2 text-gray-500 text-[10px] sm:text-sm">
          <p style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>Feito com ❤️ usando React + TypeScript + Firebase</p>
          <p style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>v1.0.0 — Bentropy Arena</p>
        </div>
      </div>
    </div>
  );
}
