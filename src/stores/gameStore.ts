import { create } from 'zustand';
import type { Player, Food, DevilFruit, GameConfig, GameScreen } from '../types/game';
import { DEFAULT_CONFIG, SNAKE_COLORS } from '../types/game';

interface GameStore {
  // Screen state
  currentScreen: GameScreen;
  setScreen: (screen: GameScreen) => void;

  // Game state
  localPlayer: Player | null;
  players: Map<string, Player>;
  foods: Food[];
  devilFruits: DevilFruit[];
  config: GameConfig;
  worldSize: number;
  camera: { x: number; y: number; zoom: number };
  isPlaying: boolean;
  isPaused: boolean;
  deathInfo: { score: number; length: number; killedBy: string | null } | null;

  // Session
  gameSession: number;

  // Minimap
  minimapVisible: boolean;
  toggleMinimap: () => void;

  // Actions
  initLocalPlayer: (id: string, name: string, photoURL: string | null, color?: string) => void;
  updateLocalPlayer: (updates: Partial<Player>) => void;
  setPlayers: (players: Map<string, Player>) => void;
  setFoods: (foods: Food[]) => void;
  setDevilFruits: (fruits: DevilFruit[]) => void;
  updateCamera: (x: number, y: number) => void;
  setPlaying: (playing: boolean) => void;
  setDeath: (info: { score: number; length: number; killedBy: string | null } | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  currentScreen: 'login',
  setScreen: (screen) => set({ currentScreen: screen }),

  localPlayer: null,
  players: new Map(),
  foods: [],
  devilFruits: [],
  config: DEFAULT_CONFIG,
  worldSize: DEFAULT_CONFIG.worldSize,
  camera: { x: 0, y: 0, zoom: 1 },
  isPlaying: false,
  isPaused: false,
  deathInfo: null,

  gameSession: 0,

  minimapVisible: true,
  toggleMinimap: () => set((s) => ({ minimapVisible: !s.minimapVisible })),

  initLocalPlayer: (id, name, photoURL, selectedColor?: string) => {
    const color = selectedColor || SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)];
    const worldSize = get().config.worldSize;
    const startX = Math.random() * (worldSize - 400) + 200;
    const startY = Math.random() * (worldSize - 400) + 200;

    const segments: { x: number; y: number }[] = [];
    for (let i = 0; i < 10; i++) {
      segments.push({ x: startX - i * 10, y: startY });
    }

    const player: Player = {
      id,
      name,
      photoURL,
      color,
      segments,
      direction: { x: 1, y: 0 },
      speed: DEFAULT_CONFIG.baseSpeed,
      score: 0,
      length: 10,
      alive: true,
      boosting: false,
      lastUpdate: Date.now(),
      activeAbility: null,
      abilityEndTime: 0,
    };

    set({ localPlayer: player, isPlaying: true, deathInfo: null, gameSession: get().gameSession + 1 });
  },

  updateLocalPlayer: (updates) =>
    set((state) => ({
      localPlayer: state.localPlayer ? { ...state.localPlayer, ...updates } : null,
    })),

  setPlayers: (players) => set({ players }),
  setFoods: (foods) => set({ foods }),
  setDevilFruits: (fruits) => set({ devilFruits: fruits }),

  updateCamera: (x, y) =>
    set({ camera: { ...get().camera, x, y } }),

  setPlaying: (playing) => set({ isPlaying: playing }),

  setDeath: (info) => set({ deathInfo: info, isPlaying: false }),

  reset: () =>
    set({
      localPlayer: null,
      players: new Map(),
      foods: [],
      devilFruits: [],
      isPlaying: false,
      deathInfo: null,
      camera: { x: 0, y: 0, zoom: 1 },
    }),
}));
