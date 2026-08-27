# Territory

Territory is a local hot-seat strategy game for two to four players. The first release is
browser-based and is being built around a deterministic, UI-independent TypeScript rules engine so
the same protocol can support online play later.

## Development

Requires Node.js 24 or newer.

```sh
npm install
npm run dev
```

Run the complete local verification suite with:

```sh
npm run check
```

The implementation roadmap is split into independently verified phases.

- Phase 1 established the project tooling, locked classic content, core state/action/event types,
  deterministic random provider, and authoritative dispatch boundary.
- Phase 2 added application routing, the main menu, settings, the complete local lobby, player
  editing, lobby validation, randomized turn order, and deterministic match initialization.
- Phase 3 added deterministic classic board and progress-deck generation, validated shared topology,
  a responsive PixiJS board with stable interaction targets, and the first complete match-table HUD.
- Phase 4 adds the complete initial-placement sequence: legal house and attached-road targets, placed
  piece rendering, forward/reverse snake order, starting resources, and normal-turn handoff.

The initialized game route now renders the generated board, ports, tokens, robber, player order,
public piece counts, resource hand, optional developer IDs, and engine-authoritative setup controls.
Dice rolling and production begin in Phase 5.

See [Architecture](docs/ARCHITECTURE.md) and [Classic Rules](docs/CLASSIC_RULES.md) for the decisions
that later phases build upon.
