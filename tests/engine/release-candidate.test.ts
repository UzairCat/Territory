import { describe, expect, it } from 'vitest';

import { PROGRESS_CARD_IDS } from '../../src/engine/content/progress-cards';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { createGame } from '../../src/engine/core/create-game';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GameState } from '../../src/engine/core/game-state';
import { actionId } from '../../src/engine/core/ids';
import { isJsonSerializable } from '../../src/engine/core/json';
import { createRandomState, randomInteger } from '../../src/engine/core/random';
import {
  getLegalSetupHouseVertexIds,
  getLegalSetupRoadEdgeIds,
} from '../../src/engine/rules/setup-rules';
import { createTestConfig } from '../helpers/game-state';

function randomForTotal(total: number, prefix: string) {
  for (let candidate = 0; candidate < 10_000; candidate += 1) {
    const state = createRandomState(`${prefix}-${candidate}`);
    const first = randomInteger(state, 1, 7);
    const second = randomInteger(first.state, 1, 7);
    if (first.value + second.value === total) return state;
  }
  throw new Error(`Could not produce deterministic total ${total}.`);
}

function completeSetup(initialState: GameState): GameState {
  let state = initialState;
  let serial = 0;
  while (state.turn.phase === 'SETUP_PLACE_HOUSE' || state.turn.phase === 'SETUP_PLACE_ROAD') {
    const actorId = state.turn.activePlayerId;
    if (actorId === null) throw new Error('Setup lost its active player.');
    const result =
      state.turn.phase === 'SETUP_PLACE_HOUSE'
        ? dispatch(state, {
            id: actionId(`release-house-${serial}`),
            type: 'PLACE_SETUP_HOUSE',
            actorId,
            vertexId: getLegalSetupHouseVertexIds(state)[0]!,
          })
        : dispatch(state, {
            id: actionId(`release-road-${serial}`),
            type: 'PLACE_SETUP_ROAD',
            actorId,
            edgeId: getLegalSetupRoadEdgeIds(state)[0]!,
          });
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    state = result.state;
    serial += 1;
  }
  return state;
}

const releaseRuns = ([2, 3, 4] as const).flatMap((playerCount) =>
  [1, 2].map((run) => ({ playerCount, seed: `release-${playerCount}-${run}` })),
);

describe('release-candidate full lifecycle', () => {
  it.each(releaseRuns)(
    'runs setup through authoritative victory for $playerCount players with $seed',
    ({ playerCount, seed }) => {
      const created = createGame({ ...createTestConfig(playerCount), seed, victoryTarget: 3 });
      if (!created.ok) throw new Error(created.issues.map((issue) => issue.message).join(', '));
      let state = completeSetup(created.state);
      const actorId = state.turn.activePlayerId;
      if (actorId === null) throw new Error('Normal play has no active player.');
      const victoryCard = Object.values(state.progressCards).find(
        (card) => card.definitionId === PROGRESS_CARD_IDS.chapel,
      );
      if (victoryCard === undefined) throw new Error('Generated deck has no Chapel.');

      state = {
        ...state,
        random: randomForTotal(5, seed),
        progressDeck: [
          victoryCard.instanceId,
          ...state.progressDeck.filter((id) => id !== victoryCard.instanceId),
        ],
        players: {
          ...state.players,
          [actorId]: {
            ...state.players[actorId]!,
            resources: resourceBundle([
              [RESOURCE_IDS.grain, 1],
              [RESOURCE_IDS.livestock, 1],
              [RESOURCE_IDS.ore, 1],
            ]),
          },
        },
      };
      const rolled = dispatch(state, {
        id: actionId(`release-roll-${seed}`),
        type: 'ROLL_DICE',
        actorId,
      });
      expect(rolled.ok).toBe(true);
      if (!rolled.ok) return;
      expect(rolled.state.turn.phase).toBe('ACTION_PHASE');

      const won = dispatch(rolled.state, {
        id: actionId(`release-win-${seed}`),
        type: 'BUY_PROGRESS_CARD',
        actorId,
      });
      expect(won.ok).toBe(true);
      if (!won.ok) return;
      expect(won.state.turn.phase).toBe('GAME_OVER');
      expect(won.state.winnerId).toBe(actorId);
      expect(won.events.some((event) => event.type === 'GAME_WON')).toBe(true);
      expect(won.state.actionHistory).toHaveLength(playerCount * 4 + 2);
      expect(isJsonSerializable(won.state)).toBe(true);
    },
  );
});
