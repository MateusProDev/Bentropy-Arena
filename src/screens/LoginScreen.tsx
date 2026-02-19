import { useAuthStore } from '../stores/authStore';
import Snake3DHero from '../components/Snake3DHero';

export default function LoginScreen() {
  const { signInWithGoogle, loading, error } = useAuthStore();

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center relative overflow-hidden px-4"
      style={{ background: '#020208' }}>
      {/* ── Cartoon Snake Canvas (fullscreen behind everything) ── */}
      <Snake3DHero />

      {/* Vignette overlay for readability */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 25%, rgba(2,2,8,0.5) 65%, rgba(2,2,8,0.88) 100%)',
      }} />

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col items-center gap-4 sm:gap-6 p-4 sm:p-6 w-full max-w-lg">

        {/* ── BENTROPY.ARENA Title — Arcade Typography ── */}
        <div className="flex flex-col items-center gap-0">
          {/* Main title */}
          <h1 className="text-center font-black tracking-tight leading-none select-none"
            style={{
              fontSize: 'clamp(2.5rem, 8vw, 5rem)',
              background: 'linear-gradient(135deg, #ffdd44 0%, #44ff88 35%, #22ccff 65%, #6644ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 20px rgba(68,255,136,0.4)) drop-shadow(0 4px 8px rgba(0,0,0,0.8))',
              fontFamily: '"Arial Black", "Impact", "Trebuchet MS", sans-serif',
              letterSpacing: '-0.02em',
            }}>
            BENTROPY
          </h1>
          {/* Separator line */}
          <div className="w-full max-w-xs h-1 rounded-full mx-auto my-1 sm:my-2" style={{
            background: 'linear-gradient(90deg, transparent 0%, #ffdd44 15%, #44ff88 40%, #22ccff 60%, #6644ff 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(68,255,136,0.5), 0 0 30px rgba(34,204,255,0.3)',
          }} />
          {/* .ARENA subtitle */}
          <h2 className="text-center font-black tracking-widest select-none"
            style={{
              fontSize: 'clamp(1rem, 3.5vw, 1.8rem)',
              background: 'linear-gradient(90deg, #ff6644 0%, #ffdd44 50%, #ff6644 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 10px rgba(255,102,68,0.4))',
              fontFamily: '"Arial Black", "Impact", sans-serif',
              letterSpacing: '0.3em',
            }}>
            .ARENA
          </h2>
        </div>

        {/* ── Tagline ── */}
        <p className="text-center max-w-sm text-sm sm:text-base font-bold px-2" style={{
          color: '#aabbcc',
          textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(34,204,255,0.15)',
          letterSpacing: '0.05em',
        }}>
          ⚡ Coma, cresça e domine a arena! ⚡
        </p>

        {/* ── Login Button — Vibrant Game Style ── */}
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="group relative flex items-center gap-3 sm:gap-4 px-7 sm:px-10 py-3.5 sm:py-4
                     font-black rounded-2xl transition-all duration-300
                     hover:scale-105 active:scale-95
                     disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer
                     w-full sm:w-auto justify-center"
          style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%)',
            boxShadow: '0 0 25px rgba(68,255,136,0.2), 0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.9)',
            border: '2px solid rgba(68,255,136,0.3)',
          }}
        >
          {/* Google Icon */}
          <svg className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span className="text-base sm:text-lg text-gray-800">
            {loading ? 'Entrando...' : 'Entrar com Google'}
          </span>
          {/* Hover glow border */}
          <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ boxShadow: '0 0 30px rgba(68,255,136,0.35), inset 0 0 20px rgba(68,255,136,0.08)' }} />
        </button>

        {/* Error */}
        {error && (
          <div className="rounded-xl px-4 sm:px-6 py-3 text-xs sm:text-sm max-w-md text-center backdrop-blur-sm"
            style={{
              background: 'rgba(255,50,50,0.12)',
              border: '1px solid rgba(255,50,50,0.3)',
              color: '#ff6666',
            }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="mt-2 sm:mt-4 flex flex-col items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs"
          style={{ color: '#445566', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
          <p>React + TypeScript + Firebase</p>
          <p>v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
