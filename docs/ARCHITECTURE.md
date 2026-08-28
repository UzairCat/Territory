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

Every v0.1 gameplay action is now routed through this boundary. Rule handlers validate complete
preconditions before constructing a candidate state; the dispatcher then applies centralized scoring
to score-capable actions and appends all resulting event types to the same history entry.

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
only the active player to submit the expected action. A setup building must satisfy occupancy,
distance, and piece-supply rules. The following road must occupy an empty edge attached to that exact
building. Classic places Houses in both rounds; K+N places a House in the forward round and a City in
the reverse round.

Legal-target selectors share the same rule predicates as the dispatcher, so Pixi highlights are an
affordance rather than authority. Every click still becomes a serializable `GameAction` submitted
through `dispatch`. Rejections preserve the identical state object; accepted actions append history
and emit ordered domain events. Second-round buildings receive one basic resource from each adjacent
producing hex, with matching cards removed from the bank. K+N setup Cities neither double that grant
nor produce commodities. The final road atomically clears setup state and enters `WAITING_FOR_ROLL`
with the first player active.

## Dice, production, and normal-turn handoff

`ROLL_DICE` is accepted only from the active player in `WAITING_FOR_ROLL`. Both d6 values come from
the match's persisted random state, so replays consume the same results. A non-seven roll aggregates
all matching, non-robber hex demand before moving any cards. Houses request one card per adjacent
matching hex and Cities request two. If the bank cannot satisfy the complete demand for one
resource type, that resource is canceled for every player while unrelated resources still resolve.

The accepted roll stores both dice, atomically transfers bank cards, emits a production summary, and
enters `ACTION_PHASE`. The local testing UI expands that event into exact per-player resource entries
in the game log. `END_TURN` is legal only from action phase; it clears per-turn state, advances the
deterministic player order, increments the turn number, and returns to `WAITING_FOR_ROLL`.

K+N routes `ROLL_KN_DICE` through the same dispatcher but persists a red numeric die, regular numeric
die, and Event die. Its resolver commits the Event result first: barbarian attacks or Progress Card
draw queues must finish before the numeric total can produce cards or begin a seven. Deferred numeric
resolution is stored in `KNState.pendingRoll`, so a private draw, fifth-card return, attack choice, or
Aqueduct choice can pause and resume the roll without depending on a mounted component. Cities use a
mode-specific production demand calculator that can request resources and commodities atomically.

A seven performs no production. It deterministically queues players above the configured discard
threshold in match turn order. Each queued `DISCARD_RESOURCES` action must contain exactly half of
that player's hand, rounded down, and atomically returns those cards to the finite bank. The active
player then submits `MOVE_ROBBER` for any hex other than the robber's current location.

Victim eligibility is derived from opponent buildings adjacent to the destination hex and excludes
players with no resource cards. Zero victims proceeds directly to `ACTION_PHASE`; one victim is
stolen from automatically; multiple victims create an authoritative `CHOOSE_STEAL_TARGET`
interaction. Steals sample the victim's actual card inventory through the persisted random provider,
so every card is equally likely and replays remain deterministic. The local UI opens each required
discard picker immediately and keeps it non-dismissible; the exact discarded or stolen resource is
then recorded in the event-backed game log. These presentation choices do not replace engine
validation.

## Normal construction

Normal construction is split between pure legality queries and authoritative actions. The shared
resource helpers compare arbitrary bundles and apply payments without mutating their inputs. Road,
House, and City costs always come from the match's mode configuration; accepted payments return
those cards to the finite bank in the same transition that changes the board and piece inventories.

Road targets must be empty and connect to the player's road/building network. An opponent building
blocks continuation through its vertex. House targets must be empty, obey the distance rule, and touch
an owned road. City targets must contain an owned House; upgrading consumes one City and returns
the replaced House to its player's supply. Building VP is derived from board state, so the public score
changes immediately without maintaining a second mutable score counter.

The action-phase UI keeps only the temporary selected construction type as interface state. It asks
the engine for legal targets, highlights those targets, and still dispatches the final target through
the same validating action boundary. A successful placement keeps that construction type selected and
refreshes its targets so multiple matching pieces can be built; Escape, selecting the active build
button again, switching type, or ending the turn exits the mode. Accepted `RESOURCES_SPENT`,
`ROAD_BUILT`, `BUILDING_PLACED`,
`BUILDING_UPGRADED`, and `SCORE_CHANGED` events provide public feedback plus animation/audio hooks;
the current renderer uses the placement event to fade the new piece into view.

## Trading protocol

`BANK_TRADE` resolves one exchange at a time during the active player's action phase. The engine
derives the applicable ratio from configuration and buildings on port vertices, taking the best of
the base 4:1 rate, an owned generic 3:1 port, and an owned resource-specific 2:1 port. Ownership,
distinct resource types, pending interactions, and finite-bank availability are validated before the
player and bank bundles move atomically.

The local player-trade protocol uses one exact recipient per offer. `CREATE_TRADE` normalizes both
non-empty bundles, verifies the proposer owns the offered cards, stores an `OPEN` `TradeOffer`, and
creates a `TRADE_RESPONSE` pending interaction without transferring anything. The recipient alone can
submit `RESPOND_TO_TRADE`. Acceptance rechecks both current inventories and applies both directions in
one transition; a stale offer leaves the identical state unchanged. Rejection records `REJECTED`, and
ending the proposing turn records any remaining open offer as `CANCELLED`.

Historical offer status remains serializable in `GameState` for debugging and future online audit.
The local testing UI opens the recipient response immediately, shows exact terms and their hand, and
records exact completed bundles in the game log. Counteroffers and multi-recipient negotiation are
deliberately deferred in favor of the blueprint's simpler v0.1 local flow.

