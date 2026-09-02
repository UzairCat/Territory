import { describe, expect, it } from 'vitest';

import { COMMODITY_IDS } from '../../src/engine/content/commodities';
import {
  KN_PROGRESS_CARDS,
  type KNProgressEffect,
} from '../../src/engine/content/kn-progress-cards';
import { RESOURCE_IDS, TERRAIN_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { createGame } from '../../src/engine/core/create-game';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GameState, KnightState } from '../../src/engine/core/game-state';
import type { CardInstanceId, PlayerId, VertexId } from '../../src/engine/core/ids';
import { actionId, knightId } from '../../src/engine/core/ids';
import { calculateScore } from '../../src/engine/rules/scoring-rules';
import { getBankTradeRatio } from '../../src/engine/rules/trade-rules';
import { drawKNProgressCard } from '../../src/engine/rules/kn-turn-rules';
import { createTestKNConfig, TEST_PLAYER_IDS } from '../helpers/game-state';

const ACTIVE = TEST_PLAYER_IDS[0];
const OPPONENT = TEST_PLAYER_IDS[1];

function actionState(playerCount: 2 | 3 | 4 = 2): GameState {
  const created = createGame(createTestKNConfig(playerCount));
  if (!created.ok) throw new Error('K+N test game failed to initialize.');
  return {
    ...created.state,
    turn: {
      ...created.state.turn,
      activePlayerId: ACTIVE,
      turnNumber: 4,
      phase: 'ACTION_PHASE',
      dice: [3, 4],
      setupPlacementIndex: null,
      setupPlacementVertexId: null,
    },
    pendingInteraction: null,
  };
}

function ownCard(
  state: GameState,
  effect: KNProgressEffect,
  ownerId: PlayerId = ACTIVE,
): { readonly state: GameState; readonly cardId: CardInstanceId } {
  const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === effect);
  const card = Object.values(state.kn?.progressCards ?? {}).find(
    (candidate) => candidate.definitionId === definition?.id,
  );
  const player = state.players[ownerId];
  if (definition === undefined || card === undefined || player === undefined || state.kn === null) {
    throw new Error(`Could not grant ${effect}.`);
  }
  return {
    cardId: card.instanceId,
    state: {
      ...state,
      players: {
        ...state.players,
        [ownerId]: {
          ...player,
          knProgressCardIds: [...player.knProgressCardIds, card.instanceId],
        },
      },
      kn: {
        ...state.kn,
        progressDecks: {
          SCIENCE: state.kn.progressDecks.SCIENCE.filter((id) => id !== card.instanceId),
          TRADE: state.kn.progressDecks.TRADE.filter((id) => id !== card.instanceId),
          POLITICS: state.kn.progressDecks.POLITICS.filter((id) => id !== card.instanceId),
        },
        progressCards: {
          ...state.kn.progressCards,
          [card.instanceId]: {
            ...card,
            ownerId,
            drawnTurn: state.turn.turnNumber,
            revealed: false,
          },
        },
      },
    },
  };
}

function play(state: GameState, cardId: CardInstanceId) {
  return dispatch(state, {
    id: actionId(`play-${cardId}`),
    type: 'PLAY_KN_PROGRESS_CARD',
    actorId: ACTIVE,
    cardInstanceId: cardId,
  });
}

function choose(state: GameState, actorId: PlayerId, selections: readonly string[]) {
  return dispatch(state, {
    id: actionId(`choose-${actorId}-${state.actionHistory.length}`),
    type: 'RESOLVE_PROGRESS_SELECTION',
    actorId,
    selections,
  });
}

function firstVertexOnResource(state: GameState, resourceId: string): VertexId {
  const hex = Object.values(state.board.hexes).find(
    (candidate) => candidate.resourceId === resourceId,
  );
  const vertexId = hex?.vertexIds[0];
  if (vertexId === undefined) throw new Error(`No vertex found for ${resourceId}.`);
  return vertexId;
}

function withBuilding(
  state: GameState,
  playerId: PlayerId,
  vertexId: VertexId,
  type: 'HOUSE' | 'MANSION',
): GameState {
  const vertex = state.board.vertices[vertexId];
  if (vertex === undefined) throw new Error('Missing fixture vertex.');
  return {
    ...state,
    board: {
      ...state.board,
      vertices: {
        ...state.board.vertices,
        [vertexId]: { ...vertex, building: { ownerId: playerId, type }, knightId: null },
      },
    },
  };
}

