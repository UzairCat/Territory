import type { BuildingDefinition, BuildingType } from './types';
import { resourceBundle } from './types';
import { RESOURCE_IDS } from './resources';

export const BUILDING_DEFINITIONS = {
  ROAD: {
    type: 'ROAD',
    displayName: 'Road',
    cost: resourceBundle([
      [RESOURCE_IDS.wood, 1],
      [RESOURCE_IDS.brick, 1],
    ]),
    initialSupply: 15,
    victoryPoints: 0,
    productionMultiplier: 0,
  },
  HOUSE: {
    type: 'HOUSE',
    displayName: 'House',
    cost: resourceBundle([
      [RESOURCE_IDS.wood, 1],
      [RESOURCE_IDS.brick, 1],
      [RESOURCE_IDS.grain, 1],
      [RESOURCE_IDS.livestock, 1],
    ]),
    initialSupply: 5,
    victoryPoints: 1,
    productionMultiplier: 1,
  },
  MANSION: {
    type: 'MANSION',
    displayName: 'City',
    cost: resourceBundle([
      [RESOURCE_IDS.grain, 2],
      [RESOURCE_IDS.ore, 3],
    ]),
    initialSupply: 4,
    victoryPoints: 2,
    productionMultiplier: 2,
  },
} as const satisfies Readonly<Record<BuildingType, BuildingDefinition>>;

export const BUILDINGS: readonly BuildingDefinition[] = Object.values(BUILDING_DEFINITIONS);
