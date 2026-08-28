# Territory acceptance test

This is the one-session manual check for the release candidate. Automated tests cover exact card,
award, conservation, tie, stale-trade, and graph edge cases; this checklist concentrates on what a
person can verify best: flow, clarity, input, layout, and feedback.

## Start

1. Run `npm install` once, then `npm run dev`.
2. Open the local URL printed by Vite in a normal desktop browser.
3. In Settings, confirm the volume and motion controls respond.
4. Create a two-player Classic lobby. Note the seed, add two uniquely colored players, and start.
5. Confirm turn order was randomized at match creation and the title/layout remain inside their
   panels at your browser size.
6. Confirm the right rail is ordered **Game log → Bank → Players**, and the bottom dock is ordered
   **resources → divider → progress cards**. Above the six actions, verify the dice are clickable only
   while waiting to roll and the active-player strip has a timer on its right.
7. Confirm the six actions stay in this exact order: **Trade, Buy Progress card, Buy Road, Buy House,
   Buy City, End Turn**.

## Setup and visible turns

1. Confirm the named active player's resource and progress cards are immediately visible with no
   pass-device or reveal confirmation.
2. Complete the forward/reverse placement snake. Only gold corners/edges should be selectable, and
   each setup road must touch the house just placed.
3. On each player's second house, confirm adjacent producing terrain grants starting cards.
4. After the final road, confirm the first player in the displayed randomized order receives the
   first normal turn.

## Normal play

1. Click the two dice to roll several turns. Confirm the faces and numeric total agree, matching
   number tiles highlight, the robber tile produces nothing, and eligible houses/cities receive
   one/two cards.
2. Build two Roads in one build mode and confirm the mode stays open until the selected **Buy Road**
   button is clicked again or Escape is pressed.
3. Build a House and upgrade one to a City. Confirm costs, bank returns, piece supplies, board
   pieces, public VP, and recent-action messages all update together.
4. Open Trade and complete a 4:1 bank trade. If you own a port, verify the displayed 3:1 or matching
   2:1 rate. Make a player offer; confirm the recipient response opens immediately with exact terms,
   then test both rejection and acceptance.
5. When a seven occurs, verify every player above seven cards discards half rounded down, one player
   at a time without a reveal prompt. Click a destination tile once; the robber should move
   immediately. Confirm zero,
   one, and multiple-victim outcomes whenever those board situations occur.

## Timers and automatic actions

1. During setup, verify each House/City begins at **03:00** and each connected Road begins at
   **01:00**. Confirm the current instruction sits beside the timer.
2. Start another lobby with a non-default Turn time, then verify the roll/action clock uses that value
   and continues across rolling rather than restarting for the action phase.
3. With fewer than 20 seconds left, complete a build, purchase, trade, Knight action, improvement, or
   Progress Card resolution. Confirm the clock returns to **00:20**. An action above 20 seconds must
   not reduce it.
4. At ten seconds, verify the time flashes red and one tick sounds per second. Confirm Reduced motion
   and zero SFX volume retain usable visuals without unwanted sound.
5. In a disposable debug match, let each kind of clock expire. Setup must choose a legal piece, a
   waiting turn must roll, an action phase must end, a mandatory discard must return a valid half,
   and robber expiry must prefer an opponent-adjacent legal tile and finish any legal random steal.

## Progress cards and awards

1. Select **Buy Progress card** for 1 Grain, 1 Livestock, and 1 Ore. Confirm the card appears directly
   in the progress section of the bottom tray and is disabled until a later turn.
2. Verify any cards drawn during the match:
   - **Knight:** moves the robber with one tile click, steals normally, and increments Force.
   - **Road Building:** keeps the board in card resolution until up to two free connected Roads are placed.
   - **Year of Plenty:** requires exactly two bank-available cards and transfers them from the bank.
   - **Monopoly:** takes the chosen resource type from every opponent.
   - **Chapel, Library, Market, Palace, and University:** cannot be played and each silently
     contributes one hidden VP.
3. When a road reaches length five, confirm **Longest Road** appears with +2 VP. Branches must not
   count an edge twice, and an opponent House/City must break continuity at its corner.
4. After three played Knight cards, confirm **Largest Force** appears with +2 VP. A tied challenger
   must not take an incumbent's award; an unheld tie awards nobody.

## Victory, rematch, and resilience

