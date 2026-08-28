import { describe, expect, it } from 'vitest';

import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import type { ResourceBundle } from '../../src/engine/content/types';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GameState } from '../../src/engine/core/game-state';
import { actionId, edgeId, portId, tradeId, vertexId } from '../../src/engine/core/ids';
import { isJsonSerializable } from '../../src/engine/core/json';
import { getBankTradeRatio } from '../../src/engine/rules/trade-rules';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

function tradeState(): GameState {
  const original = createTestGameState('ACTION_PHASE');
  return {
    ...original,
    players: {
      ...original.players,
      [TEST_PLAYER_IDS[0]]: {
        ...original.players[TEST_PLAYER_IDS[0]]!,
        resources: resourceBundle([
          [RESOURCE_IDS.wood, 6],
          [RESOURCE_IDS.grain, 1],
        ]),
      },
      [TEST_PLAYER_IDS[1]]: {
        ...original.players[TEST_PLAYER_IDS[1]]!,
        resources: resourceBundle([
          [RESOURCE_IDS.brick, 3],
          [RESOURCE_IDS.ore, 1],
        ]),
      },
    },
    turn: { ...original.turn, dice: [2, 3] },
  };
}

function stateWithOwnedPorts(): GameState {
  const state = tradeState();
  const genericPortId = portId('trade-generic-port');
  const woodPortId = portId('trade-wood-port');
  const genericVertex = vertexId('trade-generic-vertex');
  const genericOtherVertex = vertexId('trade-generic-other-vertex');
  const woodVertex = vertexId('trade-wood-vertex');
  const woodOtherVertex = vertexId('trade-wood-other-vertex');

  return {
    ...state,
    board: {
      ...state.board,
      vertices: {
        [genericVertex]: {
          id: genericVertex,
          adjacentHexIds: [],
          connectedEdgeIds: [],
          adjacentVertexIds: [],
          building: { ownerId: TEST_PLAYER_IDS[0], type: 'HOUSE' },
          portId: genericPortId,
        },
        [genericOtherVertex]: {
          id: genericOtherVertex,
          adjacentHexIds: [],
          connectedEdgeIds: [],
          adjacentVertexIds: [],
          building: null,
          portId: genericPortId,
        },
        [woodVertex]: {
          id: woodVertex,
          adjacentHexIds: [],
          connectedEdgeIds: [],
          adjacentVertexIds: [],
          building: { ownerId: TEST_PLAYER_IDS[0], type: 'MANSION' },
          portId: woodPortId,
        },
        [woodOtherVertex]: {
          id: woodOtherVertex,
          adjacentHexIds: [],
          connectedEdgeIds: [],
          adjacentVertexIds: [],
          building: null,
          portId: woodPortId,
        },
      },
      ports: {
        [genericPortId]: {
          id: genericPortId,
          edgeId: edgeId('trade-generic-edge'),
          vertexIds: [genericVertex, genericOtherVertex],
          tradeRatio: 3,
          resourceId: null,
        },
        [woodPortId]: {
          id: woodPortId,
          edgeId: edgeId('trade-wood-edge'),
          vertexIds: [woodVertex, woodOtherVertex],
          tradeRatio: 2,
          resourceId: RESOURCE_IDS.wood,
        },
      },
    },
  };
}

function createOffer(state: GameState, id = tradeId('trade-offer')) {
  return dispatch(state, {
    id: actionId(`create-${id}`),
    type: 'CREATE_TRADE',
    actorId: TEST_PLAYER_IDS[0],
    tradeId: id,
    recipientId: TEST_PLAYER_IDS[1],
    offered: resourceBundle([[RESOURCE_IDS.wood, 2]]),
    requested: resourceBundle([[RESOURCE_IDS.brick, 1]]),
  });
}

