import { describe, expect, it } from 'vitest';

import { PROGRESS_CARD_IDS } from '../../src/engine/content/progress-cards';
import { RESOURCE_IDS, TERRAIN_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GameState } from '../../src/engine/core/game-state';
import { actionId, cardInstanceId, edgeId, hexId, vertexId } from '../../src/engine/core/ids';
import type { CardDefinitionId, CardInstanceId } from '../../src/engine/core/ids';
import { isJsonSerializable } from '../../src/engine/core/json';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

const CARD_ONE = cardInstanceId('owned-card-one');
const CARD_TWO = cardInstanceId('owned-card-two');
const VERTEX_A = vertexId('card-road-a');
const VERTEX_B = vertexId('card-road-b');
const VERTEX_C = vertexId('card-road-c');
const EDGE_AB = edgeId('card-road-ab');
const EDGE_BC = edgeId('card-road-bc');
const ROBBER_HEX = hexId('card-robber-current');
const ROBBER_TARGET = hexId('card-robber-target');

function actionState(): GameState {
  const state = createTestGameState('ACTION_PHASE');
  return {
    ...state,
    turn: { ...state.turn, turnNumber: 3, dice: [2, 3] },
  };
}

function addOwnedCard(
  state: GameState,
  definitionId: CardDefinitionId,
  instanceId: CardInstanceId = CARD_ONE,
  purchasedTurn = 2,
): GameState {
  const player = state.players[TEST_PLAYER_IDS[0]]!;
  return {
    ...state,
    players: {
      ...state.players,
      [player.id]: {
        ...player,
        progressCardIds: [...player.progressCardIds, instanceId],
      },
    },
    progressCards: {
      ...state.progressCards,
      [instanceId]: {
        instanceId,
        definitionId,
        ownerId: player.id,
        purchasedTurn,
        playedTurn: null,
      },
    },
  };
}

function roadworksState(): GameState {
  const state = addOwnedCard(actionState(), PROGRESS_CARD_IDS.roadBuilding);
  return {
    ...state,
    board: {
      ...state.board,
      vertices: {
        [VERTEX_A]: {
          id: VERTEX_A,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_AB],
          adjacentVertexIds: [VERTEX_B],
          building: { ownerId: TEST_PLAYER_IDS[0], type: 'HOUSE' },
          portId: null,
        },
        [VERTEX_B]: {
          id: VERTEX_B,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_AB, EDGE_BC],
          adjacentVertexIds: [VERTEX_A, VERTEX_C],
          building: null,
          portId: null,
        },
        [VERTEX_C]: {
          id: VERTEX_C,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_BC],
          adjacentVertexIds: [VERTEX_B],
          building: null,
          portId: null,
        },
      },
      edges: {
        [EDGE_AB]: {
          id: EDGE_AB,
          vertexAId: VERTEX_A,
          vertexBId: VERTEX_B,
          adjacentHexIds: [],
          roadOwnerId: null,
          portId: null,
        },
        [EDGE_BC]: {
          id: EDGE_BC,
          vertexAId: VERTEX_B,
          vertexBId: VERTEX_C,
          adjacentHexIds: [],
          roadOwnerId: null,
          portId: null,
        },
      },
    },
  };
}

