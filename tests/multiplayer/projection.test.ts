import { describe, expect, it } from 'vitest';

import { COMMODITY_IDS } from '../../src/engine/content/commodities';
import { KN_PROGRESS_CARDS } from '../../src/engine/content/kn-progress-cards';
import { PROGRESS_CARD_IDS } from '../../src/engine/content/progress-cards';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { createGame } from '../../src/engine/core/create-game';
import type { GameEvent } from '../../src/engine/core/events';
import type { GameState } from '../../src/engine/core/game-state';
import { cardDefinitionId, cardInstanceId } from '../../src/engine/core/ids';
import { createOnlineGameView, projectGameState } from '../../src/multiplayer/projection';
import { createTestGameState, createTestKNConfig, TEST_PLAYER_IDS } from '../helpers/game-state';

function createKNState(playerCount: 2 | 3 = 2): GameState {
  const created = createGame(createTestKNConfig(playerCount));
  if (!created.ok) throw new Error('K+N projection fixture did not initialize.');
  return created.state;
}

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

  it('reveals classic victory cards to every player when the game ends', () => {
    const hiddenCardId = cardInstanceId('card-final-chapel');
    const state = createTestGameState('ACTION_PHASE');
    const privateState: GameState = {
      ...state,
      players: {
        ...state.players,
        [TEST_PLAYER_IDS[1]]: {
          ...state.players[TEST_PLAYER_IDS[1]]!,
          progressCardIds: [hiddenCardId],
        },
      },
      progressCards: {
        [hiddenCardId]: {
          instanceId: hiddenCardId,
          definitionId: PROGRESS_CARD_IDS.chapel,
          ownerId: TEST_PLAYER_IDS[1],
          purchasedTurn: 1,
          playedTurn: null,
        },
      },
    };

    expect(projectGameState(privateState, TEST_PLAYER_IDS[0]).progressCards[hiddenCardId]).toBe(
      undefined,
    );

    const completedState: GameState = {
      ...privateState,
      winnerId: TEST_PLAYER_IDS[1],
      turn: { ...privateState.turn, phase: 'GAME_OVER' },
    };
    expect(
      projectGameState(completedState, TEST_PLAYER_IDS[0]).progressCards[hiddenCardId]
        ?.definitionId,
    ).toBe(PROGRESS_CARD_IDS.chapel);
  });

  it('publishes discard details while redacting genuinely private card events', () => {
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
    expect(discarded).toMatchObject({ resources: { [RESOURCE_IDS.wood]: 3 } });
    const bought = view.recentEvents.find((event) => event.type === 'PROGRESS_CARD_BOUGHT');
    expect(bought).toMatchObject({ cardDefinitionId: 'hidden-progress-card' });
    const stolen = view.recentEvents.find((event) => event.type === 'RESOURCE_STOLEN');
    expect(stolen).toMatchObject({ resourceId: RESOURCE_IDS.ore });
    expect(view.serverTimeMs).toEqual(expect.any(Number));
  });

  it('reveals a Master Merchant target hand only to the player making the selection', () => {
    const original = createKNState(3);
    const actorId = TEST_PLAYER_IDS[0];
    const targetId = TEST_PLAYER_IDS[1];
    const observerId = TEST_PLAYER_IDS[2];
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [targetId]: {
          ...original.players[targetId]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 2]]),
          commodities: resourceBundle([[COMMODITY_IDS.paper, 1]]),
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION', activePlayerId: actorId },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: actorId,
        purpose: 'MASTER_MERCHANT_CARDS',
        eligibleIds: [RESOURCE_IDS.brick, COMMODITY_IDS.paper],
        minimumSelections: 2,
        maximumSelections: 2,
        queue: [actorId],
        canCancel: false,
        context: { targetPlayerId: targetId, activePlayerId: actorId },
      },
    };

    const actorView = projectGameState(state, actorId);
    expect(actorView.players[targetId]).toMatchObject({
      resources: { [RESOURCE_IDS.brick]: 2 },
      commodities: { [COMMODITY_IDS.paper]: 1 },
      progressCardIds: [],
      knProgressCardIds: [],
    });
    const observerView = projectGameState(state, observerId);
    expect(observerView.players[targetId]?.resources).toEqual({});
    expect(observerView.players[targetId]?.commodities).toEqual({});
    expect(observerView.pendingInteraction).toMatchObject({ eligibleIds: [], context: {} });

    const definition = KN_PROGRESS_CARDS.find((card) => card.effect === 'MASTER_MERCHANT');
    if (definition === undefined) throw new Error('Master Merchant definition is missing.');
    const resolvedEvent: GameEvent = {
      type: 'KN_PROGRESS_CARD_RESOLVED',
      playerId: actorId,
      cardInstanceId: cardInstanceId('resolved-master-merchant'),
      cardDefinitionId: definition.id,
      resources: resourceBundle([[RESOURCE_IDS.brick, 2]]),
      targetIds: [targetId],
    };
    const targetView = createOnlineGameView(
      state,
      targetId,
      3,
      [resolvedEvent],
      [resolvedEvent],
      false,
      false,
      null,
      null,
    );
    expect(targetView.recentEvents[0]).toMatchObject({
      resources: { [RESOURCE_IDS.brick]: 2 },
      targetIds: [targetId],
    });
    const hiddenObserverView = createOnlineGameView(
      state,
      observerId,
      3,
      [resolvedEvent],
      [resolvedEvent],
      false,
      false,
      null,
      null,
    );
    expect(hiddenObserverView.recentEvents[0]).toMatchObject({ resources: {}, targetIds: [] });
  });

  it('projects a simultaneous reward as each queued viewer’s own private choice', () => {
    const original = createKNState(3);
    const firstId = TEST_PLAYER_IDS[0];
    const secondId = TEST_PLAYER_IDS[1];
    const observerId = TEST_PLAYER_IDS[2];
    const state: GameState = {
      ...original,
      turn: { ...original.turn, phase: 'CARD_RESOLUTION', activePlayerId: firstId },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: firstId,
        purpose: 'AQUEDUCT_RESOURCE',
        eligibleIds: [RESOURCE_IDS.wood, RESOURCE_IDS.ore],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [firstId, secondId],
        simultaneous: true,
        canCancel: false,
        context: { pendingProgressDiscardIds: [firstId] },
      },
    };

    expect(projectGameState(state, firstId).pendingInteraction).toMatchObject({
      playerId: firstId,
      eligibleIds: [RESOURCE_IDS.wood, RESOURCE_IDS.ore],
      context: {},
    });
    expect(projectGameState(state, secondId).pendingInteraction).toMatchObject({
      playerId: secondId,
      eligibleIds: [RESOURCE_IDS.wood, RESOURCE_IDS.ore],
      context: {},
    });
    expect(projectGameState(state, observerId).pendingInteraction).toMatchObject({
      playerId: firstId,
      eligibleIds: [],
      context: {},
    });
  });

  it('lets a Spy victim see the stolen card movement without revealing it to observers', () => {
    const original = createKNState(3);
    if (original.kn === null) throw new Error('Spy projection fixture has no K+N state.');
    const actorId = TEST_PLAYER_IDS[0];
    const victimId = TEST_PLAYER_IDS[1];
    const observerId = TEST_PLAYER_IDS[2];
    const spyDefinition = KN_PROGRESS_CARDS.find((card) => card.effect === 'SPY');
    const stolenCard = Object.values(original.kn.progressCards).find(
      (card) => card.definitionId !== spyDefinition?.id,
    );
    if (spyDefinition === undefined || stolenCard === undefined) {
      throw new Error('Spy projection cards are missing.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [actorId]: {
          ...original.players[actorId]!,
          knProgressCardIds: [stolenCard.instanceId],
        },
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [stolenCard.instanceId]: { ...stolenCard, ownerId: actorId },
        },
      },
    };
    const event: GameEvent = {
      type: 'KN_PROGRESS_CARD_RESOLVED',
      playerId: actorId,
      cardInstanceId: cardInstanceId('resolved-spy'),
      cardDefinitionId: spyDefinition.id,
      targetIds: [victimId, stolenCard.instanceId],
    };

    const victimView = createOnlineGameView(
      state,
      victimId,
      2,
      [event],
      [event],
      false,
      false,
      null,
      null,
    );
    expect(victimView.recentEvents[0]).toMatchObject({
      targetIds: [victimId, stolenCard.instanceId],
    });
    expect(victimView.state.kn?.progressCards[stolenCard.instanceId]?.definitionId).toBe(
      stolenCard.definitionId,
    );

    const observerView = createOnlineGameView(
      state,
      observerId,
      2,
      [event],
      [event],
      false,
      false,
      null,
      null,
    );
    expect(observerView.recentEvents[0]).toMatchObject({ targetIds: [victimId] });
    expect(observerView.state.kn?.progressCards[stolenCard.instanceId]).toBeUndefined();
  });
});