1. At 10 authoritative VP, confirm normal controls freeze and the victory screen names the correct
   player with building, award, hidden victory-card, and total score breakdowns.
2. Choose **Rematch · new board**. Confirm the same lobby players remain, a new seed/board is created,
   order is rerandomized, and setup restarts cleanly.
3. From another completed match, verify **Return to lobby** preserves the player list and **Main
   menu** returns to the title screen.
4. During a match, click Lobby or Leave match and confirm the warning can cancel without losing the
   match. Confirm leaving only after accepting the warning.
5. Repeat setup at three and four players. Check the full snake order, all player panels, immediate
   hand changes, and responsive layout. On a narrow/mobile viewport, ensure the board, legal-target
   keyboard selector, hand, controls, modals, and player cards remain usable without horizontal page
   overflow.
6. Turn on Reduced motion and verify dice/card/resource/build animations become effectively instant.
   Set either volume slider to zero and verify gameplay remains silent and unaffected.

## K+N advanced mode

Use development controls or a prepared state for rare dice/card situations instead of waiting for
them naturally.

1. Start a four-player K+N lobby. Confirm the goal reads **13 points**, the sequence is House/Road
   forward then City/Road reverse, each setup City grants one basic card per producing neighbor and
   no commodity, and the original first player receives the first normal turn.
2. Confirm the HUD has red and regular numeric dice plus the Event die, a readable barbarian tracker,
   commodity cards, improvement tracks/costs, Knight strength, Wall/Metropolis/Merchant art, and
   family-colored Progress Cards with readable tooltips.
3. Produce beside a City on every terrain: Forest gives Wood + Paper, Pasture gives Livestock +
   Cloth, Mountain gives Ore + Coin, Hill gives two Brick, and Field gives two Grain. Verify a robber
   blocks both outputs and finite-bank shortages remain atomic.
4. Before the first barbarian attack, force a seven. Discards still occur, but robber movement,
   stealing, Knight chase, and Bishop must remain locked.
5. Build, activate, upgrade, move, and displace Knights. Check paid costs, rank/piece limits, same-turn
   action lockout, Fortress gating for Mighty rank, private displaced-Knight relocation, and that an
   opponent Knight breaks Longest Road until it moves away.
6. Add Walls and verify the safe hand limit is 7/9/11/13. Force a failed attack and confirm every
   lowest vulnerable contributor chooses a City loss, its Wall is destroyed, Metropolises remain
   immune, and an unavailable House piece creates a forced rebuild.
7. Force a successful barbarian defense with one unique top contributor and verify +1 permanent
   Defender VP. Repeat with tied top contributors and verify sequential family choices/draws instead.
   Every attack must reset the tracker, deactivate all Knights, and display its visual strength
   comparison.
8. Put the tracker one space from attack and force Event=barbarian with numeric total seven. Confirm
   the attack resolves first, unlocks the robber, and that same roll then performs normal robber play.
9. Raise Science, Trade, and Politics from level 0 through 5. Verify exact 1/2/3/4/5 commodity costs,
   the Aqueduct/Trading House/Fortress level-three abilities, level-four Metropolis claim, level-five
   transfer, incumbent retention on ties, visuals, and scoring.
10. Force Event-family draws at every improvement level/red-die boundary. Verify active-player
    clockwise order, same-turn play, immediate private off-turn fifth-card return, active-player
    discard by turn end, and automatic reveal/exclusion of Printer and Constitution.
11. Play every Science, Trade, and Politics card at least once, including a legal, illegal, cancel,
    and no-target path where relevant. Verify Monopoly-style and direct bank gains animate into the
    inventory, public logs name played choices but never reveal which card was drawn, and temporary
    Crane/Merchant Fleet effects expire at turn end.
12. Exercise every private flow—off-turn draw, fifth-card return, Spy, Master Merchant, Wedding,
    Commercial Harbor, Saboteur, barbarian City loss, and Knight relocation. The board must obscure
    before handoff, show only that player's required information, and obscure again on return.
13. Reach 13 points during someone else's turn and confirm the match continues. Begin that player's
    own settled action phase and confirm victory only if the score remains at least 13.

## Reporting a problem

Record the visible phase, active player, seed, action just taken, and expected/actual result. In a
development build, enable **Debug IDs** and use **Copy game state** when the issue is reproducible.
Include the seed and development-state snapshot when it helps reproduce the problem.