describe('progress card rules', () => {
  it('purchases the deterministic top card and records private purchase metadata', () => {
    const original = actionState();
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([
            [RESOURCE_IDS.grain, 1],
            [RESOURCE_IDS.livestock, 1],
            [RESOURCE_IDS.ore, 1],
          ]),
        },
      },
      progressDeck: [CARD_ONE],
      progressCards: {
        [CARD_ONE]: {
          instanceId: CARD_ONE,
          definitionId: PROGRESS_CARD_IDS.yearOfPlenty,
          ownerId: null,
          purchasedTurn: null,
          playedTurn: null,
        },
      },
    };
    const snapshot = structuredClone(state);
    const result = dispatch(state, {
      id: actionId('buy-progress-card'),
      type: 'BUY_PROGRESS_CARD',
      actorId: TEST_PLAYER_IDS[0],
    });

    expect(result.ok).toBe(true);
    expect(state).toEqual(snapshot);
    if (!result.ok) return;
    expect(result.state.progressDeck).toEqual([]);
    expect(result.state.progressCards[CARD_ONE]).toMatchObject({
      ownerId: TEST_PLAYER_IDS[0],
      purchasedTurn: 3,
    });
    expect(result.state.players[TEST_PLAYER_IDS[0]]?.progressCardIds).toEqual([CARD_ONE]);
    expect(result.state.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      grain: 0,
      livestock: 0,
      ore: 0,
    });
    expect(result.state.bank).toMatchObject({ grain: 20, livestock: 20, ore: 20 });
    expect(result.events.map((event) => event.type)).toEqual([
      'RESOURCES_SPENT',
      'PROGRESS_CARD_BOUGHT',
    ]);
    expect(isJsonSerializable(result.state)).toBe(true);
  });

  it('rejects an empty deck, insufficient resources, and same-turn play without mutation', () => {
    const emptyState = actionState();
    const empty = dispatch(emptyState, {
      id: actionId('empty-deck'),
      type: 'BUY_PROGRESS_CARD',
      actorId: TEST_PLAYER_IDS[0],
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe('DECK_EMPTY');

    const deckState: GameState = {
      ...emptyState,
      progressDeck: [CARD_ONE],
      progressCards: {
        [CARD_ONE]: {
          instanceId: CARD_ONE,
          definitionId: PROGRESS_CARD_IDS.knight,
          ownerId: null,
          purchasedTurn: null,
          playedTurn: null,
        },
      },
    };
    const unaffordable = dispatch(deckState, {
      id: actionId('cannot-buy'),
      type: 'BUY_PROGRESS_CARD',
      actorId: TEST_PLAYER_IDS[0],
    });
    expect(unaffordable.ok).toBe(false);
    if (!unaffordable.ok) expect(unaffordable.error.code).toBe('INSUFFICIENT_RESOURCES');

    const sameTurn = addOwnedCard(actionState(), PROGRESS_CARD_IDS.yearOfPlenty, CARD_ONE, 3);
    const play = dispatch(sameTurn, {
      id: actionId('same-turn-play'),
      type: 'PLAY_PROGRESS_CARD',
      actorId: TEST_PLAYER_IDS[0],
      cardInstanceId: CARD_ONE,
    });
    expect(play.ok).toBe(false);
    expect(play.state).toBe(sameTurn);
    if (!play.ok) expect(play.error.code).toBe('CARD_BOUGHT_THIS_TURN');
  });

  it('does not consume cards whose required effect target is unavailable', () => {
    const base = actionState();
    const cases = [
      addOwnedCard(base, PROGRESS_CARD_IDS.knight),
      addOwnedCard(base, PROGRESS_CARD_IDS.roadBuilding),
      addOwnedCard(
        { ...base, bank: resourceBundle([[RESOURCE_IDS.wood, 1]]) },
        PROGRESS_CARD_IDS.yearOfPlenty,
      ),
      addOwnedCard(
        {
          ...base,
          players: {
            ...base.players,
            [TEST_PLAYER_IDS[1]]: {
              ...base.players[TEST_PLAYER_IDS[1]]!,
              resources: resourceBundle([]),
            },
          },
        },
        PROGRESS_CARD_IDS.monopoly,
      ),
      addOwnedCard(base, PROGRESS_CARD_IDS.chapel),
    ];

    for (const [index, state] of cases.entries()) {
      const result = dispatch(state, {
        id: actionId(`unavailable-card-target-${index}`),
        type: 'PLAY_PROGRESS_CARD',
        actorId: TEST_PLAYER_IDS[0],
        cardInstanceId: CARD_ONE,
      });
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      if (!result.ok) expect(result.error.code).toBe('CARD_TARGET_UNAVAILABLE');
    }
  });

  it('reuses robber movement for Knight and enforces the one-card turn limit', () => {
    const withKnight = addOwnedCard(actionState(), PROGRESS_CARD_IDS.knight);
    const state: GameState = {
      ...addOwnedCard(withKnight, PROGRESS_CARD_IDS.monopoly, CARD_TWO),
      board: {
        ...withKnight.board,
        hexes: {
          [ROBBER_HEX]: {
            id: ROBBER_HEX,
            q: 0,
            r: 0,
            terrainId: TERRAIN_IDS.wasteland,
            resourceId: null,
            numberToken: null,
            vertexIds: [],
            edgeIds: [],
          },
          [ROBBER_TARGET]: {
            id: ROBBER_TARGET,
            q: 1,
            r: 0,
            terrainId: TERRAIN_IDS.forest,
            resourceId: RESOURCE_IDS.wood,
            numberToken: 5,
            vertexIds: [],
            edgeIds: [],
          },
        },
        robberHexId: ROBBER_HEX,
      },
    };
    const played = dispatch(state, {
      id: actionId('play-guard'),
      type: 'PLAY_PROGRESS_CARD',
      actorId: TEST_PLAYER_IDS[0],
      cardInstanceId: CARD_ONE,
    });

    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.turn.phase).toBe('MOVE_ROBBER');
    expect(played.state.pendingInteraction).toEqual({
      type: 'MOVE_ROBBER',
      playerId: TEST_PLAYER_IDS[0],
      sourceCardId: CARD_ONE,
    });
    expect(played.state.players[TEST_PLAYER_IDS[0]]).toMatchObject({ playedForceCards: 1 });
    expect(played.state.progressDiscard).toEqual([CARD_ONE]);

    const moved = dispatch(played.state, {
      id: actionId('guard-move'),
      type: 'MOVE_ROBBER',
      actorId: TEST_PLAYER_IDS[0],
      hexId: ROBBER_TARGET,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.state.turn.phase).toBe('ACTION_PHASE');
    expect(moved.events.map((event) => event.type)).toEqual([
      'ROBBER_MOVED',
      'PROGRESS_CARD_RESOLVED',
    ]);

    const secondPlay = dispatch(moved.state, {
      id: actionId('second-card'),
      type: 'PLAY_PROGRESS_CARD',
      actorId: TEST_PLAYER_IDS[0],
      cardInstanceId: CARD_TWO,
    });
    expect(secondPlay.ok).toBe(false);
    if (!secondPlay.ok) expect(secondPlay.error.code).toBe('CARD_PLAY_LIMIT_REACHED');
  });

  it('places two connected Road Building roads without spending resources', () => {
    const state = roadworksState();
    const resources = state.players[TEST_PLAYER_IDS[0]]?.resources;
    const played = dispatch(state, {
      id: actionId('play-roadworks'),
      type: 'PLAY_PROGRESS_CARD',
      actorId: TEST_PLAYER_IDS[0],
      cardInstanceId: CARD_ONE,
    });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.pendingInteraction).toMatchObject({
      type: 'PLACE_FREE_ROADS',
      remainingPlacements: 2,
    });

    const first = dispatch(played.state, {
      id: actionId('free-road-one'),
      type: 'BUILD_ROAD',
      actorId: TEST_PLAYER_IDS[0],
      edgeId: EDGE_AB,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.turn.phase).toBe('CARD_RESOLUTION');
    expect(first.state.pendingInteraction).toMatchObject({ remainingPlacements: 1 });

    const second = dispatch(first.state, {
      id: actionId('free-road-two'),
      type: 'BUILD_ROAD',
      actorId: TEST_PLAYER_IDS[0],
      edgeId: EDGE_BC,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.turn.phase).toBe('ACTION_PHASE');
    expect(second.state.pendingInteraction).toBeNull();
    expect(second.state.board.edges[EDGE_AB]?.roadOwnerId).toBe(TEST_PLAYER_IDS[0]);
    expect(second.state.board.edges[EDGE_BC]?.roadOwnerId).toBe(TEST_PLAYER_IDS[0]);
    expect(second.state.players[TEST_PLAYER_IDS[0]]?.resources).toEqual(resources);
    expect(second.events.map((event) => event.type)).toEqual([
      'ROAD_BUILT',
      'PROGRESS_CARD_RESOLVED',
    ]);
  });

  it('takes exactly two bank cards with Year of Plenty and rejects unavailable selections', () => {
    const state = addOwnedCard(actionState(), PROGRESS_CARD_IDS.yearOfPlenty);
    const played = dispatch(state, {
      id: actionId('play-plenty'),
      type: 'PLAY_PROGRESS_CARD',
      actorId: TEST_PLAYER_IDS[0],
      cardInstanceId: CARD_ONE,
    });
    expect(played.ok).toBe(true);
    if (!played.ok) return;

    const invalid = dispatch(played.state, {
      id: actionId('plenty-invalid'),
      type: 'SELECT_CARD_RESOURCES',
      actorId: TEST_PLAYER_IDS[0],
      cardInstanceId: CARD_ONE,
      resources: resourceBundle([[RESOURCE_IDS.ore, 1]]),
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.state).toBe(played.state);

    const resolved = dispatch(played.state, {
      id: actionId('plenty-resolve'),
      type: 'SELECT_CARD_RESOURCES',
      actorId: TEST_PLAYER_IDS[0],
      cardInstanceId: CARD_ONE,
      resources: resourceBundle([
        [RESOURCE_IDS.wood, 1],
        [RESOURCE_IDS.ore, 1],
      ]),
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 1,
      ore: 1,
    });
    expect(resolved.state.bank).toMatchObject({ wood: 18, ore: 18 });
    expect(resolved.state.pendingInteraction).toBeNull();
    expect(resolved.events[0]).toMatchObject({
      type: 'PROGRESS_CARD_RESOLVED',
      resources: { wood: 1, ore: 1 },
    });
  });

  it('collects the chosen resource from every opponent with Monopoly', () => {
    const original = addOwnedCard(actionState(), PROGRESS_CARD_IDS.monopoly);
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([[RESOURCE_IDS.grain, 1]]),
        },
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([
            [RESOURCE_IDS.grain, 4],
            [RESOURCE_IDS.wood, 1],
          ]),
        },
      },
    };
    const played = dispatch(state, {
      id: actionId('play-monopoly'),
      type: 'PLAY_PROGRESS_CARD',
      actorId: TEST_PLAYER_IDS[0],
      cardInstanceId: CARD_ONE,
    });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const resolved = dispatch(played.state, {
      id: actionId('resolve-monopoly'),
      type: 'SELECT_CARD_RESOURCE_TYPE',
      actorId: TEST_PLAYER_IDS[0],
      cardInstanceId: CARD_ONE,
      resourceId: RESOURCE_IDS.grain,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({ grain: 5 });
    expect(resolved.state.players[TEST_PLAYER_IDS[1]]?.resources).toMatchObject({
      grain: 0,
      wood: 1,
    });
    expect(resolved.events[0]).toMatchObject({
      type: 'PROGRESS_CARD_RESOLVED',
      amount: 4,
      resourceId: RESOURCE_IDS.grain,
    });
  });

  it('scores a purchased victory card passively and ends the game at the configured target', () => {
    const original = actionState();
    const state: GameState = {
      ...original,
      config: { ...original.config, victoryTarget: 1 },
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([
            [RESOURCE_IDS.grain, 1],
            [RESOURCE_IDS.livestock, 1],
            [RESOURCE_IDS.ore, 1],
          ]),
        },
      },
      progressDeck: [CARD_ONE],
      progressCards: {
        [CARD_ONE]: {
          instanceId: CARD_ONE,
          definitionId: PROGRESS_CARD_IDS.chapel,
          ownerId: null,
          purchasedTurn: null,
          playedTurn: null,
        },
      },
    };
    const result = dispatch(state, {
      id: actionId('buy-winning-charter'),
      type: 'BUY_PROGRESS_CARD',
      actorId: TEST_PLAYER_IDS[0],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.winnerId).toBe(TEST_PLAYER_IDS[0]);
    expect(result.state.turn.phase).toBe('GAME_OVER');
    expect(result.events).toContainEqual({
      type: 'GAME_WON',
      playerId: TEST_PLAYER_IDS[0],
      score: 1,
    });

    const passivePlay = dispatch(
      {
        ...result.state,
        winnerId: null,
        turn: {
          ...result.state.turn,
          phase: 'ACTION_PHASE',
          turnNumber: result.state.turn.turnNumber + 1,
          cardIdsBoughtThisTurn: [],
        },
      },
      {
        id: actionId('play-passive-card'),
        type: 'PLAY_PROGRESS_CARD',
        actorId: TEST_PLAYER_IDS[0],
        cardInstanceId: CARD_ONE,
      },
    );
    expect(passivePlay.ok).toBe(false);
    if (!passivePlay.ok) expect(passivePlay.error.code).toBe('CARD_TARGET_UNAVAILABLE');
  });
});