describe('K+N Science Progress Cards', () => {
  it('uses Alchemist before rolling while leaving the Event die random', () => {
    const granted = ownCard(actionState(), 'ALCHEMIST');
    const state: GameState = {
      ...granted.state,
      turn: { ...granted.state.turn, phase: 'WAITING_FOR_ROLL', dice: null },
    };
    const result = dispatch(state, {
      id: actionId('alchemist-roll'),
      type: 'PLAY_ALCHEMIST',
      actorId: ACTIVE,
      cardInstanceId: granted.cardId,
      redDie: 2,
      regularDie: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.dice).toEqual([2, 3]);
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'KN_DICE_ROLLED', red: 2, regular: 3, numericTotal: 5 }),
    );
    expect(result.state.players[ACTIVE]?.knProgressCardIds).not.toContain(granted.cardId);
  });

  it('activates Alchemist first, then rolls only after one die from each row is confirmed', () => {
    const granted = ownCard(actionState(), 'ALCHEMIST');
    const state: GameState = {
      ...granted.state,
      turn: { ...granted.state.turn, phase: 'WAITING_FOR_ROLL', dice: null },
    };

    const activated = play(state, granted.cardId);
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.state.turn.phase).toBe('CARD_RESOLUTION');
    expect(activated.state.pendingInteraction).toMatchObject({
      purpose: 'ALCHEMIST_DICE',
      minimumSelections: 2,
      maximumSelections: 2,
      canCancel: false,
    });
    expect(activated.state.turn.dice).toBeNull();

    const rolled = choose(activated.state, ACTIVE, ['regular:3', 'red:5']);
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;
    expect(rolled.state.turn.dice).toEqual([5, 3]);
    expect(rolled.events).toContainEqual(
      expect.objectContaining({ type: 'KN_DICE_ROLLED', red: 5, regular: 3, numericTotal: 8 }),
    );
  });

  it('applies one Crane discount and expires an unused discount at turn end', () => {
    let granted = ownCard(actionState(), 'CRANE');
    const cityVertex = Object.values(granted.state.board.vertices)[0]!.id;
    granted = {
      ...granted,
      state: withBuilding(granted.state, ACTIVE, cityVertex, 'MANSION'),
    };
    const played = play(granted.state, granted.cardId);
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.players[ACTIVE]?.craneDiscountAvailable).toBe(true);

    const improved = dispatch(played.state, {
      id: actionId('discounted-improvement'),
      type: 'BUY_IMPROVEMENT',
      actorId: ACTIVE,
      track: 'SCIENCE',
    });
    expect(improved.ok).toBe(true);
    if (!improved.ok) return;
    expect(improved.events).toContainEqual(
      expect.objectContaining({ type: 'IMPROVEMENT_BOUGHT', level: 1, cost: 0 }),
    );
    expect(improved.state.players[ACTIVE]?.craneDiscountAvailable).toBe(false);

    let secondGrant = ownCard(actionState(), 'CRANE');
    secondGrant = {
      ...secondGrant,
      state: withBuilding(secondGrant.state, ACTIVE, cityVertex, 'MANSION'),
    };
    const secondPlayed = play(secondGrant.state, secondGrant.cardId);
    expect(secondPlayed.ok).toBe(true);
    if (!secondPlayed.ok) return;
    const ended = dispatch(secondPlayed.state, {
      id: actionId('expire-crane'),
      type: 'END_TURN',
      actorId: ACTIVE,
    });
    expect(ended.ok).toBe(true);
    if (ended.ok) expect(ended.state.players[ACTIVE]?.craneDiscountAvailable).toBe(false);
  });

  it('keeps Crane in hand when no discounted Improvement can legally be bought', () => {
    const granted = ownCard(actionState(), 'CRANE');
    const result = play(granted.state, granted.cardId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CARD_TARGET_UNAVAILABLE');
    expect(result.state.players[ACTIVE]?.knProgressCardIds).toContain(granted.cardId);
  });

  it('resolves Engineer, Inventor, Medicine, Road Building, and Smith through selections', () => {
    const engineer = ownCard(actionState(), 'ENGINEER');
    const cityVertex = Object.values(engineer.state.board.vertices)[0]!.id;
    const engineerState = withBuilding(engineer.state, ACTIVE, cityVertex, 'MANSION');
    const engineerPlayed = play(engineerState, engineer.cardId);
    expect(engineerPlayed.ok).toBe(true);
    if (!engineerPlayed.ok) return;
    const walled = choose(engineerPlayed.state, ACTIVE, [cityVertex]);
    expect(walled.ok).toBe(true);
    if (!walled.ok) return;
    expect(walled.state.board.vertices[cityVertex]?.building?.hasWall).toBe(true);

    const inventor = ownCard(actionState(), 'INVENTOR');
    const eligibleHexes = Object.values(inventor.state.board.hexes).filter(
      (hex) => hex.numberToken !== null && ![2, 6, 8, 12].includes(hex.numberToken),
    );
    const firstToken = eligibleHexes[0]!;
    const secondToken = eligibleHexes[1]!;
    const inventorPlayed = play(inventor.state, inventor.cardId);
    expect(inventorPlayed.ok).toBe(true);
    if (!inventorPlayed.ok) return;
    expect(inventorPlayed.events).not.toContainEqual(
      expect.objectContaining({ type: 'KN_PROGRESS_CARD_PLAYED' }),
    );
    const firstChosen = choose(inventorPlayed.state, ACTIVE, [firstToken.id]);
    expect(firstChosen.ok).toBe(true);
    if (!firstChosen.ok) return;
    expect(firstChosen.events).not.toContainEqual(
      expect.objectContaining({ type: 'KN_PROGRESS_CARD_PLAYED' }),
    );
    const swapped = choose(firstChosen.state, ACTIVE, [secondToken.id]);
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.events).toContainEqual(
      expect.objectContaining({
        type: 'KN_PROGRESS_CARD_PLAYED',
        cardInstanceId: inventor.cardId,
      }),
    );
    expect(swapped.state.board.hexes[firstToken.id]?.numberToken).toBe(secondToken.numberToken);
    expect(swapped.state.board.hexes[secondToken.id]?.numberToken).toBe(firstToken.numberToken);

    const medicine = ownCard(actionState(), 'MEDICINE');
    const houseVertex = Object.values(medicine.state.board.vertices)[0]!.id;
    let medicineState = withBuilding(medicine.state, ACTIVE, houseVertex, 'HOUSE');
    medicineState = {
      ...medicineState,
      players: {
        ...medicineState.players,
        [ACTIVE]: {
          ...medicineState.players[ACTIVE]!,
          resources: resourceBundle([
            [RESOURCE_IDS.ore, 2],
            [RESOURCE_IDS.grain, 1],
          ]),
        },
      },
    };
    const medicinePlayed = play(medicineState, medicine.cardId);
    expect(medicinePlayed.ok).toBe(true);
    if (!medicinePlayed.ok) return;
    expect(medicinePlayed.events).not.toContainEqual(
      expect.objectContaining({ type: 'KN_PROGRESS_CARD_PLAYED' }),
    );
    const upgraded = choose(medicinePlayed.state, ACTIVE, [houseVertex]);
    expect(upgraded.ok).toBe(true);
    if (!upgraded.ok) return;
    expect(upgraded.events).toContainEqual(
      expect.objectContaining({
        type: 'KN_PROGRESS_CARD_PLAYED',
        cardInstanceId: medicine.cardId,
      }),
    );
    expect(upgraded.state.board.vertices[houseVertex]?.building?.type).toBe('MANSION');
    expect(upgraded.state.players[ACTIVE]?.resources).toMatchObject({ ore: 0, grain: 0 });

    const roadBuilding = ownCard(actionState(), 'ROAD_BUILDING');
    const edge = Object.values(roadBuilding.state.board.edges)[0]!;
    const roadState = withBuilding(roadBuilding.state, ACTIVE, edge.vertexAId, 'HOUSE');
    const roadPlayed = play(roadState, roadBuilding.cardId);
    expect(roadPlayed.ok).toBe(true);
    if (!roadPlayed.ok) return;
    const roadPlaced = choose(roadPlayed.state, ACTIVE, [edge.id]);
    expect(roadPlaced.ok).toBe(true);
    if (!roadPlaced.ok) return;
    expect(roadPlaced.state.board.edges[edge.id]?.roadOwnerId).toBe(ACTIVE);
    const roadFinished = dispatch(roadPlaced.state, {
      id: actionId('finish-road-building'),
      type: 'RESOLVE_PROGRESS_SELECTION',
      actorId: ACTIVE,
      selections: [],
      cancelled: true,
    });
    expect(roadFinished.ok).toBe(true);
    if (roadFinished.ok) expect(roadFinished.state.pendingInteraction).toBeNull();

    const smith = ownCard(actionState(), 'SMITH');
    const knightVertex = Object.values(smith.state.board.vertices)[0]!.id;
    const knight: KnightState = {
      id: knightId('smith-knight'),
      ownerId: ACTIVE,
      vertexId: knightVertex,
      level: 1,
      active: true,
      placedTurn: 1,
      activeSinceTurn: 1,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    const smithState: GameState = {
      ...smith.state,
      players: {
        ...smith.state.players,
        [ACTIVE]: { ...smith.state.players[ACTIVE]!, knights: [knight] },
      },
      board: {
        ...smith.state.board,
        vertices: {
          ...smith.state.board.vertices,
          [knightVertex]: {
            ...smith.state.board.vertices[knightVertex]!,
            building: null,
            knightId: knight.id,
          },
        },
      },
    };
    const smithPlayed = play(smithState, smith.cardId);
    expect(smithPlayed.ok).toBe(true);
    if (!smithPlayed.ok) return;
    const smithResolved = choose(smithPlayed.state, ACTIVE, [knight.id]);
    expect(smithResolved.ok).toBe(true);
    if (smithResolved.ok) {
      expect(smithResolved.state.players[ACTIVE]?.knights[0]).toMatchObject({
        level: 2,
        active: true,
      });
    }
  });

  it.each([
    ['IRRIGATION', RESOURCE_IDS.grain, TERRAIN_IDS.fields],
    ['MINING', RESOURCE_IDS.ore, TERRAIN_IDS.mountains],
  ] as const)('counts distinct terrain for %s', (effect, resourceId, terrainId) => {
    const granted = ownCard(actionState(), effect);
    const terrainHex = Object.values(granted.state.board.hexes).find(
      (hex) => hex.terrainId === terrainId,
    )!;
    const vertexId = terrainHex.vertexIds[0]!;
    const state = withBuilding(granted.state, ACTIVE, vertexId, 'HOUSE');
    const distinctCount = Object.values(state.board.hexes).filter(
      (hex) => hex.terrainId === terrainId && hex.vertexIds.includes(vertexId),
    ).length;
    const result = play(state, granted.cardId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[ACTIVE]?.resources[resourceId]).toBe(distinctCount * 2);
  });

  it.each(['PRINTER', 'CONSTITUTION'] as const)(
    'reveals %s immediately and excludes it from the hand limit',
    (effect) => {
      const state = actionState();
      const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === effect)!;
      const card = Object.values(state.kn!.progressCards).find(
        (candidate) => candidate.definitionId === definition.id,
      )!;
      const prepared: GameState = {
        ...state,
        kn: {
          ...state.kn!,
          progressDecks: {
            ...state.kn!.progressDecks,
            [definition.family]: [
              card.instanceId,
              ...state.kn!.progressDecks[definition.family].filter(
                (candidate) => candidate !== card.instanceId,
              ),
            ],
          },
        },
      };
      const drawn = drawKNProgressCard(prepared, ACTIVE, definition.family);
      expect(drawn.state.players[ACTIVE]?.knProgressCardIds).not.toContain(card.instanceId);
      expect(drawn.state.players[ACTIVE]?.revealedKNProgressCardIds).toContain(card.instanceId);
      expect(calculateScore(drawn.state, ACTIVE)).toBe(1);
    },
  );
});

