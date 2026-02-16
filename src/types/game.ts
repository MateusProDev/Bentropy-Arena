// ============================================================
// Bentropy Arena - Game Types & Interfaces
// ============================================================

export interface Vector2D {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  name: string;
  photoURL: string | null;
  color: string;
  segments: Vector2D[];
  direction: Vector2D;
  speed: number;
  score: number;
  length: number;
  alive: boolean;
  boosting: boolean;
  lastUpdate: number;
}

export interface Food {
  id: string;
  position: Vector2D;
  color: string;
  size: number;
  value: number;
}

export interface GameState {
  players: Map<string, Player>;
  foods: Food[];
  worldSize: number;
  tick: number;
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL: string | null;
  highScore: number;
  totalKills: number;
  gamesPlayed: number;
  longestSnake: number;
  lastPlayed: number;
}

export interface GameRoom {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  worldSize: number;
  createdAt: number;
}

export interface GameConfig {
  worldSize: number;
  maxPlayers: number;
  foodCount: number;
  baseSpeed: number;
  boostSpeed: number;
  boostCost: number;
  growthRate: number;
  tickRate: number;
  segmentSize: number;
  foodSize: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  worldSize: 10000,
  maxPlayers: 30,
  foodCount: 3000,
  baseSpeed: 4,
  boostSpeed: 8,
  boostCost: 0.3,
  growthRate: 2,
  tickRate: 60,
  segmentSize: 10,
  foodSize: 6,
};

export const SNAKE_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
  '#e879f9', '#fb923c', '#22d3ee', '#a3e635', '#f472b6',
];

export type GameScreen = 'login' | 'menu' | 'game' | 'leaderboard';

export interface ChatMessage {
  id: string;
  playerName: string;
  text: string;
  timestamp: number;
}

// WebSocket message types
export type WSMessageType =
  | 'join'
  | 'leave'
  | 'move'
  | 'boost'
  | 'state'
  | 'death'
  | 'kill'
  | 'food_eaten'
  | 'chat'
  | 'ping'
  | 'pong';

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
  timestamp: number;
}

export interface JoinPayload {
  playerId: string;
  playerName: string;
  photoURL: string | null;
  color: string;
}

export interface MovePayload {
  playerId: string;
  direction: Vector2D;
  position: Vector2D;
}

export interface StatePayload {
  players: Record<string, Player>;
  foods: Food[];
  tick: number;
}

export interface DeathPayload {
  playerId: string;
  killedBy: string | null;
  score: number;
  length: number;
}
