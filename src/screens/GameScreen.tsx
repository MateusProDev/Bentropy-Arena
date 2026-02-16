import { useRef, useEffect, useCallback, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { GameEngine } from '../engine/GameEngine';
import { getWSClient, resetWSClient } from '../services/websocket';
import { updatePlayerScore } from '../services/leaderboard';
import type { Player, WSMessage, StatePayload, DeathPayload } from '../types/game';
import GameHUD from '../components/GameHUD';
import DeathModal from '../components/DeathModal';

export default function GameScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const frameRef = useRef(0);

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

  // Initialize engine and WebSocket on each game session
  useEffect(() => {
    const store = useGameStore.getState();
    const currentPlayer = store.localPlayer;
    if (!canvasRef.current || !currentPlayer || !user) return;

    // Reset UI state
    setScore(0);
    setLength(currentPlayer.length);
    setPlayerName(currentPlayer.name);

    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;

    // WebSocket connection
    const ws = getWSClient();
    ws.connect({
      playerId: user.uid,
      playerName: currentPlayer.name,
      photoURL: user.photoURL,
      color: currentPlayer.color,
    });

    // Handle state updates from server/bots
    const handleState = (msg: WSMessage) => {
      const payload = msg.payload as StatePayload;
      const localId = user.uid;
      const isOnline = !ws.fallbackMode;

      // Separate local player data from remote players
      const remoteMap = new Map<string, Player>();
      let totalCount = 0;

      Object.entries(payload.players).forEach(([id, p]) => {
        if (isOnline && id === localId) {
          // In online mode: update score/length from server (authoritative)
          const localP = useGameStore.getState().localPlayer;
          if (localP) {
            // Keep local position (prediction) but sync game state from server
            useGameStore.getState().updateLocalPlayer({
              score: p.score,
              length: p.length,
            });
            setScore(p.score);
            setLength(p.length);
          }
        } else {
          remoteMap.set(id, p);
        }
        totalCount++;
      });

      useGameStore.getState().setPlayers(remoteMap);
      useGameStore.getState().setFoods(payload.foods);
      setPlayerCount(totalCount);
      setConnectionMode(isOnline ? 'online' : 'local');

      // Set engine mode
      engine.isOnlineMode = isOnline;
    };

    // Handle death from server (online mode)
    const handleDeath = (msg: WSMessage) => {
      const payload = msg.payload as DeathPayload;
      const localP = useGameStore.getState().localPlayer;
      if (!localP || payload.playerId !== localP.id) return;

      // Trigger visual death effects
      engine.killedByName = payload.killedBy;
      engine.triggerDeath();

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
      // Only used in fallback/offline mode (engine detects food collision locally)
      if (ws.fallbackMode) {
        setScore(newScore);
        useGameStore.getState().updateLocalPlayer({ score: newScore });
      }
    };

    engine.onDeath = () => {
      // Only used in fallback/offline mode (engine detects collision locally)
      if (ws.fallbackMode) {
        const lp = useGameStore.getState().localPlayer;
        if (!lp) return;

        useGameStore.getState().setDeath({
          score: Math.floor(lp.score),
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

    engine.onFoodEaten = (foodId) => {
      ws.send({
        type: 'food_eaten',
        payload: { foodId, playerId: user.uid },
        timestamp: Date.now(),
      });
    };

    // Start engine
    engine.start();

    // Sync loop: push state from store to engine every frame
    const syncLoop = () => {
      const state = useGameStore.getState();
      engine.updateState(state.localPlayer, state.players, state.foods);
      frameRef.current = requestAnimationFrame(syncLoop);
    };
    frameRef.current = requestAnimationFrame(syncLoop);

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
      cancelAnimationFrame(frameRef.current);
      clearInterval(pingInterval);
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

  return (
    <div className="game-canvas-container">
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
        />
      )}

      {/* Death Modal */}
      {deathInfo && (
        <DeathModal
          score={deathInfo.score}
          length={deathInfo.length}
          killedBy={deathInfo.killedBy}
          onPlayAgain={handlePlayAgain}
          onBackToMenu={handleBackToMenu}
        />
      )}

    </div>
  );
}
