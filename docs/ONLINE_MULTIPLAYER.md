# Online Multiplayer

## What is implemented

Territory can run a complete private-code match through an authoritative Socket.IO server. Players
use guest names; no email, password, or third-party account is required to play. The host creates a
six-character room code, configures the same mode, map, timer, victory target, discard threshold,
and optional rules as local play, then starts once every seat is connected.

The client sends only `GameAction` intents. The server owns the full `GameState`, calls the engine's
single `dispatch(state, action)` boundary, advances the revision, and emits a different projection to
each player. A browser cannot successfully act as another seat, submit automatic timeout actions,
reuse stale state, or mutate a match directly.

The protocol currently includes:

- cryptographically random room codes, player IDs, and resume tokens;
- SHA-256 token storage on the server and browser-local resume credentials;
- a 90-second grace period before a disconnected lobby seat is released;
- reconnect/resync snapshots instead of relying on missed Socket.IO messages;
- monotonic match revisions and idempotent action IDs;
- server-owned setup, roll, discard, robber, action, trade, and Progress choice deadlines;
- host-only pause, unpause, start, and rematch commands;
- Zod validation, a 100 KB message ceiling, origin controls, and basic request rate limiting;
- player-specific state that removes opponent hands, hidden card identities, deck order, RNG state,
  and the seed that could recreate it;
- redacted private discard, steal, Wedding, Progress draw, and Progress return events;
- one production process that can serve the built React app and Socket.IO endpoint together.

## Local development

```sh
npm install
npm run dev
```

Open two private/incognito browser contexts at `http://localhost:5173`, create a room in one, and join
its code in the other. Separate browser contexts matter because a resume token identifies one seat.

The server health endpoint is `http://localhost:3001/health`.

## Production configuration

The Docker image builds the Vite client and serves it from the same Node process as Socket.IO. It
expects Node 24, uses Railway's injected `PORT` when present, and otherwise listens on port 3001.

| Variable                   | Purpose                                          | Default                                                   |
| -------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| `PORT`                     | Railway-provided HTTP and Socket.IO port         | supplied automatically by Railway                         |
| `TERRITORY_SERVER_PORT`    | HTTP and Socket.IO port                          | `3001`                                                    |
| `TERRITORY_SERVE_CLIENT`   | Serve the compiled `dist` directory              | enabled in production                                     |
| `TERRITORY_CLIENT_ORIGINS` | Comma-separated allowed browser origins          | unrestricted only when the same process serves the client |
| `VITE_MULTIPLAYER_URL`     | Different Socket.IO origin baked into the client | same origin                                               |

For a public deployment, set `TERRITORY_CLIENT_ORIGINS` to the final HTTPS origin even when the app
and server share one host. The reverse proxy must support WebSocket upgrades.

## Persistence boundary

Rooms are deliberately in memory in this first deployable vertical slice. A process restart removes
active rooms, and multiple server replicas must not be enabled yet. This keeps local testing and the
first private deployment simple while the protocol stabilizes.

Before public launch, the room repository should be moved to PostgreSQL, action commits should lock
one room revision transactionally, and Socket.IO should use a multi-node adapter only if more than
one application instance is needed. That step requires an externally provisioned database URL; it
does not require changes to the rules engine or browser action protocol.

## Trust and privacy model

The server is authoritative, but gameplay choices that are public at a physical table remain public
online. The projection protects information that is supposed to be private: resource/commodity hand
composition, unrevealed Progress identities, deck order, deterministic random state, and the match
seed. Public player panels receive derived card totals and K+N Progress-family counts instead of
opponent card objects.

Resume tokens grant control of one seat. They are intentionally stored in browser local storage so a
refresh can recover the match; do not paste them into chat or logs. HTTPS is mandatory outside local
development.