describe('K+N Trade Progress Cards', () => {
  it('permanently reclaims an eligible tile and allows changing the tile before choosing', () => {
    const granted = ownCard(actionState(), 'RECLAMATION');
    const firstHex = Object.values(granted.state.board.hexes).find(
      (hex) =>
        hex.resourceId !== null &&
        hex.id !== granted.state.board.robberHexId &&
        hex.numberToken !== 6 &&
        hex.numberToken !== 8,
    )!;
    const secondHex = Object.values(granted.state.board.hexes).find(
      (hex) =>
        hex.resourceId !== null &&
        hex.id !== granted.state.board.robberHexId &&
        hex.numberToken !== 6 &&
        hex.numberToken !== 8 &&
        hex.id !== firstHex.id,
    )!;
    const protectedHexes = Object.values(granted.state.board.hexes).filter(
      (hex) => hex.numberToken === 6 || hex.numberToken === 8,
    );
    const played = play(granted.state, granted.cardId);
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.pendingInteraction).toMatchObject({
      purpose: 'RECLAMATION_HEX',
      canCancel: true,
      context: { committed: false },
    });
    if (played.state.pendingInteraction?.type === 'KN_SELECTION') {
      for (const protectedHex of protectedHexes) {
        expect(played.state.pendingInteraction.eligibleIds).not.toContain(protectedHex.id);
      }
    }
    const rejectedProtectedHex = protectedHexes[0];
    if (rejectedProtectedHex !== undefined) {
      const rejected = choose(played.state, ACTIVE, [rejectedProtectedHex.id]);
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) expect(rejected.error.code).toBe('INVALID_TARGET');
    }

    const firstSelected = choose(played.state, ACTIVE, [firstHex.id]);
    expect(firstSelected.ok).toBe(true);
    if (!firstSelected.ok) return;
    expect(firstSelected.state.pendingInteraction).toMatchObject({
      purpose: 'RECLAMATION_RESOURCE',
      context: { selectedHexId: firstHex.id, committed: false },
    });
    const changedTile = choose(firstSelected.state, ACTIVE, [secondHex.id]);
    expect(changedTile.ok).toBe(true);
    if (!changedTile.ok) return;
    expect(changedTile.state.pendingInteraction).toMatchObject({
      purpose: 'RECLAMATION_RESOURCE',
      context: { selectedHexId: secondHex.id },
    });

    const replacement =
      secondHex.resourceId === RESOURCE_IDS.brick ? RESOURCE_IDS.wood : RESOURCE_IDS.brick;
    const resolved = choose(changedTile.state, ACTIVE, [replacement]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.board.hexes[secondHex.id]).toMatchObject({
      resourceId: replacement,
      terrainId: replacement === RESOURCE_IDS.brick ? TERRAIN_IDS.hills : TERRAIN_IDS.forest,
    });
    expect(resolved.events).toContainEqual({
      type: 'TERRAIN_RECLAIMED',
      playerId: ACTIVE,
      hexId: secondHex.id,
      fromResourceId: secondHex.resourceId,
      toResourceId: replacement,
    });
  });

  it('resolves both Monopoly cards with their per-opponent caps and animation metadata', () => {
    for (const [effect, goodId, cap] of [
      ['RESOURCE_MONOPOLY', RESOURCE_IDS.wood, 2],
      ['COMMODITY_MONOPOLY', COMMODITY_IDS.paper, 1],
    ] as const) {
      const granted = ownCard(actionState(3), effect);
      const state: GameState = {
        ...granted.state,
        players: Object.fromEntries(
          Object.entries(granted.state.players).map(([id, player]) => [
            id,
            id === ACTIVE
              ? player
              : {
                  ...player,
                  ...(goodId === RESOURCE_IDS.wood
                    ? { resources: resourceBundle([[goodId, 4]]) }
                    : { commodities: resourceBundle([[goodId, 4]]) }),
                },
          ]),
        ),
      };
      const played = play(state, granted.cardId);
      expect(played.ok).toBe(true);
      if (!played.ok) continue;
      const resolved = choose(played.state, ACTIVE, [goodId]);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) continue;
      const total =
        (resolved.state.players[ACTIVE]?.resources[goodId] ?? 0) +
        (resolved.state.players[ACTIVE]?.commodities[goodId] ?? 0);
      expect(total).toBe(cap * 2);
      expect(resolved.events).toContainEqual(
        expect.objectContaining({
          type: 'KN_PROGRESS_CARD_RESOLVED',
          resourceId: goodId,
          transfers: { [OPPONENT]: cap, [TEST_PLAYER_IDS[2]]: cap },
        }),
      );
    }
  });

  it('runs Commercial Harbor and Master Merchant as serializable private choices', () => {
    const harbor = ownCard(actionState(), 'COMMERCIAL_HARBOR');
    const harborState: GameState = {
      ...harbor.state,
      players: {
        ...harbor.state.players,
        [ACTIVE]: {
          ...harbor.state.players[ACTIVE]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 1]]),
        },
        [OPPONENT]: {
          ...harbor.state.players[OPPONENT]!,
          commodities: resourceBundle([[COMMODITY_IDS.cloth, 1]]),
        },
      },
    };
    const harborPlayed = play(harborState, harbor.cardId);
    expect(harborPlayed.ok).toBe(true);
    if (!harborPlayed.ok) return;
    expect(harborPlayed.state.pendingInteraction).toMatchObject({
      playerId: ACTIVE,
      purpose: 'COMMERCIAL_HARBOR_PLAYER',
    });
    const partnerChosen = choose(harborPlayed.state, ACTIVE, [OPPONENT]);
    expect(partnerChosen.ok).toBe(true);
    if (!partnerChosen.ok) return;
    expect(partnerChosen.state.pendingInteraction).toMatchObject({
      playerId: ACTIVE,
      purpose: 'COMMERCIAL_HARBOR_RESOURCE',
    });
    const offered = choose(partnerChosen.state, ACTIVE, [RESOURCE_IDS.wood]);
    expect(offered.ok).toBe(true);
    if (!offered.ok) return;
    expect(offered.state.pendingInteraction).toMatchObject({
      playerId: OPPONENT,
      purpose: 'COMMERCIAL_HARBOR_COMMODITY',
    });
    const exchanged = choose(offered.state, OPPONENT, [COMMODITY_IDS.cloth]);
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;
    expect(exchanged.state.players[ACTIVE]?.commodities[COMMODITY_IDS.cloth]).toBe(1);
    expect(exchanged.state.players[OPPONENT]?.resources[RESOURCE_IDS.wood]).toBe(1);

    const merchant = ownCard(actionState(), 'MASTER_MERCHANT');
    const opponentCity = Object.values(merchant.state.board.vertices)[0]!.id;
    let merchantState = withBuilding(merchant.state, OPPONENT, opponentCity, 'MANSION');
    merchantState = {
      ...merchantState,
      players: {
        ...merchantState.players,
        [OPPONENT]: {
          ...merchantState.players[OPPONENT]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 1]]),
          commodities: resourceBundle([[COMMODITY_IDS.coin, 1]]),
        },
      },
    };
    const merchantPlayed = play(merchantState, merchant.cardId);
    expect(merchantPlayed.ok).toBe(true);
    if (!merchantPlayed.ok) return;
    const targetChosen = choose(merchantPlayed.state, ACTIVE, [OPPONENT]);
    expect(targetChosen.ok).toBe(true);
    if (!targetChosen.ok) return;
    const cardsTaken = choose(targetChosen.state, ACTIVE, [RESOURCE_IDS.brick, COMMODITY_IDS.coin]);
    expect(cardsTaken.ok).toBe(true);
    if (!cardsTaken.ok) return;
    expect(cardsTaken.state.players[ACTIVE]?.resources[RESOURCE_IDS.brick]).toBe(1);
    expect(cardsTaken.state.players[ACTIVE]?.commodities[COMMODITY_IDS.coin]).toBe(1);
  });

  it('allows Merchant Fleet to select any good and expires its ratio at end of turn', () => {
    const granted = ownCard(actionState(), 'MERCHANT_FLEET');
    const played = play(granted.state, granted.cardId);
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.pendingInteraction?.type).toBe('KN_SELECTION');
    if (played.state.pendingInteraction?.type === 'KN_SELECTION') {
      expect(played.state.pendingInteraction.purpose).toBe('MERCHANT_FLEET_GOOD');
      expect(played.state.pendingInteraction.eligibleIds).toContain(COMMODITY_IDS.coin);
    }
    const selected = choose(played.state, ACTIVE, [COMMODITY_IDS.coin]);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(getBankTradeRatio(selected.state, ACTIVE, COMMODITY_IDS.coin)).toBe(2);
    const ended = dispatch(selected.state, {
      id: actionId('end-merchant-fleet'),
      type: 'END_TURN',
      actorId: ACTIVE,
    });
    expect(ended.ok).toBe(true);
    if (ended.ok) expect(ended.state.players[ACTIVE]?.merchantFleetGoodId).toBeNull();
  });

  it('places and transfers the Merchant with its VP and 2:1 resource rate', () => {
    const first = ownCard(actionState(), 'MERCHANT');
    const woodVertex = firstVertexOnResource(first.state, RESOURCE_IDS.wood);
    const state = withBuilding(first.state, ACTIVE, woodVertex, 'HOUSE');
    const targetHex = Object.values(state.board.hexes).find(
      (hex) => hex.resourceId === RESOURCE_IDS.wood && hex.vertexIds.includes(woodVertex),
    )!;
    const played = play(state, first.cardId);
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const placed = choose(played.state, ACTIVE, [targetHex.id]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.state.kn?.merchant?.ownerId).toBe(ACTIVE);
    expect(calculateScore(placed.state, ACTIVE)).toBe(2);
    expect(getBankTradeRatio(placed.state, ACTIVE, RESOURCE_IDS.wood)).toBe(2);
  });
});

