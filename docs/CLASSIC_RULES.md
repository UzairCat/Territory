# Territory Classic Rules — v0.1

This file locks the working rules used by the first release. Runtime code reads the corresponding
data from `ClassicModeConfig` and `BaseMapDefinition`; UI components must not duplicate these values.

## Match

- Two to four human players on one device; no bots or neutral pieces.
- Turn order is shuffled by the engine when the match starts and is reproducible from the match seed.
- Ten victory points wins.
- Two six-sided dice; a total of seven starts the robber flow.
- Players holding more than seven resources discard half, rounded down, after a seven.
- The current local testing client shows the active hand and exact event details without handoff
  confirmations; opponent panels show compact card totals.

## Resources and construction

| Item          | Cost                                  | Supply | Value / output          |
| ------------- | ------------------------------------- | -----: | ----------------------- |
| Road          | 1 Wood, 1 Brick                       |     15 | 0 VP                    |
| House         | 1 Wood, 1 Brick, 1 Grain, 1 Livestock |      5 | 1 VP, 1 resource        |
| City          | 2 Grain, 3 Ore                        |      4 | 2 VP total, 2 resources |
| Progress card | 1 Grain, 1 Livestock, 1 Ore           |      — | Card-defined            |

During action phase, construction costs are paid to the bank atomically with placement:

- A Road uses an empty edge connected to the player's network. An opponent building blocks extending
  through that corner.
- A House uses an empty corner at least two edges from every other building and must touch one of the
  player's Roads.
- A City replaces one of the player's Houses. The City supply decreases by one, the replaced
  House returns to supply, and the building is worth 2 VP total.
- Construction is rejected before any state changes if the player is inactive, outside action phase,
  cannot pay, has no matching piece, or selects an illegal target.

The bank begins with 19 cards each of Wood, Brick, Grain, Livestock, and Ore. If it cannot satisfy
the complete demand for one resource type during production, nobody receives that resource type for
that event; other resource types resolve normally.

## Initial placement

- Setup follows randomized turn order forward and then in reverse. Four players therefore place in
  the order P1 → P2 → P3 → P4 → P4 → P3 → P2 → P1.
- Each setup placement is one House followed immediately by one Road touching that House.
- Houses must use empty vertices and obey the distance rule; setup Houses do not require an existing
  road network.
- Roads must use an empty edge attached to the House placed in the current setup pair.
- A player's second House grants one resource from every adjacent producing hex, with those cards
  removed from the bank.
- After the last setup Road, P1 becomes active and normal play begins in `WAITING_FOR_ROLL`.

## Normal turn and production

- The active player must roll two six-sided dice before ending their turn or taking normal build
  actions.
- Every non-seven total produces from matching numbered hexes except the hex occupied by the robber.
- Each adjacent House requests one matching resource; each adjacent City requests two.
- Production demand is aggregated before transfers. If the bank cannot satisfy all demand for a
  resource type, nobody receives that type for the roll; other resource types still resolve.
- After production, play enters the action phase. Ending the turn clears the dice and advances to the
  next player in randomized turn order.
- A total of seven produces nothing and begins the discard/robber sequence.

## Seven and robber sequence

- Every player holding more than seven resource cards discards half their hand, rounded down. Players
  discard one at a time in match turn order, and discarded cards return to the bank.
- After all required discards, the active player must move the robber to a different terrain hex.
- An opponent is eligible to be robbed when they own a House or City adjacent to the destination
  hex and hold at least one resource card.
- If exactly one opponent is eligible, one of their resource cards is stolen automatically. If
  several are eligible, the active player chooses the opponent. With no eligible opponent, no card is
  stolen.
- Each card in the chosen opponent's hand is equally likely to be stolen. The local testing log names
  the stolen type so the deterministic result can be verified.
- After robber movement and any steal resolve, the active player's action phase begins normally.

## Base map

- Nineteen terrain hexes: four Forest, three Hills, four Fields, four Pasture, three Mountains, and
  one Wasteland.
- Eighteen number tokens: 2; two each of 3–6; two each of 8–11; and 12.
- Six and eight tokens may not be adjacent after randomized placement.
- The robber begins on the Wasteland.
- Four generic 3:1 ports and one 2:1 port for each resource.

## Trading

- Trading is available only to the active player during action phase and cannot overlap another
  mandatory interaction.
- A bank exchange gives four identical resource cards for one available bank card of a different
  type. A House or City on a generic port lowers the rate to 3:1; a building on the matching
  resource port lowers that resource's rate to 2:1. The best applicable rate is used.
- A bank trade fails without changing state when the player cannot pay or the bank has none of the
  requested card.
- A player offer names one opponent and contains exact, non-empty offered and requested bundles. The
  same resource type cannot appear on both sides.
- Creating an offer moves no cards. The opponent accepts or rejects it in an immediate mandatory
  dialog; acceptance rechecks both hands and transfers both bundles atomically.
- An unaffordable or otherwise stale offer cannot be accepted. Open offers are cancelled when the
  proposing turn ends. Counteroffers and offers to several opponents are deferred from v0.1.

## Progress deck

- 14 Knight cards: move the robber, steal normally, and count toward Largest Force.
- 2 Road Building cards: place two free roads.
- 2 Year of Plenty cards: take two available resources from the bank.
- 2 Monopoly cards: take the selected resource type from every opponent.
- 5 unique victory-point cards: Chapel, Library, Market, Palace, and University. Each is worth one
  hidden victory point.

Only one non-victory progress card may be played per turn. An action card bought during the current
turn cannot be played until a later turn.

- Knight enters the normal robber move/steal flow without triggering seven-card discards.
- Road Building places up to two legal connected Roads without resource cost and stops early only when
  the player runs out of road pieces or legal targets.
- Year of Plenty must choose exactly two cards currently available in the finite bank; both may be the same
  resource when the bank has two.
- Monopoly transfers every opponent card of the selected resource directly to the active player.
- Victory-point cards remain in the progress-card hand, cannot be played, and count automatically
  toward authoritative victory.

## Awards

- Longest Road requires at least five connected roads and is worth two VP.
- Largest Force requires at least three played Knight cards and is worth two VP.
- The incumbent retains an award when tied. If an unheld award has a tie for the lead, nobody holds
  it until one player leads outright.

Longest Road is the longest edge-simple trail of owned Roads: branches cannot reuse an edge, loops
may count each edge once, and an opponent House or City may be an endpoint but cannot be crossed.
Awards recalculate after Roads, buildings, and played Knight cards.

## Victory

Scores are derived rather than stored: buildings, Longest Road, Largest Force, and owned
victory-point cards are summed after every score-capable action. The open local testing panels show
this authoritative total; a separate public-score helper can omit hidden card VP for a future
private client.
When the active player reaches the configured target with no unresolved interaction, the engine
enters `GAME_OVER`, rejects further gameplay actions, and reveals the final breakdown. A rematch keeps
the lobby but creates a new seed, randomized order, board, deck, and match state.
