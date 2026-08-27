# Territory Architecture

## Dependency direction

```text
React screens and UI  ──────┐
                            ├──> engine public API
Pixi board renderer ────────┘

engine ──> no React, Pixi, Zustand, DOM, storage, or browser imports
```

`GameState` is the only authoritative match snapshot. UI and renderer state may describe temporary
presentation concerns, but they cannot grant resources, place pieces, roll dice, advance turns, or
otherwise change a match directly.

## Public engine boundary

- `dispatch(state, action)` is the sole gameplay mutation boundary. It returns a new state and
  ordered events on success, or the original state and a typed error on rejection.
- `GameAction`, `GameEvent`, `GamePhase`, and `PendingInteraction` are discriminated unions.
- All entities use stable branded string IDs rather than names, colors, screen positions, or array
  indices.
- `GameState`, `GameConfig`, actions, events, and random state remain JSON-serializable.
- Gameplay randomness is consumed only through the seeded random provider. The provider's state is
  stored with the match so a resumed game continues the same deterministic sequence.
- Multi-step work is explicit in `pendingInteraction`; the engine never relies on an open modal to
  remember what choice is required.

Gameplay handlers are intentionally introduced by roadmap phase. During Phase 1, the dispatcher
rejects defined-but-unavailable actions without mutation. Each later feature replaces that fallback
with a validated, atomic transition and focused tests.

## Intended online shape

Local v0.1 calls `dispatch` in the browser. A future online client sends the same serializable action
to a server that owns `GameState`, calls the same engine, and broadcasts the accepted snapshot/events.
No networking code belongs in the v0.1 engine.

## Testing boundaries

- Engine tests interact through public actions except for narrowly scoped state fixtures.
- Rejected actions must retain the identical state object and produce no domain events.
- Configuration and board definitions are checked independently from rendering.
- UI tests must verify that highlighted targets and disabled controls use engine selectors and error
  codes rather than copied rules.