describe('K+N Politics Progress Cards', () => {
  it('moves War Drums backward or triggers and fully resolves an immediate attack', () => {
    const retreat = ownCard(actionState(), 'WAR_DRUMS');
    const retreatState: GameState = {
      ...retreat.state,
      kn: { ...retreat.state.kn!, barbarianPosition: 2 },
    };
    const retreatPlayed = play(retreatState, retreat.cardId);
    expect(retreatPlayed.ok).toBe(true);
    if (!retreatPlayed.ok) return;
    expect(retreatPlayed.state.pendingInteraction).toMatchObject({
      purpose: 'WAR_DRUMS_POSITION',
      eligibleIds: ['3', '1', '0'],
    });
    const retreated = choose(retreatPlayed.state, ACTIVE, ['0']);
    expect(retreated.ok).toBe(true);
    if (!retreated.ok) return;
    expect(retreated.state.kn?.barbarianPosition).toBe(0);

    const advance = ownCard(actionState(), 'WAR_DRUMS');
    const cityVertexId = Object.values(advance.state.board.vertices)[0]!.id;
    const attackState = withBuilding(
      { ...advance.state, kn: { ...advance.state.kn!, barbarianPosition: 6 } },
      ACTIVE,
      cityVertexId,
      'MANSION',
    );
    const advancePlayed = play(attackState, advance.cardId);
    expect(advancePlayed.ok).toBe(true);
    if (!advancePlayed.ok) return;
    const attacked = choose(advancePlayed.state, ACTIVE, ['7']);
    expect(attacked.ok).toBe(true);
    if (!attacked.ok) return;
    expect(attacked.state.kn?.barbarianPosition).toBe(0);
    expect(attacked.state.pendingInteraction).toMatchObject({
      purpose: 'BARBARIAN_CITY_LOSS',
      eligibleIds: [cityVertexId],
    });
    expect(attacked.state.turn.phase).toBe('CARD_RESOLUTION');
    expect(attacked.events.some((event) => event.type === 'BARBARIAN_ATTACK_RESOLVED')).toBe(true);

    const broken = choose(attacked.state, ACTIVE, [cityVertexId]);
    expect(broken.ok).toBe(true);
    if (!broken.ok) return;
    expect(broken.state.board.vertices[cityVertexId]?.building?.type).toBe('HOUSE');
    expect(broken.state.turn.phase).toBe('ACTION_PHASE');
  });

  it('uses Bishop to steal from every eligible opponent on the destination tile', () => {
    const granted = ownCard(actionState(3), 'BISHOP');
    const targetHex = Object.values(granted.state.board.hexes).find(
      (hex) => hex.id !== granted.state.board.robberHexId && hex.vertexIds.length >= 2,
    )!;
    let state = withBuilding(granted.state, OPPONENT, targetHex.vertexIds[0]!, 'HOUSE');
    state = withBuilding(state, TEST_PLAYER_IDS[2], targetHex.vertexIds[1]!, 'HOUSE');
    state = {
      ...state,
      players: {
        ...state.players,
        [OPPONENT]: {
          ...state.players[OPPONENT]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 1]]),
        },
        [TEST_PLAYER_IDS[2]]: {
          ...state.players[TEST_PLAYER_IDS[2]]!,
          commodities: resourceBundle([[COMMODITY_IDS.paper, 1]]),
        },
      },
      kn: { ...state.kn!, firstBarbarianAttackResolved: true },
    };
    const played = play(state, granted.cardId);
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const resolved = choose(played.state, ACTIVE, [targetHex.id]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.events.filter((event) => event.type === 'RESOURCE_STOLEN')).toHaveLength(2);
    expect(resolved.state.players[ACTIVE]?.resources[RESOURCE_IDS.wood]).toBe(1);
    expect(resolved.state.players[ACTIVE]?.commodities[COMMODITY_IDS.paper]).toBe(1);
  });

  it('places the same-rank Knight after Deserter removes an opponent Knight', () => {
    const granted = ownCard(actionState(), 'DESERTER');
    const edge = Object.values(granted.state.board.edges)[0]!;
    const enemyKnight: KnightState = {
      id: knightId('deserter-target'),
      ownerId: OPPONENT,
      vertexId: edge.vertexBId,
      level: 2,
      active: false,
      placedTurn: 1,
      activeSinceTurn: null,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    const state: GameState = {
      ...granted.state,
      players: {
        ...granted.state.players,
        [OPPONENT]: { ...granted.state.players[OPPONENT]!, knights: [enemyKnight] },
      },
      board: {
        ...granted.state.board,
        edges: {
          ...granted.state.board.edges,
          [edge.id]: { ...edge, roadOwnerId: ACTIVE },
        },
        vertices: {
          ...granted.state.board.vertices,
          [edge.vertexBId]: {
            ...granted.state.board.vertices[edge.vertexBId]!,
            building: null,
            knightId: enemyKnight.id,
          },
        },
      },
    };
    const played = play(state, granted.cardId);
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const playerChosen = choose(played.state, ACTIVE, [OPPONENT]);
    expect(playerChosen.ok).toBe(true);
    if (!playerChosen.ok) return;
    const removed = choose(playerChosen.state, OPPONENT, [enemyKnight.id]);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.state.pendingInteraction?.type).toBe('KN_SELECTION');
    if (removed.state.pendingInteraction?.type === 'KN_SELECTION') {
      expect(removed.state.pendingInteraction.purpose).toBe('DESERTER_PLACE_KNIGHT');
      expect(removed.state.pendingInteraction.context.deserterLevel).toBe(2);
      expect(removed.state.pendingInteraction.canCancel).toBe(false);
    }
    const destination =
      removed.state.pendingInteraction?.type === 'KN_SELECTION'
        ? removed.state.pendingInteraction.eligibleIds[0]
        : undefined;
    expect(destination).toBeDefined();
    const placed = choose(removed.state, ACTIVE, [destination!]);
    expect(placed.ok).toBe(true);
    if (placed.ok) expect(placed.state.players[ACTIVE]?.knights[0]?.level).toBe(2);
  });

  it('removes an open Road with Diplomat and transfers a non-VP card with Spy', () => {
    const diplomat = ownCard(actionState(), 'DIPLOMAT');
    const openEdge = Object.values(diplomat.state.board.edges)[0]!;
    const diplomatState: GameState = {
      ...diplomat.state,
      board: {
        ...diplomat.state.board,
        edges: {
          ...diplomat.state.board.edges,
          [openEdge.id]: { ...openEdge, roadOwnerId: OPPONENT },
        },
      },
    };
    const diplomatPlayed = play(diplomatState, diplomat.cardId);
    expect(diplomatPlayed.ok).toBe(true);
    if (!diplomatPlayed.ok) return;
    const removed = choose(diplomatPlayed.state, ACTIVE, [openEdge.id]);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.state.board.edges[openEdge.id]?.roadOwnerId).toBeNull();

    const spy = ownCard(actionState(), 'SPY');
    const victimCard = ownCard(spy.state, 'CRANE', OPPONENT);
    const spyPlayed = play(victimCard.state, spy.cardId);
    expect(spyPlayed.ok).toBe(true);
    if (!spyPlayed.ok) return;
    const targetChosen = choose(spyPlayed.state, ACTIVE, [OPPONENT]);
    expect(targetChosen.ok).toBe(true);
    if (!targetChosen.ok) return;
    const stolen = choose(targetChosen.state, ACTIVE, [victimCard.cardId]);
    expect(stolen.ok).toBe(true);
    if (!stolen.ok) return;
    expect(stolen.state.players[ACTIVE]?.knProgressCardIds).toContain(victimCard.cardId);
    expect(stolen.state.players[OPPONENT]?.knProgressCardIds).not.toContain(victimCard.cardId);
    expect(stolen.events).toContainEqual(
      expect.objectContaining({
        type: 'KN_PROGRESS_CARD_RESOLVED',
        targetIds: [OPPONENT, victimCard.cardId],
      }),
    );
  });

  it('resolves Saboteur and Wedding with the affected player choosing exact cards', () => {
    for (const effect of ['SABOTEUR', 'WEDDING'] as const) {
      const granted = ownCard(actionState(), effect);
      const opponentCity = Object.values(granted.state.board.vertices)[0]!.id;
      let state = withBuilding(granted.state, OPPONENT, opponentCity, 'MANSION');
      state = {
        ...state,
        players: {
          ...state.players,
          [OPPONENT]: {
            ...state.players[OPPONENT]!,
            resources: resourceBundle([[RESOURCE_IDS.wood, 2]]),
            commodities: resourceBundle([[COMMODITY_IDS.paper, 1]]),
          },
        },
      };
      const played = play(state, granted.cardId);
      expect(played.ok).toBe(true);
      if (!played.ok) continue;
      expect(played.state.pendingInteraction).toMatchObject({ playerId: OPPONENT });
      const resolved = choose(played.state, OPPONENT, [RESOURCE_IDS.wood]);
      if (effect === 'SABOTEUR') {
        expect(resolved.ok).toBe(true);
        if (resolved.ok) {
          expect(resolved.state.players[OPPONENT]?.resources[RESOURCE_IDS.wood]).toBe(1);
        }
      } else {
        expect(resolved.ok).toBe(false);
        const wedding = choose(played.state, OPPONENT, [RESOURCE_IDS.wood, COMMODITY_IDS.paper]);
        expect(wedding.ok).toBe(true);
        if (wedding.ok) {
          expect(wedding.state.players[ACTIVE]?.resources[RESOURCE_IDS.wood]).toBe(1);
          expect(wedding.state.players[ACTIVE]?.commodities[COMMODITY_IDS.paper]).toBe(1);
          const transfer = wedding.events.find(
            (event) => event.type === 'WEDDING_CARDS_TRANSFERRED',
          );
          expect(transfer).toMatchObject({
            type: 'WEDDING_CARDS_TRANSFERRED',
            playerId: ACTIVE,
            targetPlayerId: OPPONENT,
          });
          if (transfer?.type === 'WEDDING_CARDS_TRANSFERRED') {
            expect(transfer.resources[RESOURCE_IDS.wood]).toBe(1);
            expect(transfer.resources[COMMODITY_IDS.paper]).toBe(1);
          }
        }
      }
    }
  });

  it('activates all Knights with Warlord but preserves same-turn action timing', () => {
    const granted = ownCard(actionState(), 'WARLORD');
    const vertexId = Object.values(granted.state.board.vertices)[0]!.id;
    const knight: KnightState = {
      id: knightId('warlord-knight'),
      ownerId: ACTIVE,
      vertexId,
      level: 1,
      active: false,
      placedTurn: 1,
      activeSinceTurn: null,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    const state: GameState = {
      ...granted.state,
      players: {
        ...granted.state.players,
        [ACTIVE]: { ...granted.state.players[ACTIVE]!, knights: [knight] },
      },
      board: {
        ...granted.state.board,
        vertices: {
          ...granted.state.board.vertices,
          [vertexId]: {
            ...granted.state.board.vertices[vertexId]!,
            building: null,
            knightId: knight.id,
          },
        },
      },
    };
    const result = play(state, granted.cardId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[ACTIVE]?.knights[0]).toMatchObject({
      active: true,
      activeSinceTurn: state.turn.turnNumber,
    });
  });
});
