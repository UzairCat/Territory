# Territory

Territory is a browser-based strategy game for two to four players. It supports local hot-seat play
and private-code online rooms backed by the same deterministic, UI-independent TypeScript rules
engine.

## Development

Requires Node.js 24 or newer.

```sh
npm install
npm run dev
```

`npm run dev` starts both the Vite client on `http://localhost:5173` and the authoritative
multiplayer server on `http://localhost:3001`. The Vite development server proxies Socket.IO to the
multiplayer process, so the default setup needs no environment file.

To exercise the production-shaped single-server build locally:

```sh
npm run build
npm start
```

Then open `http://localhost:3001`. A Docker build is also provided.

Run the complete local verification suite with:

```sh
npm run check
```

The v0.1 roadmap is implemented as independently verified phases.

- Phase 1 established the project tooling, locked classic content, core state/action/event types,
  deterministic random provider, and authoritative dispatch boundary.
- Phase 2 added application routing, the main menu, settings, the complete local lobby, player
  editing, lobby validation, randomized turn order, and deterministic match initialization.
- Phase 3 added deterministic classic board and progress-deck generation, validated shared topology,
  a responsive PixiJS board with stable interaction targets, and the first complete match-table HUD.
- Phase 4 added the complete initial-placement sequence: legal house and attached-road targets, placed
  piece rendering, forward/reverse snake order, starting resources, and normal-turn handoff.
- Phase 5 added deterministic 2d6 rolls, finite-bank production, robber blocking, resource-shortage
  handling, public gain feedback, rolled-tile highlights, and repeatable end-turn advancement.
- Phase 6 added engine-authoritative normal construction for Roads, Houses, and Cities, including
  costs, bank returns, piece limits, network/distance validation, legal-target queries, and build mode.
- Phase 7 added the complete seven-roll robber sequence: deterministic discard queues, mandatory
  discard selection, robber movement, eligible-victim selection, and seeded random stealing.
- Phase 8 added bank and port trading plus atomic player-to-player offers, including immediate local
  accept/reject decisions, stale-offer validation, cancellation, and detailed trade feedback.
- Phase 9 added the complete progress deck: direct tray purchases, purchase-turn and play limits,
  Knight, Road Building, Year of Plenty, Monopoly, five unique passive victory-point cards, and
  mandatory card-resolution UI.
- Phase 10 added graph-correct Longest Road, Largest Force, centralized hidden/public scoring,
  authoritative victory detection, final score breakdowns, and same-lobby rematches.
- Phase 11 added detailed event history, event-driven starter audio, reduced-motion/animation
  settings, keyboard board targeting, and costly-navigation confirmation.
- Phase 12 hardened the release with production-guarded developer tools, complete engine/UI coverage,
  release documentation, and a single manual acceptance matrix.
- Phase 15 adds the complete K+N advanced mode: three-die event-first turns, commodities, barbarian
  attacks, Walls, physical Knights, three Improvement tracks and powers, Metropolises, the Merchant,
  three 18-card Progress decks with all 25 unique effects, 13-point scoring, and private hot-seat
  decisions.

The initialized game route now uses a board-first match table. A fixed right rail contains the full
interaction log, finite bank inventory, and compact player stats. The bottom tray places the active
resource hand on the left, progress cards after a divider, clickable dice above the turn/timer strip,
and six fixed actions in the order Trade, Progress, Road, House, City, End Turn. This local build
keeps hands and mandatory decisions immediately visible for testing; there are no pass-device reveal
confirmations in Classic. K+N adds pass-device protection where its off-turn draws and private
decisions require it.

- The online foundation adds guest identities, private room codes, hashed resume tokens, a
  90-second lobby reconnect grace period, player-specific hidden-information projections,
  server-authoritative actions and timers, host pause/rematch controls, request validation,
  idempotent action IDs, stale-revision rejection, rate limiting, and a production container.

Setup buildings, setup Roads, normal turns, and robber placement now have visible countdowns. The
normal-turn duration is configurable in the lobby and defaults to one minute; validated actions
restore at least 20 seconds near expiry, and all timer expirations dispatch ordinary authoritative
automatic actions.

After setup, Classic players can roll, produce, resolve sevens, construct, trade, buy/play progress
cards, claim awards, and complete a match through victory and rematch. K+N runs through the same
engine boundary with its advanced replacements. Optional developer IDs remain available without
changing the authoritative engine flow.

See [Architecture](docs/ARCHITECTURE.md), [Classic Rules](docs/CLASSIC_RULES.md), and
[K+N Rules](docs/KN_RULES.md) for the decisions behind the implementation. The online protocol and
deployment boundary are documented in [Online Multiplayer](docs/ONLINE_MULTIPLAYER.md). Use the
[acceptance test](docs/ACCEPTANCE_TESTS.md) for a single manual confidence pass.
