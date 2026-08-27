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
- Phase 2 adds application routing, the main menu, settings, the complete local lobby, player
  editing/reordering, lobby validation, and deterministic match initialization.

The initialized game route currently presents a match summary. Board generation and PixiJS
rendering begin in Phase 3.

See [Architecture](docs/ARCHITECTURE.md) and [Classic Rules](docs/CLASSIC_RULES.md) for the decisions
that later phases build upon.
