# Bentropy Arena

Jogo multiplayer estilo **slither.io** construído com React + TypeScript + Canvas 2D + Firebase.

## Features

- **Controle suave** — Mouse/touch com interpolação de direcao
- **Boost** — Segure o clique para acelerar (consome tamanho)
- **IA Bots** — 8 bots inteligentes com desvio de obstaculos e colisao
- **Renderizacao Canvas 2D** — Grade, particulas, glow, minimap, screen shake
- **Login Google** — Firebase Auth com Google
- **Leaderboard global** — Firestore com ranking por pontuacao, kills e tamanho
- **Responsivo** — Suporte a desktop e mobile (touch)
- **Deploy Vercel** — Serverless functions para API

## Stack

| Tech | Uso |
|------|-----|
| React 19 | UI e telas |
| TypeScript | Tipagem |
| Vite | Build e dev server |
| Tailwind CSS 4 | Estilizacao |
| Canvas 2D | Motor grafico do jogo |
| Firebase | Auth + Firestore |
| Zustand | Gerenciamento de estado |
| Vercel | Deploy |

## Primeiros passos

```bash
# Instalar dependencias
npm install

# Configurar Firebase (opcional — funciona com bots locais sem Firebase)
# Crie um arquivo .env com:
# VITE_FIREBASE_API_KEY=...
# VITE_FIREBASE_AUTH_DOMAIN=...
# VITE_FIREBASE_PROJECT_ID=...
# VITE_FIREBASE_STORAGE_BUCKET=...
# VITE_FIREBASE_MESSAGING_SENDER_ID=...
# VITE_FIREBASE_APP_ID=...

# Iniciar em modo desenvolvimento
npm run dev

# Build para producao
npm run build
```

## Estrutura do projeto

```
src/
  engine/         # Motor do jogo (Canvas 2D)
  screens/        # Telas (Login, Menu, Game, Leaderboard)
  components/     # Componentes UI (HUD, DeathModal)
  stores/         # Estado global (Zustand)
  services/       # WebSocket + Leaderboard
  config/         # Firebase config
  types/          # TypeScript types
api/              # Serverless functions (Vercel)
```

## Como jogar

1. Faca login com Google
2. Escolha seu nome e cor da cobra
3. Mova o mouse para controlar a direcao
4. Segure o clique para boost (consome tamanho)
5. Coma a comida para crescer e ganhar pontos
6. Evite colidir com outras cobras e com as bordas!

## Licenca

MIT
