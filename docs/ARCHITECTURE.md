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

## Board generation and rendering

The classic board is generated from the match's seeded random state. Terrain, number tokens, ports,
and the progress deck are reproducible, and generation rejects a layout in which 6 and 8 tokens are
adjacent. The generator builds shared topology rather than six independent corners per hex: the base
map contains exactly 19 hexes, 54 vertices, 72 edges, 30 coastal edges, and 9 ports. Reciprocal
references and starting invariants are validated before a match can be created.

Topology positions use an integer lattice in the engine, so shared corners receive the same stable ID
without relying on floating-point equality. The renderer converts that lattice into pixels in a pure
render-model adapter. PixiJS owns canvas presentation, hit targets, pan, zoom, and hover state; React
owns the surrounding HUD. Neither layer is allowed to mutate authoritative game state directly.

## Initial placement protocol

New matches enter `SETUP_PLACE_HOUSE` immediately. The engine derives a deterministic snake from the
already-randomized player order, records the current placement-pair index in `TurnState`, and permits
only the active player to submit the expected action. A setup house must satisfy occupancy, distance,
and piece-supply rules. The following road must occupy an empty edge attached to that exact house.

Legal-target selectors share the same rule predicates as the dispatcher, so Pixi highlights are an
affordance rather than authority. Every click still becomes a serializable `GameAction` submitted
through `dispatch`. Rejections preserve the identical state object; accepted actions append history
and emit ordered domain events. Second-round houses receive resources from adjacent producing hexes,
with matching cards removed from the bank. The final road atomically clears setup state and enters
`WAITING_FOR_ROLL` with the first player active.

## Dice, production, and normal-turn handoff

`ROLL_DICE` is accepted only from the active player in `WAITING_FOR_ROLL`. Both d6 values come from
the match's persisted random state, so replays consume the same results. A non-seven roll aggregates
all matching, non-robber hex demand before moving any cards. Houses request one card per adjacent
matching hex and Mansions request two. If the bank cannot satisfy the complete demand for one
resource type, that resource is canceled for every player while unrelated resources still resolve.

The accepted roll stores both dice, atomically transfers bank cards, emits a public production
summary, and enters `ACTION_PHASE`. Public UI feedback reports only card totals per player, preserving
private resource types. `END_TURN` is legal only from action phase; it clears per-turn state, advances
the deterministic player order, increments the turn number, and returns to `WAITING_FOR_ROLL`.

A seven performs no production. It deterministically identifies players above the discard threshold
and enters either `DISCARD_RESOURCES` or `MOVE_ROBBER`. Those pending-interaction states are already
authoritative; their completion UI and actions belong to the dedicated robber phase.

## Intended online shape

Local v0.1 calls `dispatch` in the browser. A future online client sends the same serializable action
to a server that owns `GameState`, calls the same engine, and broadcasts the accepted snapshot/events.
No networking code belongs in the v0.1 engine.

## Testing boundaries

- Engine tests interact through public actions except for narrowly scoped state fixtures.
- Rejected actions must retain the identical state object and produce no domain events.
- Configuration and board definitions are checked independently from rendering.
- Pure render-model tests verify entity-to-target identity and geometry without requiring WebGL.
- UI tests must verify that highlighted targets and disabled controls use engine selectors and error
  codes rather than copied rules.
