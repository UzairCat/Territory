import { describe, expect, it } from 'vitest';

import { COMMODITY_IDS, COMMODITIES } from '../../src/engine/content/commodities';
import { KN_PROGRESS_CARDS } from '../../src/engine/content/kn-progress-cards';
import { RESOURCE_IDS, RESOURCES } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { createGame } from '../../src/engine/core/create-game';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GameState, KnightState } from '../../src/engine/core/game-state';
import type { CardInstanceId } from '../../src/engine/core/ids';
import { actionId, hexId, knightId, vertexId } from '../../src/engine/core/ids';
import { createRandomState, randomInteger } from '../../src/engine/core/random';
import { KN_MODE } from '../../src/engine/modes/kn';
import { calculateKNProductionDemand } from '../../src/engine/rules/kn-production-rules';
import { upgradeMansion } from '../../src/engine/rules/build-rules';
import { createDiscardQueue, getDiscardSafeLimit } from '../../src/engine/rules/robber-rules';
import { calculateScore, resolveScoring } from '../../src/engine/rules/scoring-rules';
import {
  getLegalSetupHouseVertexIds,
  getLegalSetupRoadEdgeIds,
} from '../../src/engine/rules/setup-rules';
import { getBankTradeRatio } from '../../src/engine/rules/trade-rules';
import {
  downgradeBarbarianCity,
  resolveKNNumber,
  rollKNDice,
} from '../../src/engine/rules/kn-turn-rules';
import { createTestKNConfig, TEST_PLAYER_IDS } from '../helpers/game-state';

function createKNState(playerCount: 2 | 3 | 4 = 2): GameState {
  const result = createGame(createTestKNConfig(playerCount));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('K+N test state failed to initialize.');
  return result.state;
}

function actionState(state: GameState, actorId = TEST_PLAYER_IDS[0]): GameState {
  return {
    ...state,
    turn: {
      ...state.turn,
      activePlayerId: actorId,
      phase: 'ACTION_PHASE',
      setupPlacementIndex: null,
      setupPlacementVertexId: null,
      dice: [3, 4],
    },
    pendingInteraction: null,
  };
}

function randomForBarbarian(): GameState['random'] {
  for (let index = 0; index < 100; index += 1) {
    const random = createRandomState(`barbarian-event-${index}`);
    if (randomInteger(random, 0, 6).value < 3) return random;
  }
  throw new Error('Could not find deterministic barbarian event seed.');
}

function randomForEventFace(face: number): GameState['random'] {
  for (let index = 0; index < 100; index += 1) {
    const random = createRandomState(`kn-event-${face}-${index}`);
    if (randomInteger(random, 0, 6).value === face) return random;
  }
  throw new Error(`Could not find deterministic K+N Event face ${face}.`);
}

