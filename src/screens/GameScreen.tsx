import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { GameEngine } from '../engine/GameEngine';
import { getWSClient, resetWSClient } from '../services/websocket';
import { updatePlayerScore } from '../services/leaderboard';
import type { Player, WSMessage, StatePayload, DeathPayload, DevilFruitAbility } from '../types/game';
import { DEVIL_FRUITS } from '../types/game';
import GameHUD from '../components/GameHUD';
import DeathModal from '../components/DeathModal';

export default function GameScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const { user } = useAuthStore();
  const gameSession = useGameStore((s) => s.gameSession);
  const deathInfo = useGameStore((s) => s.deathInfo);
  const isPlaying = useGameStore((s) => s.isPlaying);

  const [score, setScore] = useState(0);
  const [length, setLength] = useState(10);
  const [playerCount, setPlayerCount] = useState(0);
  const [ping, setPing] = useState(0);
  const [connectionMode, setConnectionMode] = useState<'online' | 'local'>('local');
  const [playerName, setPlayerName] = useState('');
  const [activeAbility, setActiveAbility] = useState<DevilFruitAbility | null>(null);
  const [abilityTimeLeft, setAbilityTimeLeft] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Conectando à arena...');
  const [playerRank, setPlayerRank] = useState<number | undefined>(undefined);
  const abilityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstStateRef = useRef(false);

  // Force fullscreen on game start (both desktop and mobile)
  useEffect(() => {
    const goFullscreen = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch { /* not available */ }

      // Landscape lock on mobile
      const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (isMobile) {
        try { await (screen.orientation as any).lock('landscape'); } catch { /* not supported */ }
      }
    };

    // requestFullscreen needs user gesture — try immediately (MenuScreen button is the gesture)
    goFullscreen();

    // Fallback: first interaction triggers it
    const handler = () => goFullscreen();
    window.addEventListener('click', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });

    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('touchstart', handler);
      try { (screen.orientation as any).unlock(); } catch {}
    };
  }, [gameSession]);

  // Initialize engine and WebSocket on each game session
  useEffect(() => {
    const store = useGameStore.getState();
    const currentPlayer = store.localPlayer;
    if (!canvasRef.current || !currentPlayer || !user) return;

    // Reset UI state
    setScore(0);
    setLength(currentPlayer.length);
    setPlayerName(currentPlayer.name);
    setIsLoading(true);
    setLoadingStatus('Conectando à arena...');

    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;

    // Read server mode preference
    const preferLocal = store.serverMode === 'local';

    // WebSocket connection
    const ws = getWSClient();
    ws.connect({
      playerId: user.uid,
      playerName: currentPlayer.name,
      photoURL: user.photoURL,
      color: currentPlayer.color,
    }, preferLocal);

    // Handle state updates from server/bots
    const handleState = (msg: WSMessage) => {
      const payload = msg.payload as StatePayload;
      const localId = user.uid;
      const isOnline = !ws.fallbackMode && ws.connected;

      // First state received → hide loading screen
      if (!firstStateRef.current) {
        firstStateRef.current = true;
        setLoadingStatus(isOnline ? 'Entrando na arena...' : 'Modo offline ativado');
        setTimeout(() => setIsLoading(false), 400);
      }

      const remoteMap = new Map<string, Player>();
      let totalCount = 0;

      Object.entries(payload.players).forEach(([id, p]) => {
        if (isOnline && id === localId) {
          // Online mode: only take server score/length if they're HIGHER than local
          // This prevents server state from overwriting locally-eaten food (race condition)
          const localP = useGameStore.getState().localPlayer;
          if (localP) {
            const syncedScore = Math.max(localP.score, p.score);
            const syncedLength = Math.max(localP.length, p.length);
            useGameStore.getState().updateLocalPlayer({
              score: syncedScore,
              length: syncedLength,
            });
            setScore(syncedScore);
            setLength(syncedLength);
          }
        } else {
          remoteMap.set(id, p);
        }
        totalCount++;
      });

      useGameStore.getState().setPlayers(remoteMap);
      useGameStore.getState().setFoods(payload.foods);
      if (payload.devilFruits) {
        useGameStore.getState().setDevilFruits(payload.devilFruits);
      }
      setPlayerCount(isOnline ? totalCount : totalCount + 1);
      setConnectionMode(isOnline ? 'online' : 'local');
      engine.isOnlineMode = isOnline;
    };

    // Handle death from server (online mode)
    const handleDeath = (msg: WSMessage) => {
      const payload = msg.payload as DeathPayload;
      const localP = useGameStore.getState().localPlayer;

      // Kill feed for other players dying
      if (localP && payload.playerId !== localP.id) {
        const deadName = useGameStore.getState().players.get(payload.playerId)?.name ?? payload.playerId;
        if (payload.killedBy) {
          engine.addKillFeedEntry(`${payload.killedBy} ☠ ${deadName}`);
        }
        return;
      }

      if (!localP || payload.playerId !== localP.id) return;

      // Trigger visual death effects
      engine.killedByName = payload.killedBy;
      engine.triggerDeath();

      // Compute rank at time of death
      const allP = Array.from(useGameStore.getState().players.values());
      const myScore = payload.score;
      const rank = allP.filter(p => p.score > myScore).length + 1;
      setPlayerRank(rank);

      useGameStore.getState().setDeath({
        score: payload.score,
        length: payload.length,
        killedBy: payload.killedBy,
      });

      // Save to leaderboard
      updatePlayerScore(
        user.uid,
        localP.name,
        user.photoURL,
        payload.score,
        payload.length,
        0
      );
    };

    // Handle pong for ping measurement
    const handlePong = (msg: WSMessage) => {
      const serverTime = (msg.payload as { serverTime: number }).serverTime;
      if (serverTime) {
        const rtt = Date.now() - msg.timestamp;
        setPing(Math.max(1, rtt));
      }
    };

    ws.on('state', handleState);
    ws.on('death', handleDeath);
    ws.on('pong', handlePong);

    // Engine callbacks
    engine.onMove = (direction, position, boosting) => {
      useGameStore.getState().updateLocalPlayer({ direction });
      ws.sendMove(user.uid, direction, position, boosting);
    };

    engine.onScoreUpdate = (newScore) => {
      // Always update HUD when food is eaten (online or offline)
      setScore(newScore);
      const lp = useGameStore.getState().localPlayer;
      if (lp) setLength(lp.length);
      useGameStore.getState().updateLocalPlayer({ score: newScore });
    };

    engine.onDeath = () => {
      // Only used in fallback/offline mode (engine detects collision locally)
      if (ws.fallbackMode) {
        const lp = useGameStore.getState().localPlayer;
        if (!lp) return;

        // Drop entire player body as food on the arena
        ws.dropPlayerFood(lp);

        // Compute rank at time of death (offline mode)
        const allP = Array.from(useGameStore.getState().players.values());
        const myScore = Math.floor(lp.score);
        const rank = allP.filter(p => p.score > myScore).length + 1;
        setPlayerRank(rank);

        useGameStore.getState().setDeath({
          score: myScore,
          length: Math.floor(lp.length),
          killedBy: engine.killedByName,
        });

        updatePlayerScore(
          user.uid,
          lp.name,
          user.photoURL,
          Math.floor(lp.score),
          Math.floor(lp.length),
          0
        );
      }
    };

    engine.onDevilFruitEaten = (fruitId, ability) => {
      if (ws.fallbackMode) {
        ws.removeFallbackDevilFruit(fruitId);
      }
      ws.send({
        type: 'devil_fruit_eaten',
        payload: { fruitId, playerId: user.uid, ability },
        timestamp: Date.now(),
      });

      // Activate ability on local player
      const def = DEVIL_FRUITS.find(d => d.ability === ability);
      if (!def) return;

      const lp = useGameStore.getState().localPlayer;
      if (!lp) return;

      if (ability === 'growth') {
        // Instant effect: growth proportional to current size (min 30, max 80)
        const growthBonus = Math.floor(Math.min(80, Math.max(30, lp.length * 0.4)));
        useGameStore.getState().updateLocalPlayer({
          length: lp.length + growthBonus,
          score: lp.score + growthBonus,
        });
        setLength(Math.floor(lp.length + growthBonus));
        setScore(Math.floor(lp.score + growthBonus));
      } else {
        // Timed ability
        useGameStore.getState().updateLocalPlayer({
          activeAbility: ability,
          abilityEndTime: Date.now() + def.duration * 1000,
        });
        setActiveAbility(ability);
        setAbilityTimeLeft(def.duration);

        // Clear any existing timer
        if (abilityTimerRef.current) clearInterval(abilityTimerRef.current);

        const endTime = Date.now() + def.duration * 1000;
        abilityTimerRef.current = setInterval(() => {
          const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
          setAbilityTimeLeft(remaining);
          if (remaining <= 0) {
            if (abilityTimerRef.current) clearInterval(abilityTimerRef.current);
            setActiveAbility(null);
            useGameStore.getState().updateLocalPlayer({
              activeAbility: null,
              abilityEndTime: 0,
            });
          }
        }, 200);
      }
    };

    engine.onAbilityExpired = () => {
      // Called when resistance is consumed by a collision
      setActiveAbility(null);
      setAbilityTimeLeft(0);
      if (abilityTimerRef.current) clearInterval(abilityTimerRef.current);
      useGameStore.getState().updateLocalPlayer({
        activeAbility: null,
        abilityEndTime: 0,
      });
    };

    engine.onFoodEaten = (foodId) => {
      if (ws.fallbackMode) {
        ws.removeFallbackFood(foodId);
      }
      ws.send({
        type: 'food_eaten',
        payload: { foodId, playerId: user.uid },
        timestamp: Date.now(),
      });
    };

    // Start engine
    engine.start();

    // Sync loop: push state from store to engine INSIDE engine's RAF via onPreTick
    // Eliminates the double-requestAnimationFrame overhead
    let rankFrameCounter = 0;
    engine.onPreTick = () => {
      const state = useGameStore.getState();
      engine.updateState(state.localPlayer, state.players, state.foods, state.devilFruits);
      ws.updateLocalPlayerRef(state.localPlayer);

      // Build rankings map — throttle to every 10 frames (still 6fps, instant enough for crowns)
      rankFrameCounter++;
      if (rankFrameCounter >= 10) {
        rankFrameCounter = 0;
        const allPlayers: { id: string; score: number }[] = [];
        if (state.localPlayer?.alive) {
          allPlayers.push({ id: state.localPlayer.id, score: state.localPlayer.score });
        }
        state.players.forEach((p) => {
          if (p.alive) allPlayers.push({ id: p.id, score: p.score });
        });
        allPlayers.sort((a, b) => b.score - a.score);
        const rankMap = new Map<string, number>();
        for (let i = 0; i < allPlayers.length; i++) rankMap.set(allPlayers[i].id, i + 1);
        engine.updateRankings(rankMap);
      }
    };

    // Ping measurement
    const pingInterval = setInterval(() => {
      if (ws.connected && !ws.fallbackMode) {
        ws.send({ type: 'ping', payload: {}, timestamp: Date.now() });
      } else {
        setPing(1);
      }
    }, 3000);

    return () => {
      engine.stop();
      engine.destroy();
      engineRef.current = null;
      ws.off('state', handleState);
      ws.off('death', handleDeath);
      ws.off('pong', handlePong);
      ws.disconnect();
      resetWSClient();
      clearInterval(pingInterval);
      if (abilityTimerRef.current) clearInterval(abilityTimerRef.current);
    };
  }, [gameSession]); // Re-run when game session changes (play again)

  const handlePlayAgain = useCallback(() => {
    if (!user) return;
    const store = useGameStore.getState();
    store.reset();
    // initLocalPlayer increments gameSession -> triggers useEffect re-run
    store.initLocalPlayer(user.uid, user.displayName || 'Player', user.photoURL);
  }, [user]);

  const handleBackToMenu = useCallback(() => {
    useGameStore.getState().reset();
    useGameStore.getState().setScreen('menu');
  }, []);

  const localPlayer = useGameStore((s) => s.localPlayer);
  const remotePlayers = useGameStore((s) => s.players);

  // Build live leaderboard from ALL players — ranked by LENGTH (universal top 10)
  const leaderboard = useMemo(() => {
    const entries: { name: string; score: number; length: number; color: string; isLocal: boolean }[] = [];

    // Add local player
    if (localPlayer?.alive) {
      entries.push({
        name: localPlayer.name,
        score: Math.floor(score),
        length: Math.floor(localPlayer.length),
        color: localPlayer.color,
        isLocal: true,
      });
    }

    // Add remote/bot players
    remotePlayers.forEach((p) => {
      if (!p.alive) return;
      entries.push({
        name: p.name,
        score: Math.floor(p.score),
        length: Math.floor(p.length),
        color: p.color,
        isLocal: false,
      });
    });

    return entries.sort((a, b) => b.length - a.length);
  }, [localPlayer, remotePlayers, score]);

  const handleBoostStart = useCallback(() => {
    engineRef.current?.setMobileBoosting(true);
  }, []);

  const handleBoostEnd = useCallback(() => {
    engineRef.current?.setMobileBoosting(false);
  }, []);

  const handleJoystickMove = useCallback((dx: number, dy: number) => {
    engineRef.current?.setJoystickDirection(dx, dy);
  }, []);

  return (
    <div className="game-canvas-container">
      {/* Loading Screen */}
      {isLoading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1225 100%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '24px',
        }}>
          <div style={{ fontSize: '64px' }}>🐍</div>
          <div style={{
            fontSize: '28px', fontWeight: 'bold', color: '#10b981',
            letterSpacing: '2px', textTransform: 'uppercase',
          }}>Bentropy Arena</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: '#10b981', animation: 'pulse 1s infinite',
            }} />
            <div style={{ color: '#94a3b8', fontSize: '14px' }}>{loadingStatus}</div>
          </div>
          <div style={{
            width: '200px', height: '3px',
            background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', background: '#10b981', borderRadius: '2px',
              animation: 'loading-bar 1.5s ease-in-out infinite',
              width: '40%',
            }} />
          </div>
          <style>{`
            @keyframes loading-bar {
              0% { transform: translateX(-100%) scaleX(0.5); }
              50% { transform: translateX(150%) scaleX(1.5); }
              100% { transform: translateX(400%) scaleX(0.5); }
            }
          `}</style>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ cursor: 'none' }}
      />

      {/* HUD */}
      {isPlaying && localPlayer?.alive && (
        <GameHUD
          score={Math.floor(score)}
          length={Math.floor(length)}
          playerCount={playerCount}
          ping={ping}
          connectionMode={connectionMode}
          playerName={playerName}
          leaderboard={leaderboard}
          activeAbility={activeAbility}
          abilityTimeLeft={abilityTimeLeft}
          onBoostStart={handleBoostStart}
          onBoostEnd={handleBoostEnd}
          onJoystickMove={handleJoystickMove}
        />
      )}

      {/* Death Modal */}
      {deathInfo && (
        <DeathModal
          score={deathInfo.score}
          length={deathInfo.length}
          killedBy={deathInfo.killedBy}
          rank={playerRank}
          totalPlayers={playerCount}
          onPlayAgain={handlePlayAgain}
          onBackToMenu={handleBackToMenu}
        />
      )}

    </div>
  );
}
