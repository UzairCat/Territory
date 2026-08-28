# Territory K+N rules

K+N is Territory's advanced local mode. It uses the same board, resource bank, trading,
construction, robber, road, scoring, and action-dispatch engine as Classic, then replaces or extends
the systems described here. The default victory target is 13 points.

## What K+N replaces

- Setup is House + Road in forward order, then City + Road in reverse order.
- The purchasable Classic progress deck is disabled. K+N uses three 18-card decks earned from the
  Event die.
- Largest Force is disabled. Physical Knights and permanent Defender points replace it.
- Turns use a red numeric die, a regular numeric die, and an Event die.
- The robber is locked until the first barbarian attack has resolved.
- Cities produce commodities on Forest, Pasture, and Mountain terrain.

Longest Road, ports, ordinary construction, player/bank trades, finite supplies, and the normal
House/City victory points remain active.

## Setup

For two to four players, setup follows this snake:

1. Forward order: every player places one House and one connected Road.
2. Reverse order: every player places one City and one connected Road.
3. Each setup City grants one basic resource for every adjacent producing land tile. It does not
   double resources and grants no commodities.
4. The original first player begins the first normal turn.

The setup timer is three minutes for each House or City and one minute for each Road. An expired
timer places a random legal piece through the same validated engine action used by a click.

## Dice and resolution order

Every normal turn starts with three dice. The numeric total is red + regular. Resolution order is
authoritative and cannot be changed by animation timing:

1. Resolve the Event die.
2. Advance and, if necessary, resolve a barbarian attack; or award eligible Progress Card draws.
3. Resolve the numeric total.
4. On a non-seven, distribute all production and then queue Aqueduct choices.
5. On a seven, resolve discards and then the robber if it has been unlocked.
6. Enter the action phase.

The lobby's Turn time setting controls the combined roll/action timer and defaults to one minute.
Successful builds, purchases, trades, Knight actions, improvements, and Progress Card resolutions
restore the timer to 20 seconds when less than 20 seconds remain. The final ten seconds flash red
and play a tick. The robber has its own 20-second timer; expiry chooses an opponent-adjacent legal
tile when one exists and resolves a random legal steal.

## Production and commodities

| Terrain  | House       | City                  |
| -------- | ----------- | --------------------- |
| Forest   | 1 Wood      | 1 Wood + 1 Paper      |
| Pasture  | 1 Livestock | 1 Livestock + 1 Cloth |
| Mountain | 1 Ore       | 1 Ore + 1 Coin        |
| Hill     | 1 Brick     | 2 Brick               |
| Field    | 1 Grain     | 2 Grain               |
| Desert   | Nothing     | Nothing               |

Paper, Cloth, and Coin are finite bank cards. They count with resources for player trades, robber
steals, hand totals, and seven-roll discards. Progress Cards never count as hand cards for these
rules. A robber-blocked tile produces neither its resource nor its commodity.

At Trade improvement level 3, identical commodities may be traded 2:1. Merchant Fleet may grant a
temporary 2:1 quote for any chosen good, and the Merchant grants 2:1 for the resource under its tile.
The best applicable bank/port quote is always used.

## Barbarians and the early robber

The Event die has three barbarian faces and one face for each Progress family. A barbarian face
advances the seven-space tracker. On arrival:

- Barbarian strength is the number of Cities and Metropolises on the board.
- Defender strength is the sum of every active Knight's level.
- A successful defense awards one permanent Defender VP to a unique top contributor.
- Tied top contributors instead choose and draw from one of the three Progress decks in active-player
  order.
- A failed defense makes every lowest eligible contributor downgrade one vulnerable City. A
  Metropolis is immune. A Wall on a lost City is destroyed.
- All Knights deactivate, the tracker resets, and the first attack unlocks the robber.

Before that first attack, a seven still causes normal discards but does not move the robber or steal.
If the Event die triggers the first attack on the same roll as a numeric seven, the attack resolves
first, so that seven uses the newly unlocked robber.

## Walls

A Wall costs two Brick, attaches to a City, and is limited to three per player and one per City. It
does not add barbarian defense. It changes the safe hand limit for a seven to:

`7 + (2 × Walls owned)`

A City lost to barbarians loses its Wall and returns that Wall to its owner's supply. If all five
House pieces are already in use, the downgraded location becomes a forced City rebuild; that City
must be restored before a different House may be upgraded.

## Knights

Each player has two pieces at each rank: Basic (1), Strong (2), and Mighty (3).

- Build a Basic Knight: 1 Livestock + 1 Ore.
- Activate an inactive Knight: 1 Grain.
- Upgrade one rank: 1 Livestock + 1 Ore.
- Mighty Knights require Politics level 3 unless an explicit card bypasses that gate.

