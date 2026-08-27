# Territory Classic Rules — v0.1

This file locks the working rules used by the first release. Runtime code reads the corresponding
data from `ClassicModeConfig` and `BaseMapDefinition`; UI components must not duplicate these values.

## Match

- Two to four human players on one device; no bots or neutral pieces.
- Turn order is shuffled by the engine when the match starts and is reproducible from the match seed.
- Ten victory points wins.
- Two six-sided dice; a total of seven starts the robber flow.
- Players holding more than seven resources discard half, rounded down, after a seven.
- Exact resource hands and progress cards are private; public panels show totals.

## Resources and construction

| Item          | Cost                                  | Supply | Value / output          |
| ------------- | ------------------------------------- | -----: | ----------------------- |
| Road          | 1 Wood, 1 Brick                       |     15 | 0 VP                    |
| House         | 1 Wood, 1 Brick, 1 Grain, 1 Livestock |      5 | 1 VP, 1 resource        |
| Mansion       | 2 Grain, 3 Ore                        |      4 | 2 VP total, 2 resources |
| Progress card | 1 Grain, 1 Livestock, 1 Ore           |      — | Card-defined            |

During action phase, construction costs are paid to the bank atomically with placement:

- A Road uses an empty edge connected to the player's network. An opponent building blocks extending
  through that corner.
- A House uses an empty corner at least two edges from every other building and must touch one of the
  player's Roads.
- A Mansion replaces one of the player's Houses. The Mansion supply decreases by one, the replaced
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
- Each adjacent House requests one matching resource; each adjacent Mansion requests two.
- Production demand is aggregated before transfers. If the bank cannot satisfy all demand for a
  resource type, nobody receives that type for the roll; other resource types still resolve.
- After production, play enters the action phase. Ending the turn clears the dice and advances to the
  next player in randomized turn order.
- A total of seven produces nothing and begins the discard/robber sequence.

## Base map and trading

- Nineteen terrain hexes: four Forest, three Hills, four Fields, four Pasture, three Mountains, and
  one Wasteland.
- Eighteen number tokens: 2; two each of 3–6; two each of 8–11; and 12.
- Six and eight tokens may not be adjacent after randomized placement.
- The robber begins on the Wasteland.
- Four generic 3:1 ports and one 2:1 port for each resource.
- Bank trading defaults to 4:1; an owned adjacent port improves the applicable rate.
- Player trades are offered and accepted atomically during the active player's action phase.

## Progress deck

- 14 Guard cards: move the robber, steal normally, and count toward Largest Force.
- 2 Roadworks cards: place two free roads.
- 2 Plenty cards: take two available resources from the bank.
- 2 Monopoly cards: take the selected resource type from every opponent.
- 5 Territory Charter cards: one hidden victory point each.

Only one non-victory progress card may be played per turn. An action card bought during the current
turn cannot be played until a later turn.

## Awards

- Longest Road requires at least five connected roads and is worth two VP.
- Largest Force requires at least three played Guard cards and is worth two VP.
- The incumbent retains an award when tied. If an unheld award has a tie for the lead, nobody holds
  it until one player leads outright.
