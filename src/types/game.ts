// ============================================================
// Bentropy Arena - Game Types & Interfaces
// ============================================================

export interface Vector2D {
  x: number;
  y: number;
}

// ============================================================
// Snake Accessories (Anime-inspired cosmetics)
// ============================================================

export type SnakeAccessory =
  | 'none'
  | 'sunglasses'
  | 'cool_glasses'
  | 'straw_hat'       // Luffy (One Piece)
  | 'ninja_headband'  // Naruto
  | 'scouter'         // Dragon Ball
  | 'pirate_bandana'  // Zoro
  | 'crown'           // Royal
  | 'cat_ears'        // Neko
  | 'halo'            // Angel
  | 'devil_horns';    // Demon

export interface AccessoryDef {
  id: SnakeAccessory;
  name: string;
  emoji: string;
  category: 'head' | 'eyes' | 'aura';
}

export const SNAKE_ACCESSORIES: AccessoryDef[] = [
  { id: 'none',            name: 'Nenhum',           emoji: '❌', category: 'head' },
  { id: 'sunglasses',      name: 'Óculos de Sol',    emoji: '😎', category: 'eyes' },
  { id: 'cool_glasses',    name: 'Óculos Nerd',      emoji: '🤓', category: 'eyes' },
  { id: 'straw_hat',       name: 'Chapéu de Palha',  emoji: '👒', category: 'head' },
  { id: 'ninja_headband',  name: 'Bandana Ninja',    emoji: '🥷', category: 'head' },
  { id: 'scouter',         name: 'Scouter',          emoji: '📡', category: 'eyes' },
  { id: 'pirate_bandana',  name: 'Bandana Pirata',   emoji: '🏴‍☠️', category: 'head' },
  { id: 'crown',           name: 'Coroa Real',       emoji: '👑', category: 'head' },
  { id: 'cat_ears',        name: 'Orelhas de Gato',  emoji: '🐱', category: 'head' },
  { id: 'halo',            name: 'Auréola',          emoji: '😇', category: 'aura' },
  { id: 'devil_horns',     name: 'Chifres',          emoji: '😈', category: 'head' },
];

// ============================================================
// Snake Body Themes (patterns & designs on the body)
// ============================================================

export type SnakeTheme =
  | 'none'
  | 'stripes'
  | 'zigzag'
  | 'dots'
  | 'galaxy'
  | 'flames'
  | 'lightning'
  | 'sakura'
  | 'scales'
  | 'neon'
  | 'camo';

export interface ThemeDef {
  id: SnakeTheme;
  name: string;
  emoji: string;
}

export const SNAKE_THEMES: ThemeDef[] = [
  { id: 'none',      name: 'Padrão',      emoji: '⬜' },
  { id: 'stripes',   name: 'Listras',     emoji: '🦓' },
  { id: 'zigzag',    name: 'Zigzag',      emoji: '〰️' },
  { id: 'dots',      name: 'Bolinhas',    emoji: '⚫' },
  { id: 'galaxy',    name: 'Galáxia',     emoji: '🌌' },
  { id: 'flames',    name: 'Chamas',      emoji: '🔥' },
  { id: 'lightning', name: 'Raio',        emoji: '⚡' },
  { id: 'sakura',    name: 'Sakura',      emoji: '🌸' },
  { id: 'scales',    name: 'Escamas',     emoji: '🐉' },
  { id: 'neon',      name: 'Neon',        emoji: '💜' },
  { id: 'camo',      name: 'Camuflagem',  emoji: '🌿' },
];

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
  activeAbility: DevilFruitAbility | null;
  abilityEndTime: number;
  accessory?: SnakeAccessory;
  theme?: SnakeTheme;
}

export interface Food {
  id: string;
  position: Vector2D;
  color: string;
  size: number;
  value: number;
}

// ============================================================
// Devil Fruits (One Piece) - Special ability items
// ============================================================

