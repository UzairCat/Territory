import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import type { PlayerCount } from '../../src/engine/content/types';
import { CLASSIC_MODE } from '../../src/engine/modes/classic';
import { BASE_MAP_ID } from '../../src/engine/maps/base-map';
import type { GameConfig } from '../../src/engine/core/game-config';
import type { GamePhase, GameState } from '../../src/engine/core/game-state';
import { colorId, gameId, playerId } from '../../src/engine/core/ids';
import { createRandomState } from '../../src/engine/core/random';

export const TEST_PLAYER_IDS = [
  playerId('player-1'),
  playerId('player-2'),
  playerId('player-3'),
  playerId('player-4'),
] as const;

const TEST_PLAYERS = [
  { id: TEST_PLAYER_IDS[0], name: 'Alex', colorId: colorId('cobalt') },
  { id: TEST_PLAYER_IDS[1], name: 'Sam', colorId: colorId('crimson') },
  { id: TEST_PLAYER_IDS[2], name: 'Jordan', colorId: colorId('gold') },
  { id: TEST_PLAYER_IDS[3], name: 'Casey', colorId: colorId('violet') },
] as const;

export function createTestConfig(playerCount: PlayerCount = 2): GameConfig {
  return {
    schemaVersion: 1,
    gameId: gameId('test-game'),
    modeId: CLASSIC_MODE.id,
    mapId: BASE_MAP_ID,
    playerCount,
    seed: 'phase-one-test-seed',
    victoryTarget: CLASSIC_MODE.rules.victoryTarget,
    players: TEST_PLAYERS.slice(0, playerCount).map((player, order) => ({ ...player, order })),
    rules: CLASSIC_MODE.rules,
  };
}

export function createTestGameState(phase: GamePhase = 'INITIALIZING'): GameState {
  const config = createTestConfig();

  return {
    schemaVersion: 1,
    config,
    players: {
      [TEST_PLAYER_IDS[0]]: {
        id: TEST_PLAYER_IDS[0],
        name: 'Alex',
        colorId: colorId('cobalt'),
        resources: resourceBundle([]),
        progressCardIds: [],
        roadsRemaining: 15,
        housesRemaining: 5,
        mansionsRemaining: 4,
        playedForceCards: 0,
      },
      [TEST_PLAYER_IDS[1]]: {
        id: TEST_PLAYER_IDS[1],
        name: 'Sam',
        colorId: colorId('crimson'),
        resources: resourceBundle([[RESOURCE_IDS.wood, 1]]),
        progressCardIds: [],
        roadsRemaining: 15,
        housesRemaining: 5,
        mansionsRemaining: 4,
        playedForceCards: 0,
      },
    },
    board: { hexes: {}, vertices: {}, edges: {}, ports: {}, robberHexId: null },
    bank: resourceBundle([
      [RESOURCE_IDS.wood, 19],
      [RESOURCE_IDS.brick, 19],
      [RESOURCE_IDS.grain, 19],
      [RESOURCE_IDS.livestock, 19],
      [RESOURCE_IDS.ore, 19],
    ]),
    turn: {
      activePlayerId: TEST_PLAYER_IDS[0],
      turnNumber: 0,
      phase,
      dice: null,
      cardsPlayedThisTurn: 0,
      cardIdsBoughtThisTurn: [],
      setupPlacementIndex: phase.startsWith('SETUP_') ? 0 : null,
      setupPlacementVertexId: null,
    },
    progressDeck: [],
    progressDiscard: [],
    progressCards: {},
    pendingInteraction: null,
    bonuses: { longestRoadHolderId: null, largestForceHolderId: null },
    winnerId: null,
    actionHistory: [],
    random: createRandomState(config.seed),
  };
}
