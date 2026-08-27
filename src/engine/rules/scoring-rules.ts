import { BUILDING_DEFINITIONS } from '../content/buildings';
import type { GameState } from '../core/game-state';
import type { PlayerId } from '../core/ids';

export function calculatePublicScore(state: GameState, playerId: PlayerId): number {
  const buildingScore = Object.values(state.board.vertices).reduce((total, vertex) => {
    if (vertex.building?.ownerId !== playerId) return total;
    return total + BUILDING_DEFINITIONS[vertex.building.type].victoryPoints;
  }, 0);
  const bonusScore =
    (state.bonuses.longestRoadHolderId === playerId
      ? state.config.rules.longestRoad.victoryPoints
      : 0) +
    (state.bonuses.largestForceHolderId === playerId
      ? state.config.rules.largestForce.victoryPoints
      : 0);

  return buildingScore + bonusScore;
}