export type DevilFruitAbility =
  | 'resistance'
  | 'invisibility'
  | 'speed'
  | 'phasing'
  | 'magnet'
  | 'fireboost'
  | 'growth'
  | 'freeze';

export interface DevilFruitDef {
  ability: DevilFruitAbility;
  name: string;
  japaneseName: string;
  color: string;
  glowColor: string;
  duration: number;
  description: string;
  emoji: string;
}

export interface DevilFruit {
  id: string;
  position: Vector2D;
  ability: DevilFruitAbility;
  name: string;
  color: string;
  glowColor: string;
  size: number;
  emoji: string;
}

export const DEVIL_FRUITS: DevilFruitDef[] = [
  {
    ability: 'resistance',
    name: 'Gomu Gomu no Mi',
    japaneseName: '\u30B4\u30E0\u30B4\u30E0\u306E\u5B9F',
    color: '#e74c3c',
    glowColor: '#ff6b6b',
    duration: 15,
    description: 'Sobrevive 1 colis\u00E3o',
    emoji: '\uD83D\uDEE1\uFE0F',
  },
  {
    ability: 'invisibility',
    name: 'Suke Suke no Mi',
    japaneseName: '\u30B9\u30B1\u30B9\u30B1\u306E\u5B9F',
    color: '#9b59b6',
    glowColor: '#c39bd3',
    duration: 10,
    description: 'Invis\u00EDvel para inimigos',
    emoji: '\uD83D\uDC7B',
  },
  {
    ability: 'speed',
    name: 'Pika Pika no Mi',
    japaneseName: '\u30D4\u30AB\u30D4\u30AB\u306E\u5B9F',
    color: '#f1c40f',
    glowColor: '#f9e547',
    duration: 8,
    description: 'Velocidade da luz',
    emoji: '\u26A1',
  },
  {
    ability: 'phasing',
    name: 'Bari Bari no Mi',
    japaneseName: '\u30D0\u30EA\u30D0\u30EA\u306E\u5B9F',
    color: '#2ecc71',
    glowColor: '#58d68d',
    duration: 8,
    description: 'Atravessa cobras',
    emoji: '\uD83C\uDF00',
  },
  {
    ability: 'magnet',
    name: 'Yami Yami no Mi',
    japaneseName: '\u30E4\u30DF\u30E4\u30DF\u306E\u5B9F',
    color: '#2c3e50',
    glowColor: '#5d6d7e',
    duration: 12,
    description: 'Atrai comida pr\u00F3xima',
    emoji: '\uD83D\uDD73\uFE0F',
  },
  {
    ability: 'fireboost',
    name: 'Mera Mera no Mi',
    japaneseName: '\u30E1\u30E9\u30E1\u30E9\u306E\u5B9F',
    color: '#e67e22',
    glowColor: '#f39c12',
    duration: 10,
    description: 'Boost sem custo',
    emoji: '\uD83D\uDD25',
  },
  {
    ability: 'growth',
    name: 'Magu Magu no Mi',
    japaneseName: '\u30DE\u30B0\u30DE\u30B0\u306E\u5B9F',
    color: '#c0392b',
    glowColor: '#e74c3c',
    duration: 0,
    description: 'Crescimento +50',
    emoji: '\uD83C\uDF0B',
  },
  {
    ability: 'freeze',
    name: 'Hie Hie no Mi',
    japaneseName: '\u30D2\u30A8\u30D2\u30A8\u306E\u5B9F',
    color: '#3498db',
    glowColor: '#85c1e9',
    duration: 8,
    description: 'Invenc\u00EDvel',
    emoji: '\u2744\uFE0F',
  },
];

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
  worldSize: 12000,
  maxPlayers: 30,
  foodCount: 3500,
  baseSpeed: 3.8,
  boostSpeed: 7.2,
  boostCost: 0.25,
  growthRate: 1,
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
  | 'devil_fruit_eaten'
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
  devilFruits?: DevilFruit[];
  tick: number;
}

export interface DeathPayload {
  playerId: string;
  killedBy: string | null;
  score: number;
  length: number;
}
