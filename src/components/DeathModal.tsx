import { useEffect, useState } from 'react';

interface DeathModalProps {
  score: number;
  length: number;
  killedBy: string | null;
  rank?: number;
  totalPlayers?: number;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
}

export default function DeathModal({
  score,
  length,
  killedBy,
  rank,
  totalPlayers,
  onPlayAgain,
  onBackToMenu,
}: DeathModalProps) {
  const [visible, setVisible] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const [buttonsVisible, setButtonsVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Staggered reveal animations
    const t1 = setTimeout(() => setVisible(true), 80);
    const t2 = setTimeout(() => setStatsVisible(true), 320);
    const t3 = setTimeout(() => setButtonsVisible(true), 560);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const handleShare = () => {
    const text = `🐍 Bentropy Arena\n💀 Eliminado por ${killedBy ?? 'colisão'}\n⚔️ Score: ${score.toLocaleString()}\n📏 Tamanho: ${length}\n\nhttps://bentropy-arena.vercel.app`;
    if (navigator.share) {
      navigator.share({ title: 'Bentropy Arena', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const rankLabel = rank === 1 ? '👑 Você foi o 1º!' : rank === 2 ? '🥈 2º lugar' : rank === 3 ? '🥉 3º lugar' : rank ? `#${rank} de ${totalPlayers ?? '?'}` : null;
  const scoreGrade = score >= 5000 ? { label: 'LENDÁRIO', color: '#ffd700' } : score >= 2000 ? { label: 'ÉPICO', color: '#a855f7' } : score >= 800 ? { label: 'RARO', color: '#3b82f6' } : score >= 300 ? { label: 'COMUM', color: '#10b981' } : { label: 'NOVATO', color: '#6b7280' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', padding: '0 16px' }}>
      <div style={{
        background: 'linear-gradient(160deg, rgba(8,13,26,0.98) 0%, rgba(15,23,42,0.98) 100%)',
        border: '1px solid rgba(239,68,68,0.25)',
        borderTop: '2px solid rgba(239,68,68,0.55)',
        borderRadius: 20,
        padding: '28px 24px',
        maxWidth: 400,
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 0 60px rgba(239,68,68,0.12), 0 24px 48px rgba(0,0,0,0.6)',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(32px) scale(0.92)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.38s cubic-bezier(0.34,1.4,0.64,1), opacity 0.28s ease',
      }}>
        {/* Header */}
        <div style={{ fontSize: 52, marginBottom: 4, filter: 'drop-shadow(0 0 16px rgba(239,68,68,0.5))' }}>💀</div>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 0 4px' }}>Game Over!</h2>
        {killedBy ? (
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 6px' }}>
            Eliminado por <span style={{ color: '#f87171', fontWeight: 700 }}>{killedBy}</span>
          </p>
        ) : (
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 6px' }}>Colisão com a parede</p>
        )}

        {/* Rank badge */}
        {rankLabel && (
          <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '3px 12px', fontSize: 12, color: '#e2e8f0', marginBottom: 14 }}>
            {rankLabel}
          </div>
        )}

        {/* Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '14px 0 16px',
          transform: statsVisible ? 'translateY(0)' : 'translateY(20px)',
          opacity: statsVisible ? 1 : 0,
          transition: 'transform 0.35s ease, opacity 0.3s ease',
        }}>
          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 14, padding: '14px 10px' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>{score.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Pontuação</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: scoreGrade.color, marginTop: 2 }}>{scoreGrade.label}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 14, padding: '14px 10px' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>{length}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Tamanho</div>
            <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>segmentos</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 9,
          transform: buttonsVisible ? 'translateY(0)' : 'translateY(20px)',
          opacity: buttonsVisible ? 1 : 0,
          transition: 'transform 0.35s ease, opacity 0.3s ease',
        }}>
          <button
            onClick={onPlayAgain}
            style={{ width: '100%', padding: '13px 0', borderRadius: 12, background: 'linear-gradient(135deg,#059669,#10b981)', border: 'none', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', letterSpacing: 0.4, boxShadow: '0 4px 20px rgba(16,185,129,0.35)', transition: 'transform 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            🔄 Jogar Novamente
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleShare}
              style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            >
              {copied ? '✅ Copiado!' : '📤 Compartilhar'}
            </button>
            <button
              onClick={onBackToMenu}
              style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            >
              ← Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
