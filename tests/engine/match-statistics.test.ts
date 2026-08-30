import { describe, expect, it } from 'vitest';

import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import type { GameEvent } from '../../src/engine/core/events';
import {
  accumulateMatchStatistics,
  createMatchStatistics,
} from '../../src/engine/core/match-statistics';
import { cardDefinitionId, cardInstanceId, edgeId, knightId } from '../../src/engine/core/ids';
import { projectGameState } from '../../src/multiplayer/projection';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

describe('match statistics', () => {
  it('records dice, resource flows, trades, theft, progress cards, and construction', () => {
    const state = createTestGameState('ACTION_PHASE');
    const events: readonly GameEvent[] = [
      { type: 'DICE_ROLLED', playerId: TEST_PLAYER_IDS[0], dice: [3, 4] },
      {
        type: 'RESOURCES_PRODUCED',
        source: 'DICE',
        rollTotal: 7,
        grants: {
          [TEST_PLAYER_IDS[0]]: resourceBundle([[RESOURCE_IDS.wood, 2]]),
          [TEST_PLAYER_IDS[1]]: resourceBundle([[RESOURCE_IDS.grain, 1]]),
        },
        unavailableResourceIds: [],
      },
      {
        type: 'TRADE_COMPLETED',
        tradeId: null,
        playerId: TEST_PLAYER_IDS[0],
        recipientId: null,
        offered: resourceBundle([[RESOURCE_IDS.wood, 4]]),
        requested: resourceBundle([[RESOURCE_IDS.ore, 1]]),
      },
      {
        type: 'RESOURCE_STOLEN',
        playerId: TEST_PLAYER_IDS[0],
        targetPlayerId: TEST_PLAYER_IDS[1],
        resourceId: RESOURCE_IDS.brick,
      },
      {
        type: 'RESOURCES_DISCARDED',
        playerId: TEST_PLAYER_IDS[1],
        resources: resourceBundle([[RESOURCE_IDS.grain, 1]]),
      },
      {
        type: 'PROGRESS_CARD_BOUGHT',
        playerId: TEST_PLAYER_IDS[0],
        cardInstanceId: cardInstanceId('stat-card'),
        cardDefinitionId: cardDefinitionId('stat-definition'),
      },
      {
        type: 'PROGRESS_CARD_PLAYED',
        playerId: TEST_PLAYER_IDS[0],
        cardInstanceId: cardInstanceId('stat-card'),
      },
      { type: 'ROAD_BUILT', playerId: TEST_PLAYER_IDS[0], edgeId: edgeId('stat-edge') },
      { type: 'LONGEST_ROAD_CHANGED', playerId: TEST_PLAYER_IDS[0] },
    ];

    const statistics = accumulateMatchStatistics(
      createMatchStatistics(TEST_PLAYER_IDS.slice(0, 2)),
      state,
      state,
      events,
    );
    const alex = statistics.players[TEST_PLAYER_IDS[0]]!;
    const sam = statistics.players[TEST_PLAYER_IDS[1]]!;

    expect(statistics.dice).toMatchObject({ rolls: 1, pips: 7, sevens: 1 });
    expect(statistics.dice.totals['7']).toBe(1);
    expect(alex.produced).toEqual({ [RESOURCE_IDS.wood]: 2 });
    expect(alex.tradedOut).toEqual({ [RESOURCE_IDS.wood]: 4 });
    expect(alex.tradedIn).toEqual({ [RESOURCE_IDS.ore]: 1 });
    expect(alex.stolen).toEqual({ [RESOURCE_IDS.brick]: 1 });
    expect(sam.stolenFrom).toEqual({ [RESOURCE_IDS.brick]: 1 });
    expect(sam.discarded).toEqual({ [RESOURCE_IDS.grain]: 1 });
    expect(alex).toMatchObject({
      bankTrades: 1,
      progressCardsDrawn: 1,
      progressCardsPlayed: 1,
      roadsBuilt: 1,
      longestRoadClaims: 1,
    });
  });

  it('reconciles K+N costs that do not emit a generic spending event', () => {
    const base = createTestGameState('ACTION_PHASE');
    const previous = {
      ...base,
      players: {
        ...base.players,
        [TEST_PLAYER_IDS[0]]: {
          ...base.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([
            [RESOURCE_IDS.ore, 1],
            [RESOURCE_IDS.livestock, 1],
          ]),
        },
      },
    };
    const next = {
      ...previous,
      players: {
        ...previous.players,
        [TEST_PLAYER_IDS[0]]: {
          ...previous.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([]),
        },
      },
    };
    const statistics = accumulateMatchStatistics(undefined, previous, next, [
      {
        type: 'KNIGHT_BUILT',
        playerId: TEST_PLAYER_IDS[0],
        knightId: knightId('stat-knight'),
        vertexId: 'stat-vertex' as never,
        level: 1,
      },
    ]);

    expect(statistics.players[TEST_PLAYER_IDS[0]]?.spent).toEqual({
      [RESOURCE_IDS.ore]: 1,
      [RESOURCE_IDS.livestock]: 1,
    });
  });

  it('keeps the report private during play and publishes it when the match ends', () => {
    const state = createTestGameState('ACTION_PHASE');
    const statistics = createMatchStatistics(TEST_PLAYER_IDS.slice(0, 2));
    const privateState = { ...state, statistics };

    expect(projectGameState(privateState, TEST_PLAYER_IDS[0]).statistics).toBeUndefined();
    expect(
      projectGameState(
        {
          ...privateState,
          winnerId: TEST_PLAYER_IDS[0],
          turn: { ...privateState.turn, phase: 'GAME_OVER' },
        },
        TEST_PLAYER_IDS[0],
      ).statistics,
    ).toEqual(statistics);
  });
});
