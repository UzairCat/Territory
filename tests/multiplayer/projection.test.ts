import { describe, expect, it } from 'vitest';

import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import type { GameEvent } from '../../src/engine/core/events';
import { cardDefinitionId, cardInstanceId } from '../../src/engine/core/ids';
import { createOnlineGameView, projectGameState } from '../../src/multiplayer/projection';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

describe('online player projection', () => {
  it('keeps the viewer hand while removing opponent hands, deck order, RNG, and seed', () => {
    const hiddenCardId = cardInstanceId('card-monopoly-1');
    const state = createTestGameState('ACTION_PHASE');
    const privateState = {
      ...state,
      config: { ...state.config, seed: 'do-not-send-this-seed' },
      players: {
        ...state.players,
        [TEST_PLAYER_IDS[0]]: {
          ...state.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 2]]),
        },
        [TEST_PLAYER_IDS[1]]: {
          ...state.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([
            [RESOURCE_IDS.wood, 3],
            [RESOURCE_IDS.ore, 2],
          ]),
          progressCardIds: [hiddenCardId],
        },
      },
      progressDeck: [hiddenCardId],
      progressCards: {
        [hiddenCardId]: {
          instanceId: hiddenCardId,
          definitionId: cardDefinitionId('monopoly'),
          ownerId: TEST_PLAYER_IDS[1],
          purchasedTurn: 0,
          playedTurn: null,
        },
      },
    };

    const firstView = projectGameState(privateState, TEST_PLAYER_IDS[0]);
    expect(firstView.players[TEST_PLAYER_IDS[0]]?.resources).toEqual({
      [RESOURCE_IDS.brick]: 2,
    });
    expect(firstView.players[TEST_PLAYER_IDS[1]]?.resources).toEqual({});
    expect(firstView.players[TEST_PLAYER_IDS[1]]?.progressCardIds).toEqual([]);
    expect(firstView.progressCards[hiddenCardId]).toBeUndefined();
    expect(firstView.progressDeck).toHaveLength(1);
    expect(firstView.progressDeck[0]).not.toContain('monopoly');
    expect(firstView.config.seed).toBe('server-redacted');
    expect(firstView.random).toMatchObject({ seed: 'server-redacted', value: 0, draws: 0 });

    const secondView = projectGameState(privateState, TEST_PLAYER_IDS[1]);
    expect(secondView.players[TEST_PLAYER_IDS[1]]?.resources).toEqual({
      [RESOURCE_IDS.wood]: 3,
      [RESOURCE_IDS.ore]: 2,
    });
    expect(secondView.progressCards[hiddenCardId]?.definitionId).toBe('monopoly');
  });

  it('publishes totals while redacting private card events from uninvolved players', () => {
    const state = createTestGameState('ACTION_PHASE');
    const events: readonly GameEvent[] = [
      {
        type: 'RESOURCE_STOLEN',
        playerId: TEST_PLAYER_IDS[0],
        targetPlayerId: TEST_PLAYER_IDS[1],
        resourceId: RESOURCE_IDS.ore,
      },
      {
        type: 'RESOURCES_DISCARDED',
        playerId: TEST_PLAYER_IDS[1],
        resources: resourceBundle([[RESOURCE_IDS.wood, 3]]),
      },
      {
        type: 'PROGRESS_CARD_BOUGHT',
        playerId: TEST_PLAYER_IDS[1],
        cardInstanceId: cardInstanceId('card-monopoly-1'),
        cardDefinitionId: cardDefinitionId('monopoly'),
      },
    ];

    const view = createOnlineGameView(
      state,
      TEST_PLAYER_IDS[0],
      4,
      events,
      events,
      false,
      false,
      1234,
      null,
    );
    expect(view.playerCards[TEST_PLAYER_IDS[1]]).toMatchObject({
      resourceCards: 1,
      progressCards: 0,
    });
    const discarded = view.recentEvents.find((event) => event.type === 'RESOURCES_DISCARDED');
    expect(discarded).toMatchObject({ resources: {}, hiddenCount: 3 });
    const bought = view.recentEvents.find((event) => event.type === 'PROGRESS_CARD_BOUGHT');
    expect(bought).toMatchObject({ cardDefinitionId: 'hidden-progress-card' });
    const stolen = view.recentEvents.find((event) => event.type === 'RESOURCE_STOLEN');
    expect(stolen).toMatchObject({ resourceId: RESOURCE_IDS.ore });
  });
});
