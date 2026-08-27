# Territory Classic Rules — v0.1

This file locks the working rules used by the first release. Runtime code reads the corresponding
data from `ClassicModeConfig` and `BaseMapDefinition`; UI components must not duplicate these values.

## Match

- Two to four human players on one device; no bots or neutral pieces.
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

The bank begins with 19 cards each of Wood, Brick, Grain, Livestock, and Ore. If it cannot satisfy
the complete demand for one resource type during production, nobody receives that resource type for
that event; other resource types resolve normally.

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
