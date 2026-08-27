import { BASE_MAP } from '../maps/base-map';
import { CLASSIC_MODE } from '../modes/classic';
import type { ResourceId } from '../core/ids';
import { BUILDINGS } from './buildings';
import { PROGRESS_CARDS } from './progress-cards';
import { RESOURCES, TERRAIN_IDS, TERRAINS } from './resources';

export interface ContentValidationIssue {
  readonly code: string;
  readonly message: string;
}

function issue(code: string, message: string): ContentValidationIssue {
  return { code, message };
}

export function validateClassicContent(): readonly ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  const resourceIds = new Set(RESOURCES.map((resource) => resource.id));
  const coordinateKeys = new Set(
    BASE_MAP.coordinates.map((coordinate) => `${coordinate.q},${coordinate.r}`),
  );

  if (RESOURCES.length !== 5 || resourceIds.size !== RESOURCES.length) {
    issues.push(
      issue('INVALID_RESOURCES', 'Classic mode requires five uniquely identified resources.'),
    );
  }

  if (TERRAINS.length !== 6 || !TERRAINS.some((terrain) => terrain.id === TERRAIN_IDS.wasteland)) {
    issues.push(
      issue('INVALID_TERRAINS', 'Base Map requires five producing terrains and a wasteland.'),
    );
  }

  if (BASE_MAP.coordinates.length !== 19 || coordinateKeys.size !== 19) {
    issues.push(issue('INVALID_COORDINATES', 'Base Map requires 19 unique axial coordinates.'));
  }

  if (BASE_MAP.terrainPool.length !== 19) {
    issues.push(issue('INVALID_TERRAIN_POOL', 'Base Map terrain pool must contain 19 tiles.'));
  }

  if (BASE_MAP.numberTokenPool.length !== 18) {
    issues.push(issue('INVALID_TOKEN_POOL', 'Base Map must contain 18 producing number tokens.'));
  }

  if (BASE_MAP.portPool.length !== 9) {
    issues.push(issue('INVALID_PORT_POOL', 'Base Map must contain nine ports.'));
  }

  const specificPorts = BASE_MAP.portPool.filter((port) => port.resourceId !== null);
  const genericPorts = BASE_MAP.portPool.filter((port) => port.resourceId === null);

  if (specificPorts.length !== 5 || genericPorts.length !== 4) {
    issues.push(
      issue('INVALID_PORT_DISTRIBUTION', 'Ports must contain five 2:1 and four 3:1 entries.'),
    );
  }

  for (const building of BUILDINGS) {
    if (building.initialSupply <= 0) {
      issues.push(
        issue('INVALID_PIECE_SUPPLY', `${building.displayName} supply must be positive.`),
      );
    }

    for (const [resourceId, amount] of Object.entries(building.cost)) {
      if (amount === undefined || !resourceIds.has(resourceId as ResourceId) || amount <= 0) {
        issues.push(issue('INVALID_BUILDING_COST', `${building.displayName} has an invalid cost.`));
      }
    }
  }

  const deckSize = PROGRESS_CARDS.reduce((total, card) => total + card.count, 0);
  if (deckSize !== 25) {
    issues.push(issue('INVALID_PROGRESS_DECK', 'Classic progress deck must contain 25 cards.'));
  }

  if (
    CLASSIC_MODE.rules.playerCount.minimum !== 2 ||
    CLASSIC_MODE.rules.playerCount.maximum !== 4 ||
    CLASSIC_MODE.rules.victoryTarget !== 10
  ) {
    issues.push(
      issue('INVALID_CLASSIC_LIMITS', 'Classic mode must support 2–4 players and target 10 VP.'),
    );
  }

  return issues;
}