describe('K+N mode foundations', () => {
  it('initializes three 18-card decks, commodities, no Classic deck, and a 13-point goal', () => {
    const state = createKNState();

    expect(state.config.modeId).toBe(KN_MODE.id);
    expect(state.config.victoryTarget).toBe(13);
    expect(state.progressDeck).toHaveLength(0);
    expect(state.kn).not.toBeNull();
    expect(state.kn?.progressDecks.SCIENCE).toHaveLength(18);
    expect(state.kn?.progressDecks.TRADE).toHaveLength(18);
    expect(state.kn?.progressDecks.POLITICS).toHaveLength(18);
    expect(Object.keys(state.kn?.progressCards ?? {})).toHaveLength(54);
    expect(KN_PROGRESS_CARDS.reduce((total, card) => total + card.count, 0)).toBe(54);
    expect(KN_PROGRESS_CARDS.find((card) => card.effect === 'MERCHANT')?.count).toBe(4);
    expect(KN_PROGRESS_CARDS.find((card) => card.effect === 'COMMODITY_MONOPOLY')?.count).toBe(2);
    expect(KN_PROGRESS_CARDS.find((card) => card.effect === 'RECLAMATION')?.count).toBe(2);
    expect(KN_PROGRESS_CARDS.find((card) => card.effect === 'WAR_DRUMS')?.count).toBe(2);
    expect(KN_PROGRESS_CARDS.some((card) => card.displayName === 'Intrigue')).toBe(false);
    for (const commodity of COMMODITIES) {
      expect(state.commodityBank[commodity.id]).toBe(19);
    }
    expect(state.bonuses.largestForceHolderId).toBeNull();
  });

  it.each([2, 3, 4] as const)(
    'uses House/Road forward and City/Road reverse setup for %i players',
    (playerCount) => {
      let state = createKNState(playerCount);
      const placedTypes: string[] = [];
      const totalPlacements = playerCount * 2;

      for (let placement = 0; placement < totalPlacements; placement += 1) {
        const actorId = state.turn.activePlayerId;
        const vertex = getLegalSetupHouseVertexIds(state)[0];
        expect(actorId).not.toBeNull();
        expect(vertex).toBeDefined();
        const buildingResult = dispatch(state, {
          id: actionId(`setup-building-${playerCount}-${placement}`),
          type: 'PLACE_SETUP_HOUSE',
          actorId: actorId!,
          vertexId: vertex!,
        });
        expect(buildingResult.ok).toBe(true);
        if (!buildingResult.ok) return;
        placedTypes.push(
          buildingResult.events.find((event) => event.type === 'BUILDING_PLACED')?.buildingType ??
            'missing',
        );
        state = buildingResult.state;

        const road = getLegalSetupRoadEdgeIds(state)[0];
        expect(road).toBeDefined();
        const roadResult = dispatch(state, {
          id: actionId(`setup-road-${playerCount}-${placement}`),
          type: 'PLACE_SETUP_ROAD',
          actorId: actorId!,
          edgeId: road!,
        });
        expect(roadResult.ok).toBe(true);
        if (!roadResult.ok) return;
        state = roadResult.state;
      }

      expect(placedTypes.slice(0, playerCount)).toEqual(Array(playerCount).fill('HOUSE'));
      expect(placedTypes.slice(playerCount)).toEqual(Array(playerCount).fill('MANSION'));
      expect(state.turn.phase).toBe('WAITING_FOR_ROLL');
      for (const player of Object.values(state.players)) {
        expect(
          COMMODITIES.reduce(
            (total, commodity) => total + (player.commodities[commodity.id] ?? 0),
            0,
          ),
        ).toBe(0);
      }
    },
  );

  it('produces resource-plus-commodity pairs from Cities and doubles Brick/Grain', () => {
    const original = actionState(createKNState());
    const playerId = TEST_PLAYER_IDS[0];
    const resources = [
      RESOURCE_IDS.wood,
      RESOURCE_IDS.livestock,
      RESOURCE_IDS.ore,
      RESOURCE_IDS.brick,
      RESOURCE_IDS.grain,
    ] as const;
    const hexes: Record<string, GameState['board']['hexes'][string]> = {};
    const vertices: Record<string, GameState['board']['vertices'][string]> = {};

    resources.forEach((resourceId, index) => {
      const h = hexId(`production-${resourceId}`);
      const v = vertexId(`production-v-${resourceId}`);
      hexes[h] = {
        id: h,
        q: index,
        r: 0,
        terrainId: original.board.hexes[Object.keys(original.board.hexes)[index]!]!.terrainId,
        resourceId,
        numberToken: 8,
        vertexIds: [v],
        edgeIds: [],
      };
      vertices[v] = {
        id: v,
        adjacentHexIds: [h],
        connectedEdgeIds: [],
        adjacentVertexIds: [],
        building: { ownerId: playerId, type: 'MANSION' },
        knightId: null,
        portId: null,
      };
    });
    const state: GameState = {
      ...original,
      board: { hexes, vertices, edges: {}, ports: {}, robberHexId: null },
    };
    const demand = calculateKNProductionDemand(state, 8)[playerId];

    expect(demand).toMatchObject({
      [RESOURCE_IDS.wood]: 1,
      [COMMODITY_IDS.paper]: 1,
      [RESOURCE_IDS.livestock]: 1,
      [COMMODITY_IDS.cloth]: 1,
      [RESOURCE_IDS.ore]: 1,
      [COMMODITY_IDS.coin]: 1,
      [RESOURCE_IDS.brick]: 2,
      [RESOURCE_IDS.grain]: 2,
    });
  });

  it('counts commodities for seven discards and adds two safe cards per Wall', () => {
    const original = actionState(createKNState());
    const playerId = TEST_PLAYER_IDS[0];
    const cityVertexId = vertexId('wall-city');
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [playerId]: {
          ...original.players[playerId]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 4]]),
          commodities: resourceBundle([[COMMODITY_IDS.paper, 4]]),
        },
      },
      board: {
        ...original.board,
        vertices: {
          [cityVertexId]: {
            id: cityVertexId,
            adjacentHexIds: [],
            connectedEdgeIds: [],
            adjacentVertexIds: [],
            building: { ownerId: playerId, type: 'MANSION', hasWall: true },
            knightId: null,
            portId: null,
          },
        },
      },
    };

    expect(getDiscardSafeLimit(state, playerId)).toBe(9);
    expect(createDiscardQueue(state).queue).not.toContain(playerId);
    const withoutWall = {
      ...state,
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [cityVertexId]: {
            ...state.board.vertices[cityVertexId]!,
            building: { ownerId: playerId, type: 'MANSION' as const, hasWall: false },
          },
        },
      },
    };
    expect(createDiscardQueue(withoutWall).requiredCounts[playerId]).toBe(4);
  });
});

