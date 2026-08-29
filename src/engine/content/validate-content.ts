import { CLASSIC_MODE } from '../modes/classic';
import type { ResourceId } from '../core/ids';
import { MAPS } from '../maps/maps';
import { coordinateLakeCount, coordinateLandMasses, getMapPortPlacements } from '../maps/map-utils';
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
  const terrainIds = new Set(TERRAINS.map((terrain) => terrain.id));

  if (RESOURCES.length !== 5 || resourceIds.size !== RESOURCES.length) {
    issues.push(
      issue('INVALID_RESOURCES', 'Classic mode requires five uniquely identified resources.'),
    );
  }

  if (TERRAINS.length !== 6 || !TERRAINS.some((terrain) => terrain.id === TERRAIN_IDS.wasteland)) {
    issues.push(issue('INVALID_TERRAINS', 'Maps require five producing terrains and a wasteland.'));
  }

  for (const map of MAPS) {
    const coordinateKeys = new Set(
      map.coordinates.map((coordinate) => `${coordinate.q},${coordinate.r}`),
    );
    const wastelandCount = map.terrainPool.filter(
      (terrainId) => terrainId === TERRAIN_IDS.wasteland,
    ).length;
    if (coordinateKeys.size !== map.coordinates.length) {
      issues.push(
        issue('INVALID_COORDINATES', `${map.displayName} requires unique axial coordinates.`),
      );
    }
    if (
      map.terrainPool.length !== map.coordinates.length ||
      map.terrainPool.some((terrainId) => !terrainIds.has(terrainId)) ||
      wastelandCount < 1
    ) {
      issues.push(
        issue(
          'INVALID_TERRAIN_POOL',
          `${map.displayName} must define one known terrain for every tile and a wasteland.`,
        ),
      );
    }
    if (
      map.numberTokenPool.length !== map.coordinates.length - wastelandCount ||
      map.numberTokenPool.some(
        (token) => !Number.isSafeInteger(token) || token < 2 || token > 12 || token === 7,
      )
    ) {
      issues.push(
        issue(
          'INVALID_TOKEN_POOL',
          `${map.displayName} must define one valid number token per producing tile.`,
        ),
      );
    }
    if (
      map.portPool.length < 1 ||
      map.portPool.some(
        (port) =>
          (port.resourceId === null && port.tradeRatio !== 3) ||
          (port.resourceId !== null &&
            (port.tradeRatio !== 2 || !resourceIds.has(port.resourceId))),
      )
    ) {
      issues.push(
        issue('INVALID_PORT_POOL', `${map.displayName} contains an invalid port definition.`),
      );
    }
    if (coordinateLandMasses(map.coordinates).length !== map.landMassCount) {
      issues.push(
        issue(
          'INVALID_LAND_MASS_COUNT',
          `${map.displayName} does not match its declared landmass count.`,
        ),
      );
    }
    if (
      map.lakeCount !== undefined &&
      (!Number.isSafeInteger(map.lakeCount) ||
        map.lakeCount < 0 ||
        coordinateLakeCount(map.coordinates) !== map.lakeCount)
    ) {
      issues.push(
        issue('INVALID_LAKE_COUNT', `${map.displayName} does not match its declared lake count.`),
      );
    }
    try {
      if (getMapPortPlacements(map).length !== map.portPool.length) {
        issues.push(issue('INVALID_PORT_PLACEMENT', `${map.displayName} cannot place every port.`));
      }
    } catch (error) {
      issues.push(
        issue(
          'INVALID_PORT_PLACEMENT',
          error instanceof Error
            ? `${map.displayName}: ${error.message}`
            : `${map.displayName} cannot place every port.`,
        ),
      );
    }
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