## Progress cards

The seeded deck contains stable card-instance IDs that reference data-driven definitions. Purchasing
atomically pays the configured cost, draws the first deck instance, records owner/purchase turn, and
adds that ID to both the player's hand and the turn's bought-card list. The UI places the drawn card
directly into the bottom progress tray without a reveal modal. Playing validates
ownership, purchase timing, one-card limit, effect feasibility, and the absence of another pending
interaction before marking the card played and discarded.

Multi-step effects reuse authoritative interactions. Knight adds its card ID to the normal robber
interaction, so destination, victim, and seeded steal rules have one implementation. Road Building uses
`PLACE_FREE_ROADS`; each regular `BUILD_ROAD` action is redirected through a no-cost handler while
that interaction exists. Year of Plenty and Monopoly use `SELECT_RESOURCES` and
`SELECT_RESOURCE_TYPE`, with bank/inventory checks repeated on the resolving action. Victory-point
cards are passive and score by
ownership, never by a mutable VP counter.

K+N disables that purchasable deck and initializes three independently seeded 18-card decks. Every
card instance references one of 25 data-driven definitions and returns to the bottom of its family
deck after resolution, except the two revealed victory cards. Automatic Event-die draws, a temporary
fifth card for the active player, immediate off-turn returns, and every multi-step card effect are
represented in serializable K+N state or a `KN_SELECTION` interaction. The UI may submit targets and
bundles, but each resolver rechecks ownership, timing, card limits, legal targets, finite supplies,
and cancellation rules before committing.

## K+N advanced-state layer

K+N remains a mode layer inside the shared engine rather than a parallel game. Optional `KNState`
holds the barbarian tracker, Event/red dice, pending roll continuation, three Progress decks and card
instances, improvement/Metropolis ownership, Merchant state, temporary card effects, attack summary,
and forced-rebuild metadata. Player and board entities carry the mode-scoped commodity, Knight, Wall,
and Metropolis data needed by common construction, trading, robber, and scoring rules.

Physical Knight actions use topology queries over the existing vertex/edge graph. The same graph
determines legal placement and movement, displacement relocation, opponent road blocking, and
Longest Road recalculation. Barbarian and Progress queues are resolved in active-player order and
remain deterministic because all random dice, card shuffles, automatic targets, and steals consume
the persisted random provider.

## Awards, scoring, and victory

Longest Road runs DFS/backtracking over owned edges and never reuses an edge in one candidate trail.
An opponent building terminates traversal at its vertex, so it may split a network. The small classic
board and 15-road player limit keep exhaustive trail search bounded. Award resolution reads minimum,
point, incumbent-tie, and unheld-tie behavior from mode config; Largest Force uses the identical tie
resolver over played Knight counts.

`calculateScoreBreakdown` is the authoritative source for building, award, hidden card, and total
points. `calculatePublicScore` omits only hidden victory-card points. After any score-capable accepted
action, the dispatcher recalculates both awards, emits award/score changes, and declares victory only
when the active player is at the target in a completed action phase with no pending choice. Victory
sets the immutable winner ID, clears interaction state, enters `GAME_OVER`, and the top-level dispatch
guard freezes all further gameplay.

In K+N, Largest Force is always disabled. The same score pipeline adds Defender points, Merchant
control, revealed Printer/Constitution cards, and Metropolis bonuses. Victory is still checked only
for the active player in a settled action phase, so an off-turn reward cannot incorrectly end the
match before that player's own turn.

## Local hot-seat presentation

Classic remains intentionally open-information for fast local testing: the active resource/progress
tray is rendered directly and its ordinary choices do not add reveal confirmations. K+N protects its
additional private information with device-handoff interstitials. The screen is obscured before an
off-turn Progress draw/return or private interaction, exposes only the required player's minimum UI,
then obscures it again before returning to the active player or advancing the queue. Exact K+N card
identities never enter the public activity log.

Opponent panels remain compact totals, while the right-side log includes public production,
payments, purchases, trades, discards, and steals. Player panels use authoritative score;
`calculatePublicScore` remains available for clients with different hidden-information policies.

The board owns the flexible upper-left area. The right rail is ordered game log, bank inventory, then
players. The bottom dock is ordered resource cards, a dividing line, progress cards, then dice,
turn/timer, and stable action controls. Setup-building, setup-road, normal-turn, and robber countdowns
live in React, while their configured normal-turn duration is serialized in `GameConfig`. Expiry
dispatches the ordinary serializable `AUTO_TIMEOUT` action; the engine chooses and validates a legal
placement, roll, discard, robber target/steal, or end-turn action through the persisted random state.
The clock therefore remains presentation state, but timeout consequences remain authoritative and
replayable.

The app retains a bounded event history for the scrolling activity log. A browser AudioManager maps
semantic engine events to replaceable synthesized starter cues, so rules never depend on audio.
Pixi placement/robber animation and CSS dice/resource/card/victory feedback respect both the app's
reduced-motion setting and the operating-system preference. Legal board targets also have an HTML
select/button path for keyboard users in addition to canvas pointer controls.

Developer IDs, serialized-state copying, and toggleable Admin mode are guarded by
`import.meta.env.DEV` and are absent from the production interface. Admin mode gives the active
player 99 of each resource when enabled and passes an explicit, non-serialized dispatch option that
skips seven-roll discard queues while preserving robber movement. Local save/resume is deliberately
not included in v0.1; `GameState` remains JSON-serializable so a validated schema migration can add
it without redesigning gameplay.

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