describe('K+N Knights, improvements, and attacks', () => {
  it('builds and activates a Knight, blocks same-turn movement, and allows one upgrade', () => {
    let state = actionState(createKNState());
    const playerId = TEST_PLAYER_IDS[0];
    const ownedEdge = Object.values(state.board.edges)[0]!;
    const placementVertex = state.board.vertices[ownedEdge.vertexAId]!;
    state = {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId]!,
          resources: resourceBundle([
            [RESOURCE_IDS.livestock, 4],
            [RESOURCE_IDS.ore, 4],
            [RESOURCE_IDS.grain, 2],
          ]),
        },
      },
      board: {
        ...state.board,
        edges: {
          ...state.board.edges,
          [ownedEdge.id]: { ...ownedEdge, roadOwnerId: playerId },
        },
      },
    };
    const built = dispatch(state, {
      id: actionId('knight-build'),
      type: 'BUILD_KNIGHT',
      actorId: playerId,
      vertexId: placementVertex.id,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const knight = built.state.players[playerId]!.knights[0]!;
    expect(knight).toMatchObject({ level: 1, active: false });

    const activated = dispatch(built.state, {
      id: actionId('knight-activate'),
      type: 'ACTIVATE_KNIGHT',
      actorId: playerId,
      knightId: knight.id,
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    const destination = ownedEdge.vertexBId;
    const moved = dispatch(activated.state, {
      id: actionId('knight-move-too-soon'),
      type: 'MOVE_KNIGHT',
      actorId: playerId,
      knightId: knight.id,
      vertexId: destination,
    });
    expect(moved.ok).toBe(false);

    const upgraded = dispatch(activated.state, {
      id: actionId('knight-upgrade'),
      type: 'UPGRADE_KNIGHT',
      actorId: playerId,
      knightId: knight.id,
    });
    expect(upgraded.ok).toBe(true);
    if (!upgraded.ok) return;
    expect(upgraded.state.players[playerId]!.knights[0]).toMatchObject({ level: 2, active: true });
    const upgradedAgain = dispatch(upgraded.state, {
      id: actionId('knight-upgrade-again'),
      type: 'UPGRADE_KNIGHT',
      actorId: playerId,
      knightId: knight.id,
    });
    expect(upgradedAgain.ok).toBe(false);
  });

  it('charges 1/2/3/4 for Science levels and creates the first Metropolis at level 4', () => {
    let state = actionState(createKNState());
    const playerId = TEST_PLAYER_IDS[0];
    const cityVertex = Object.values(state.board.vertices)[0]!;
    state = {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId]!,
          commodities: resourceBundle([[COMMODITY_IDS.paper, 15]]),
        },
      },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [cityVertex.id]: {
            ...cityVertex,
            building: { ownerId: playerId, type: 'MANSION' },
          },
        },
      },
    };
    for (let level = 1; level <= 4; level += 1) {
      const result = dispatch(state, {
        id: actionId(`science-${level}`),
        type: 'BUY_IMPROVEMENT',
        actorId: playerId,
        track: 'SCIENCE',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
      expect(state.players[playerId]!.cityImprovements.SCIENCE).toBe(level);
    }
    expect(state.players[playerId]!.commodities[COMMODITY_IDS.paper]).toBe(5);
    expect(state.kn?.metropolisOwners.SCIENCE).toBe(playerId);
    expect(state.board.vertices[cityVertex.id]?.building?.metropolis).toBe('SCIENCE');
    expect(calculateScore(state, playerId)).toBe(4);
  });

  it.each([
    ['SCIENCE', COMMODITY_IDS.paper, 'AQUEDUCT'],
    ['TRADE', COMMODITY_IDS.cloth, 'TRADING_HOUSE'],
    ['POLITICS', COMMODITY_IDS.coin, 'FORTRESS'],
  ] as const)('announces the %s level-three perk when it is unlocked', (track, goodId, perk) => {
    let state = actionState(createKNState());
    const playerId = TEST_PLAYER_IDS[0];
    const player = state.players[playerId]!;
    const cityVertex = Object.values(state.board.vertices)[0]!;
    state = {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...player,
          commodities: resourceBundle([[goodId, 3]]),
          cityImprovements: { ...player.cityImprovements, [track]: 2 },
        },
      },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [cityVertex.id]: {
            ...cityVertex,
            building: { ownerId: playerId, type: 'MANSION' },
          },
        },
      },
    };

    const result = dispatch(state, {
      id: actionId(`unlock-${track.toLocaleLowerCase()}`),
      type: 'BUY_IMPROVEMENT',
      actorId: playerId,
      track,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toContainEqual({
      type: 'CITY_IMPROVEMENT_PERK_UNLOCKED',
      playerId,
      track,
      perk,
    });
  });

  it('warns before buying level four when no City can receive its Metropolis', () => {
    let state = actionState(createKNState());
    const playerId = TEST_PLAYER_IDS[0];
    state = {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId]!,
          cityImprovements: { SCIENCE: 3, TRADE: 0, POLITICS: 0 },
          commodities: resourceBundle([[COMMODITY_IDS.paper, 4]]),
        },
      },
    };

    const result = dispatch(state, {
      id: actionId('science-four-without-city'),
      type: 'BUY_IMPROVEMENT',
      actorId: playerId,
      track: 'SCIENCE',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/eligible City is required/i);
    expect(result.state.players[playerId]?.cityImprovements.SCIENCE).toBe(3);
    expect(result.state.players[playerId]?.commodities[COMMODITY_IDS.paper]).toBe(4);
  });

  it('unlocks the robber before resolving a seven when the same Event die triggers the first attack', () => {
    let state = createKNState();
    const playerId = TEST_PLAYER_IDS[0];
    const cityVertex = Object.values(state.board.vertices)[0]!;
    const knightVertex = Object.values(state.board.vertices).find(
      (vertex) => vertex.id !== cityVertex.id,
    )!;
    const defender: KnightState = {
      id: knightId('attack-defender'),
      ownerId: playerId,
      vertexId: knightVertex.id,
      level: 1,
      active: true,
      placedTurn: 0,
      activeSinceTurn: null,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    state = {
      ...state,
      random: randomForBarbarian(),
      players: {
        ...state.players,
        [playerId]: { ...state.players[playerId]!, knights: [defender] },
      },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [cityVertex.id]: { ...cityVertex, building: { ownerId: playerId, type: 'MANSION' } },
          [knightVertex.id]: { ...knightVertex, knightId: defender.id },
        },
      },
      turn: {
        ...state.turn,
        activePlayerId: playerId,
        phase: 'WAITING_FOR_ROLL',
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      kn: { ...state.kn!, barbarianPosition: 6, firstBarbarianAttackResolved: false },
    };
    const result = rollKNDice(
      state,
      { id: actionId('attack-seven'), type: 'ROLL_KN_DICE', actorId: playerId },
      { red: 3, regular: 4 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const attackIndex = result.events.findIndex(
      (event) => event.type === 'BARBARIAN_ATTACK_RESOLVED',
    );
    const sevenIndex = result.events.findIndex((event) => event.type === 'ROBBER_SEQUENCE_STARTED');
    expect(attackIndex).toBeGreaterThanOrEqual(0);
    expect(sevenIndex).toBeGreaterThan(attackIndex);
    expect(result.state.kn?.firstBarbarianAttackResolved).toBe(true);
    expect(result.state.kn?.barbarianPosition).toBe(0);
    expect(result.state.players[playerId]?.defenderPoints).toBe(1);
    expect(result.state.players[playerId]?.knights[0]?.active).toBe(false);
    expect(result.state.turn.phase).toBe('MOVE_ROBBER');
    expect(result.state.pendingInteraction?.type).toBe('MOVE_ROBBER');
  });

  it('queues deck rewards in active-player order when top defenders tie', () => {
    let state = createKNState();
    const firstPlayerId = TEST_PLAYER_IDS[0];
    const secondPlayerId = TEST_PLAYER_IDS[1];
    const vertices = Object.values(state.board.vertices).slice(0, 4);
    const firstKnight: KnightState = {
      id: knightId('tie-first-knight'),
      ownerId: firstPlayerId,
      vertexId: vertices[2]!.id,
      level: 1,
      active: true,
      placedTurn: 0,
      activeSinceTurn: null,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    const secondKnight: KnightState = {
      ...firstKnight,
      id: knightId('tie-second-knight'),
      ownerId: secondPlayerId,
      vertexId: vertices[3]!.id,
    };
    state = {
      ...state,
      random: randomForBarbarian(),
      players: {
        ...state.players,
        [firstPlayerId]: { ...state.players[firstPlayerId]!, knights: [firstKnight] },
        [secondPlayerId]: { ...state.players[secondPlayerId]!, knights: [secondKnight] },
      },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [vertices[0]!.id]: {
            ...vertices[0]!,
            building: { ownerId: firstPlayerId, type: 'MANSION' },
          },
          [vertices[1]!.id]: {
            ...vertices[1]!,
            building: { ownerId: secondPlayerId, type: 'MANSION' },
          },
          [vertices[2]!.id]: { ...vertices[2]!, knightId: firstKnight.id },
          [vertices[3]!.id]: { ...vertices[3]!, knightId: secondKnight.id },
        },
      },
      turn: {
        ...state.turn,
        activePlayerId: firstPlayerId,
        phase: 'WAITING_FOR_ROLL',
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      kn: { ...state.kn!, barbarianPosition: 6 },
    };

    const rolled = rollKNDice(
      state,
      { id: actionId('tie-attack'), type: 'ROLL_KN_DICE', actorId: firstPlayerId },
      { red: 2, regular: 3 },
    );
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;
    expect(rolled.state.pendingInteraction).toMatchObject({
      type: 'KN_SELECTION',
      playerId: firstPlayerId,
      purpose: 'DEFENDER_TIE_DECK',
      queue: [firstPlayerId, secondPlayerId],
      simultaneous: true,
    });
    expect(rolled.state.players[firstPlayerId]?.defenderPoints).toBe(0);
    expect(rolled.state.players[secondPlayerId]?.defenderPoints).toBe(0);

    const secondChoice = dispatch(rolled.state, {
      id: actionId('tie-second-deck-first-response'),
      type: 'RESOLVE_PROGRESS_SELECTION',
      actorId: secondPlayerId,
      selections: ['TRADE'],
    });
    expect(secondChoice.ok).toBe(true);
    if (!secondChoice.ok) return;
    expect(secondChoice.state.pendingInteraction).toMatchObject({
      playerId: firstPlayerId,
      purpose: 'DEFENDER_TIE_DECK',
      queue: [firstPlayerId],
      simultaneous: true,
    });
    const firstChoice = dispatch(secondChoice.state, {
      id: actionId('tie-first-deck-second-response'),
      type: 'RESOLVE_PROGRESS_SELECTION',
      actorId: firstPlayerId,
      selections: ['SCIENCE'],
    });
    expect(firstChoice.ok).toBe(true);
    if (!firstChoice.ok) return;
    for (const playerId of [firstPlayerId, secondPlayerId]) {
      const player = firstChoice.state.players[playerId]!;
      expect(player.knProgressCardIds.length + player.revealedKNProgressCardIds.length).toBe(1);
    }
    expect(firstChoice.state.turn.phase).toBe('ACTION_PHASE');
  });

  it('protects a Metropolis while destroying a Wall on the vulnerable loser', () => {
    let state = createKNState();
    const vulnerablePlayerId = TEST_PLAYER_IDS[0];
    const protectedPlayerId = TEST_PLAYER_IDS[1];
    const [vulnerableVertex, protectedVertex] = Object.values(state.board.vertices);
    state = {
      ...state,
      random: randomForBarbarian(),
      players: {
        ...state.players,
        [vulnerablePlayerId]: {
          ...state.players[vulnerablePlayerId]!,
          cityWallsRemaining: 2,
        },
      },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [vulnerableVertex!.id]: {
            ...vulnerableVertex!,
            building: {
              ownerId: vulnerablePlayerId,
              type: 'MANSION',
              hasWall: true,
            },
          },
          [protectedVertex!.id]: {
            ...protectedVertex!,
            building: {
              ownerId: protectedPlayerId,
              type: 'MANSION',
              metropolis: 'SCIENCE',
            },
          },
        },
      },
      turn: {
        ...state.turn,
        activePlayerId: vulnerablePlayerId,
        phase: 'WAITING_FOR_ROLL',
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      kn: {
        ...state.kn!,
        barbarianPosition: 6,
        metropolisOwners: {
          ...state.kn!.metropolisOwners,
          SCIENCE: protectedPlayerId,
        },
      },
    };

    const result = rollKNDice(
      state,
      {
        id: actionId('failed-attack-with-metropolis'),
        type: 'ROLL_KN_DICE',
        actorId: vulnerablePlayerId,
      },
      { red: 2, regular: 3 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingInteraction).toMatchObject({
      type: 'KN_SELECTION',
      playerId: vulnerablePlayerId,
      purpose: 'BARBARIAN_CITY_LOSS',
      eligibleIds: [vulnerableVertex!.id],
    });
    expect(result.state.board.vertices[vulnerableVertex!.id]?.building?.type).toBe('MANSION');
    expect(result.events.some((event) => event.type === 'CITY_DOWNGRADED')).toBe(false);

    const selected = dispatch(result.state, {
      id: actionId('select-only-vulnerable-city'),
      type: 'RESOLVE_PROGRESS_SELECTION',
      actorId: vulnerablePlayerId,
      selections: [vulnerableVertex!.id],
    });
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(selected.state.board.vertices[vulnerableVertex!.id]?.building).toMatchObject({
      type: 'HOUSE',
      hasWall: false,
    });
    expect(selected.state.players[vulnerablePlayerId]?.cityWallsRemaining).toBe(3);
    expect(selected.state.board.vertices[protectedVertex!.id]?.building).toMatchObject({
      type: 'MANSION',
      metropolis: 'SCIENCE',
    });
    expect(selected.events).toContainEqual(
      expect.objectContaining({
        type: 'CITY_DOWNGRADED',
        playerId: vulnerablePlayerId,
        wallDestroyed: true,
      }),
    );
  });

  it('marks and clears a forced City rebuild when no House piece was available', () => {
    let state = actionState(createKNState());
    const playerId = TEST_PLAYER_IDS[0];
    const cityVertex = Object.values(state.board.vertices)[0]!;
    state = {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId]!,
          housesRemaining: 0,
          mansionsRemaining: 3,
          resources: resourceBundle([
            [RESOURCE_IDS.ore, 3],
            [RESOURCE_IDS.grain, 2],
          ]),
        },
      },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [cityVertex.id]: {
            ...cityVertex,
            building: { ownerId: playerId, type: 'MANSION' },
          },
        },
      },
    };
    const downgraded = downgradeBarbarianCity(state, playerId, cityVertex.id).state;
    expect(downgraded.players[playerId]).toMatchObject({
      housesRemaining: 0,
      mustRebuildDestroyedMansion: true,
      forcedMansionRebuildVertexIds: [cityVertex.id],
    });

    const rebuilt = upgradeMansion(downgraded, {
      id: actionId('forced-city-rebuild'),
      type: 'UPGRADE_MANSION',
      actorId: playerId,
      vertexId: cityVertex.id,
    });
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) return;
    expect(rebuilt.state.players[playerId]).toMatchObject({
      housesRemaining: 0,
      mustRebuildDestroyedMansion: false,
      forcedMansionRebuildVertexIds: [],
    });
    expect(rebuilt.state.board.vertices[cityVertex.id]?.building?.type).toBe('MANSION');
  });

  it('defers production for an off-turn fifth-card discard, then resumes the roll', () => {
    let state = createKNState();
    const activePlayerId = TEST_PLAYER_IDS[0];
    const drawingPlayerId = TEST_PLAYER_IDS[1];
    const nonVictoryCards = Object.values(state.kn!.progressCards).filter((card) => {
      const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.id === card.definitionId);
      return definition !== undefined && definition.revealedVictoryPoints === 0;
    });
    const existingCards = nonVictoryCards.slice(0, 4);
    const drawCard = nonVictoryCards.find(
      (card) =>
        !existingCards.includes(card) &&
        KN_PROGRESS_CARDS.find((definition) => definition.id === card.definitionId)?.family ===
          'SCIENCE',
    );
    if (drawCard === undefined) throw new Error('No Science card was available for the draw test.');
    const existingIds = existingCards.map((card) => card.instanceId);
    const removeFromDeck = new Set<CardInstanceId>([...existingIds, drawCard.instanceId]);
    const progressCards = {
      ...state.kn!.progressCards,
      ...Object.fromEntries(
        existingCards.map((card) => [
          card.instanceId,
          { ...card, ownerId: drawingPlayerId, drawnTurn: 1 },
        ]),
      ),
    };
    state = {
      ...state,
      random: randomForEventFace(3),
      players: {
        ...state.players,
        [drawingPlayerId]: {
          ...state.players[drawingPlayerId]!,
          cityImprovements: { SCIENCE: 1, TRADE: 0, POLITICS: 0 },
          knProgressCardIds: existingIds,
        },
      },
      turn: {
        ...state.turn,
        activePlayerId,
        turnNumber: 3,
        phase: 'WAITING_FOR_ROLL',
        dice: null,
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      kn: {
        ...state.kn!,
        progressCards,
        progressDecks: {
          SCIENCE: [
            drawCard.instanceId,
            ...state.kn!.progressDecks.SCIENCE.filter((id) => !removeFromDeck.has(id)),
          ],
          TRADE: state.kn!.progressDecks.TRADE.filter((id) => !removeFromDeck.has(id)),
          POLITICS: state.kn!.progressDecks.POLITICS.filter((id) => !removeFromDeck.has(id)),
        },
      },
    };

    const rolled = rollKNDice(
      state,
      { id: actionId('offturn-fifth-card'), type: 'ROLL_KN_DICE', actorId: activePlayerId },
      { red: 2, regular: 3 },
    );
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;
    expect(rolled.state.turn.phase).toBe('CARD_RESOLUTION');
    expect(rolled.state.pendingInteraction).toMatchObject({
      playerId: drawingPlayerId,
      purpose: 'PROGRESS_DISCARD',
    });
    expect(rolled.events.some((event) => event.type === 'RESOURCES_PRODUCED')).toBe(false);

    const discarded = dispatch(rolled.state, {
      id: actionId('offturn-fifth-card-discard'),
      type: 'RESOLVE_PROGRESS_SELECTION',
      actorId: drawingPlayerId,
      selections: [drawCard.instanceId],
    });
    expect(discarded.ok).toBe(true);
    if (!discarded.ok) return;
    expect(discarded.state.players[drawingPlayerId]?.knProgressCardIds).toHaveLength(4);
    expect(discarded.state.turn.phase).toBe('ACTION_PHASE');
    expect(discarded.events.some((event) => event.type === 'RESOURCES_PRODUCED')).toBe(true);
  });

  it('lets every eligible Aqueduct player choose concurrently after receiving nothing', () => {
    let state = createKNState();
    const playerId = TEST_PLAYER_IDS[0];
    const otherPlayerId = TEST_PLAYER_IDS[1];
    state = {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId]!,
          cityImprovements: { SCIENCE: 3, TRADE: 0, POLITICS: 0 },
        },
        [otherPlayerId]: {
          ...state.players[otherPlayerId]!,
          cityImprovements: { SCIENCE: 3, TRADE: 0, POLITICS: 0 },
        },
      },
      turn: {
        ...state.turn,
        activePlayerId: playerId,
        turnNumber: 2,
        phase: 'RESOLVING_PRODUCTION',
        dice: [2, 3],
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      kn: {
        ...state.kn!,
        pendingRoll: {
          playerId,
          red: 2,
          regular: 3,
          event: 'BARBARIAN',
          numericTotal: 5,
          stage: 'NUMBER',
        },
      },
    };
    const resolved = resolveKNNumber(state);
    expect(resolved.state.pendingInteraction).toMatchObject({
      playerId,
      purpose: 'AQUEDUCT_RESOURCE',
      queue: [playerId, otherPlayerId],
      simultaneous: true,
    });
    const otherChosen = dispatch(resolved.state, {
      id: actionId('aqueduct-other-ore-first'),
      type: 'RESOLVE_PROGRESS_SELECTION',
      actorId: otherPlayerId,
      selections: [RESOURCE_IDS.ore],
    });
    expect(otherChosen.ok).toBe(true);
    if (!otherChosen.ok) return;
    expect(otherChosen.state.pendingInteraction).toMatchObject({
      playerId,
      queue: [playerId],
      simultaneous: true,
    });
    const activeChosen = dispatch(otherChosen.state, {
      id: actionId('aqueduct-active-wood-second'),
      type: 'RESOLVE_PROGRESS_SELECTION',
      actorId: playerId,
      selections: [RESOURCE_IDS.wood],
    });
    expect(activeChosen.ok).toBe(true);
    if (!activeChosen.ok) return;
    expect(activeChosen.state.players[playerId]?.resources[RESOURCE_IDS.wood]).toBe(1);
    expect(activeChosen.state.players[otherPlayerId]?.resources[RESOURCE_IDS.ore]).toBe(1);
    expect(activeChosen.state.turn.phase).toBe('ACTION_PHASE');
  });

  it('transfers a level-five Metropolis from the level-four controller', () => {
    let state = actionState(createKNState(), TEST_PLAYER_IDS[1]);
    const oldOwnerId = TEST_PLAYER_IDS[0];
    const newOwnerId = TEST_PLAYER_IDS[1];
    const [oldVertex, newVertex] = Object.values(state.board.vertices);
    state = {
      ...state,
      players: {
        ...state.players,
        [oldOwnerId]: {
          ...state.players[oldOwnerId]!,
          cityImprovements: { SCIENCE: 4, TRADE: 0, POLITICS: 0 },
        },
        [newOwnerId]: {
          ...state.players[newOwnerId]!,
          cityImprovements: { SCIENCE: 4, TRADE: 0, POLITICS: 0 },
          commodities: resourceBundle([[COMMODITY_IDS.paper, 5]]),
        },
      },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [oldVertex!.id]: {
            ...oldVertex!,
            building: {
              ownerId: oldOwnerId,
              type: 'MANSION',
              metropolis: 'SCIENCE',
            },
          },
          [newVertex!.id]: {
            ...newVertex!,
            building: { ownerId: newOwnerId, type: 'MANSION' },
          },
        },
      },
      kn: {
        ...state.kn!,
        metropolisOwners: { ...state.kn!.metropolisOwners, SCIENCE: oldOwnerId },
      },
    };

    const result = dispatch(state, {
      id: actionId('transfer-science-metropolis'),
      type: 'BUY_IMPROVEMENT',
      actorId: newOwnerId,
      track: 'SCIENCE',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.kn?.metropolisOwners.SCIENCE).toBe(newOwnerId);
    expect(result.state.board.vertices[oldVertex!.id]?.building?.metropolis).toBeNull();
    expect(result.state.board.vertices[newVertex!.id]?.building?.metropolis).toBe('SCIENCE');
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'METROPOLIS_CHANGED',
        playerId: newOwnerId,
        previousPlayerId: oldOwnerId,
      }),
    );
  });

  it('gives level-3 Trade a 2:1 commodity quote without changing ordinary resources', () => {
    const original = actionState(createKNState());
    const playerId = TEST_PLAYER_IDS[0];
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [playerId]: {
          ...original.players[playerId]!,
          cityImprovements: { SCIENCE: 0, TRADE: 3, POLITICS: 0 },
        },
      },
    };
    expect(getBankTradeRatio(state, playerId, COMMODITY_IDS.cloth)).toBe(2);
    expect(getBankTradeRatio(state, playerId, RESOURCE_IDS.wood)).toBe(4);
  });

  it('never awards Largest Force points in K+N', () => {
    const original = actionState(createKNState());
    const playerId = TEST_PLAYER_IDS[0];
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [playerId]: { ...original.players[playerId]!, playedForceCards: 20 },
      },
      bonuses: { ...original.bonuses, largestForceHolderId: playerId },
    };
    expect(state.config.rules.largestForce.victoryPoints).toBe(0);
    expect(calculateScore(state, playerId)).toBe(0);
  });

  it('waits to declare a 13-point K+N victory until that player owns the turn', () => {
    const activePlayerId = TEST_PLAYER_IDS[0];
    const scoringPlayerId = TEST_PLAYER_IDS[1];
    const original = actionState(createKNState(), activePlayerId);
    const before: GameState = {
      ...original,
      players: {
        ...original.players,
        [scoringPlayerId]: {
          ...original.players[scoringPlayerId]!,
          defenderPoints: 12,
        },
      },
    };
    const offTurnCandidate: GameState = {
      ...before,
      players: {
        ...before.players,
        [scoringPlayerId]: {
          ...before.players[scoringPlayerId]!,
          defenderPoints: 13,
        },
      },
    };

    const offTurn = resolveScoring(before, offTurnCandidate);
    expect(offTurn.state.winnerId).toBeNull();
    expect(offTurn.state.turn.phase).toBe('ACTION_PHASE');

    const ownTurnCandidate: GameState = {
      ...offTurn.state,
      turn: { ...offTurn.state.turn, activePlayerId: scoringPlayerId },
    };
    const ownTurn = resolveScoring(offTurn.state, ownTurnCandidate);
    expect(ownTurn.state.winnerId).toBe(scoringPlayerId);
    expect(ownTurn.state.turn.phase).toBe('GAME_OVER');
    expect(ownTurn.events).toContainEqual({
      type: 'GAME_WON',
      playerId: scoringPlayerId,
      score: 13,
    });
  });

  it('keeps all resource and commodity identifiers unique', () => {
    const ids = [...RESOURCES, ...COMMODITIES].map((good) => good.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