A Knight occupies an otherwise empty road-connected vertex and does not obey building distance.
An opponent Knight blocks road continuity through its vertex, including Longest Road. A Knight
activated this turn cannot act until a later turn. An already-active Knight may perform one action,
then deactivates:

- Move through its owner's unblocked Road network to an empty vertex.
- Displace a strictly weaker opponent Knight reachable through that network. The displaced owner
  privately relocates it if possible; otherwise it leaves the board.
- After the first barbarian attack, chase the robber when adjacent to it, then move and steal through
  the normal robber flow.

## City improvements and Metropolises

Each player has Science/Paper, Trade/Cloth, and Politics/Coin tracks from level 0 to 5. A player must
own a City or Metropolis to buy an improvement. The level being purchased is its cost: 1, 2, 3, 4,
then 5 matching commodities.

- Science 3 — Aqueduct: after a non-seven roll on which the player receives no card, choose one
  available basic resource from the bank.
- Trade 3 — Trading House: trade identical commodities at 2:1.
- Politics 3 — Fortress: unlock paid Strong-to-Mighty upgrades.

The first player to level 4 in a track claims that track's Metropolis on an eligible City. A later
player who strictly surpasses the controller—normally by reaching level 5—takes it. Ties retain the
current controller. Each Metropolis adds two VP, remains a City for production and barbarian
strength, and cannot be destroyed by barbarians.

## Progress Cards

When the Event die shows a family, the red die qualifies players by matching improvement level:

| Level | Red die |
| ----- | ------- |
| 0     | None    |
| 1     | 1–2     |
| 2     | 1–3     |
| 3     | 1–4     |
| 4     | 1–5     |
| 5     | 1–6     |

Draws proceed from the active player clockwise. A player normally holds four non-VP cards. The
active player may temporarily hold a fifth until turn end; a non-active player must privately return
a fifth card immediately. Revealed VP cards do not count. K+N cards may be played on the turn drawn,
and multiple cards may be played in one turn. Alchemist is the only pre-roll card; the others use the
action phase. A played card returns to the bottom of its family deck.

### Science deck — 18 cards

- Alchemist (2): choose both numeric dice; roll the Event die normally.
- Crane (2): reduce the next improvement cost this turn by one.
- Engineer (1): build a free Wall.
- Inventor (2): swap two eligible number tokens, excluding 2, 6, 8, and 12.
- Irrigation (2): gain two Grain per distinct adjacent Field.
- Medicine (2): upgrade a House for two Ore and one Grain.
- Mining (2): gain two Ore per distinct adjacent Mountain.
- Printer (1): reveal immediately for one permanent VP.
- Road Building (2): place up to two free legal Roads.
- Smith (2): upgrade up to two eligible Knights for free.

### Trade deck — 18 cards

- Commercial Harbor (2): offer one basic resource to each eligible opponent for a commodity of that
  opponent's choice.
- Master Merchant (2): choose a player with more VP and take up to two selected hand cards.
- Merchant Fleet (2): choose one resource or commodity for a 2:1 quote until turn end.
- Merchant (6): place or move the Merchant to a producing tile touching one of your buildings; gain
  one VP and its resource's 2:1 quote while you control it.
- Resource Monopoly (4): take up to two of one basic resource from every opponent.
- Commodity Monopoly (2): take up to one of one commodity from every opponent.

### Politics deck — 18 cards

- Bishop (2): move the unlocked robber and steal once from every eligible opponent on the tile.
- Constitution (1): reveal immediately for one permanent VP.
- Deserter (2): an opponent removes a chosen Knight; place the same available rank for free if legal.
- Diplomat (2): remove one open Road and optionally relocate it if it was yours.
- Intrigue (2): displace an opponent Knight touching one of your Roads.
- Saboteur (2): opponents at or above your score discard half their resource/commodity hand.
- Spy (3): privately inspect and steal one opponent non-VP Progress Card.
- Warlord (2): activate all your Knights for free without bypassing same-turn action timing.
- Wedding (2): each opponent with more VP privately gives you up to two hand cards.

Every multi-step effect is represented by a serializable pending interaction. The UI submits IDs;
the engine revalidates every choice before committing it. Cards can be cancelled only while their
effect still permits stopping.

## Privacy, scoring, and victory

K+N uses pass-device screens for turn handoffs, non-active Progress draws, fifth-card returns, Spy,
Master Merchant, Wedding, Commercial Harbor, Saboteur, City-loss choices, and displaced-Knight
relocation. Exact card identities are never written to the public activity log.

Scoring is House 1, City 2, Longest Road 2, each Defender point 1, Merchant control 1, Printer or
Constitution 1, and each Metropolis an additional 2. Largest Force is always zero. A player wins at
the configured target only on their own turn; reaching the target during another player's queued
resolution waits until that player's own turn and is checked again then.