describe('trading rules', () => {
  it('completes a default 4:1 bank trade atomically', () => {
    const state = tradeState();
    const result = dispatch(state, {
      id: actionId('bank-trade-default'),
      type: 'BANK_TRADE',
      actorId: TEST_PLAYER_IDS[0],
      giveResourceId: RESOURCE_IDS.wood,
      receiveResourceId: RESOURCE_IDS.livestock,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 2,
      livestock: 1,
    });
    expect(result.state.bank).toMatchObject({ wood: 23, livestock: 18 });
    expect(result.events).toEqual([
      {
        type: 'TRADE_COMPLETED',
        tradeId: null,
        playerId: TEST_PLAYER_IDS[0],
        recipientId: null,
        offered: resourceBundle([[RESOURCE_IDS.wood, 4]]),
        requested: resourceBundle([[RESOURCE_IDS.livestock, 1]]),
      },
    ]);
    expect(isJsonSerializable(result.state)).toBe(true);
  });

  it('uses the best owned generic or resource-specific port ratio', () => {
    const state = stateWithOwnedPorts();

    expect(getBankTradeRatio(state, TEST_PLAYER_IDS[0], RESOURCE_IDS.wood)).toBe(2);
    expect(getBankTradeRatio(state, TEST_PLAYER_IDS[0], RESOURCE_IDS.brick)).toBe(3);
    expect(getBankTradeRatio(state, TEST_PLAYER_IDS[1], RESOURCE_IDS.wood)).toBe(4);

    const result = dispatch(state, {
      id: actionId('bank-trade-port'),
      type: 'BANK_TRADE',
      actorId: TEST_PLAYER_IDS[0],
      giveResourceId: RESOURCE_IDS.wood,
      receiveResourceId: RESOURCE_IDS.ore,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({ wood: 4, ore: 1 });
    expect(result.state.bank).toMatchObject({ wood: 21, ore: 18 });
  });

  it('rejects illegal bank trades without changing state', () => {
    const base = tradeState();
    const cases: readonly [GameState, Parameters<typeof dispatch>[1], string][] = [
      [
        base,
        {
          id: actionId('bank-wrong-player'),
          type: 'BANK_TRADE',
          actorId: TEST_PLAYER_IDS[1],
          giveResourceId: RESOURCE_IDS.brick,
          receiveResourceId: RESOURCE_IDS.wood,
        },
        'NOT_YOUR_TURN',
      ],
      [
        { ...base, turn: { ...base.turn, phase: 'WAITING_FOR_ROLL' } },
        {
          id: actionId('bank-wrong-phase'),
          type: 'BANK_TRADE',
          actorId: TEST_PLAYER_IDS[0],
          giveResourceId: RESOURCE_IDS.wood,
          receiveResourceId: RESOURCE_IDS.brick,
        },
        'WRONG_PHASE',
      ],
      [
        base,
        {
          id: actionId('bank-same-resource'),
          type: 'BANK_TRADE',
          actorId: TEST_PLAYER_IDS[0],
          giveResourceId: RESOURCE_IDS.wood,
          receiveResourceId: RESOURCE_IDS.wood,
        },
        'INVALID_TRADE',
      ],
      [
        {
          ...base,
          players: {
            ...base.players,
            [TEST_PLAYER_IDS[0]]: {
              ...base.players[TEST_PLAYER_IDS[0]]!,
              resources: resourceBundle([[RESOURCE_IDS.wood, 3]]),
            },
          },
        },
        {
          id: actionId('bank-cannot-afford'),
          type: 'BANK_TRADE',
          actorId: TEST_PLAYER_IDS[0],
          giveResourceId: RESOURCE_IDS.wood,
          receiveResourceId: RESOURCE_IDS.brick,
        },
        'INSUFFICIENT_RESOURCES',
      ],
      [
        {
          ...base,
          bank: resourceBundle([[RESOURCE_IDS.wood, 19]]),
        },
        {
          id: actionId('bank-empty-resource'),
          type: 'BANK_TRADE',
          actorId: TEST_PLAYER_IDS[0],
          giveResourceId: RESOURCE_IDS.wood,
          receiveResourceId: RESOURCE_IDS.brick,
        },
        'INSUFFICIENT_BANK_RESOURCES',
      ],
    ];

    for (const [state, action, code] of cases) {
      const result = dispatch(state, action);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      if (!result.ok) expect(result.error.code).toBe(code);
    }
  });

  it('records an exact player offer without moving cards, then accepts it atomically', () => {
    const state = tradeState();
    const created = createOffer(state);

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.state.players).toBe(state.players);
    expect(created.state.tradeOffers[tradeId('trade-offer')]).toEqual({
      id: tradeId('trade-offer'),
      fromPlayerId: TEST_PLAYER_IDS[0],
      recipientId: TEST_PLAYER_IDS[1],
      offered: resourceBundle([[RESOURCE_IDS.wood, 2]]),
      requested: resourceBundle([[RESOURCE_IDS.brick, 1]]),
      status: 'OPEN',
      createdTurn: state.turn.turnNumber,
      acceptedByPlayerId: null,
    });
    expect(created.state.pendingInteraction).toEqual({
      type: 'TRADE_RESPONSE',
      tradeId: tradeId('trade-offer'),
      playerId: TEST_PLAYER_IDS[1],
    });

    const blockedBankTrade = dispatch(created.state, {
      id: actionId('bank-trade-during-offer'),
      type: 'BANK_TRADE',
      actorId: TEST_PLAYER_IDS[0],
      giveResourceId: RESOURCE_IDS.wood,
      receiveResourceId: RESOURCE_IDS.grain,
    });
    expect(blockedBankTrade.ok).toBe(false);
    if (!blockedBankTrade.ok) {
      expect(blockedBankTrade.error.code).toBe('PENDING_INTERACTION_REQUIRED');
    }

    const wrongResponder = dispatch(created.state, {
      id: actionId('wrong-trade-responder'),
      type: 'RESPOND_TO_TRADE',
      actorId: TEST_PLAYER_IDS[0],
      tradeId: tradeId('trade-offer'),
      accepted: true,
    });
    expect(wrongResponder.ok).toBe(false);
    if (!wrongResponder.ok) {
      expect(wrongResponder.error.code).toBe('PENDING_INTERACTION_REQUIRED');
    }

    const accepted = dispatch(created.state, {
      id: actionId('accept-trade'),
      type: 'RESPOND_TO_TRADE',
      actorId: TEST_PLAYER_IDS[1],
      tradeId: tradeId('trade-offer'),
      accepted: true,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.state.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 4,
      brick: 1,
    });
    expect(accepted.state.players[TEST_PLAYER_IDS[1]]?.resources).toMatchObject({
      wood: 2,
      brick: 2,
    });
    expect(accepted.state.tradeOffers[tradeId('trade-offer')]).toMatchObject({
      status: 'ACCEPTED',
      acceptedByPlayerId: TEST_PLAYER_IDS[1],
    });
    expect(accepted.state.pendingInteraction).toBeNull();
    expect(accepted.events.map((event) => event.type)).toEqual(['TRADE_COMPLETED']);
    expect(isJsonSerializable(accepted.state)).toBe(true);
  });

  it('lets the intended opponent reject an offer without transferring resources', () => {
    const state = tradeState();
    const created = createOffer(state, tradeId('rejected-offer'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const rejected = dispatch(created.state, {
      id: actionId('reject-trade'),
      type: 'RESPOND_TO_TRADE',
      actorId: TEST_PLAYER_IDS[1],
      tradeId: tradeId('rejected-offer'),
      accepted: false,
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.state.players).toBe(created.state.players);
    expect(rejected.state.tradeOffers[tradeId('rejected-offer')]?.status).toBe('REJECTED');
    expect(rejected.state.pendingInteraction).toBeNull();
    expect(rejected.events.map((event) => event.type)).toEqual(['TRADE_REJECTED']);
  });

  it('revalidates inventories on acceptance and cancels an open offer at end turn', () => {
    const state = tradeState();
    const created = createOffer(state, tradeId('stale-offer'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const staleState: GameState = {
      ...created.state,
      players: {
        ...created.state.players,
        [TEST_PLAYER_IDS[1]]: {
          ...created.state.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.ore, 1]]),
        },
      },
    };

    const stale = dispatch(staleState, {
      id: actionId('accept-stale-trade'),
      type: 'RESPOND_TO_TRADE',
      actorId: TEST_PLAYER_IDS[1],
      tradeId: tradeId('stale-offer'),
      accepted: true,
    });
    expect(stale.ok).toBe(false);
    expect(stale.state).toBe(staleState);
    if (!stale.ok) expect(stale.error.code).toBe('TRADE_STALE');

    const ended = dispatch(created.state, {
      id: actionId('end-turn-with-offer'),
      type: 'END_TURN',
      actorId: TEST_PLAYER_IDS[0],
    });
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.state.tradeOffers[tradeId('stale-offer')]?.status).toBe('CANCELLED');
    expect(ended.state.pendingInteraction).toBeNull();
    expect(ended.events.map((event) => event.type)).toEqual([
      'TRADE_CANCELLED',
      'TURN_ENDED',
      'TURN_STARTED',
    ]);
  });

  it('rejects malformed, overlapping, self-directed, and duplicate player offers', () => {
    const state = tradeState();
    const invalidBundles: readonly [ResourceBundle, ResourceBundle][] = [
      [resourceBundle([]), resourceBundle([[RESOURCE_IDS.brick, 1]])],
      [resourceBundle([[RESOURCE_IDS.wood, -1]]), resourceBundle([[RESOURCE_IDS.brick, 1]])],
      [resourceBundle([[RESOURCE_IDS.wood, 1.5]]), resourceBundle([[RESOURCE_IDS.brick, 1]])],
      [{ mystery: 1 } as ResourceBundle, resourceBundle([[RESOURCE_IDS.brick, 1]])],
      [resourceBundle([[RESOURCE_IDS.wood, 1]]), resourceBundle([[RESOURCE_IDS.wood, 1]])],
    ];

    for (const [index, [offered, requested]] of invalidBundles.entries()) {
      const result = dispatch(state, {
        id: actionId(`invalid-bundle-${index}`),
        type: 'CREATE_TRADE',
        actorId: TEST_PLAYER_IDS[0],
        tradeId: tradeId(`invalid-bundle-${index}`),
        recipientId: TEST_PLAYER_IDS[1],
        offered,
        requested,
      });
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      if (!result.ok) expect(result.error.code).toBe('INVALID_TRADE');
    }

    const selfTrade = dispatch(state, {
      id: actionId('self-trade'),
      type: 'CREATE_TRADE',
      actorId: TEST_PLAYER_IDS[0],
      tradeId: tradeId('self-trade'),
      recipientId: TEST_PLAYER_IDS[0],
      offered: resourceBundle([[RESOURCE_IDS.wood, 1]]),
      requested: resourceBundle([[RESOURCE_IDS.brick, 1]]),
    });
    expect(selfTrade.ok).toBe(false);
    if (!selfTrade.ok) expect(selfTrade.error.code).toBe('INVALID_TARGET');

    const created = createOffer(state, tradeId('duplicate-offer'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const duplicateState: GameState = { ...created.state, pendingInteraction: null };
    const duplicate = createOffer(duplicateState, tradeId('duplicate-offer'));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe('TRADE_ID_IN_USE');
  });
});
