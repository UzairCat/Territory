import { resourceId, terrainId } from '../core/ids';
import type { ResourceDefinition, TerrainDefinition } from './types';

export const RESOURCE_IDS = {
  wood: resourceId('wood'),
  brick: resourceId('brick'),
  grain: resourceId('grain'),
  livestock: resourceId('livestock'),
  ore: resourceId('ore'),
} as const;

export const RESOURCES: readonly ResourceDefinition[] = [
  { id: RESOURCE_IDS.wood, displayName: 'Wood', color: '#3f7447', iconKey: 'wood' },
  { id: RESOURCE_IDS.brick, displayName: 'Brick', color: '#ad5542', iconKey: 'brick' },
  { id: RESOURCE_IDS.grain, displayName: 'Grain', color: '#d7ad4d', iconKey: 'grain' },
  {
    id: RESOURCE_IDS.livestock,
    displayName: 'Livestock',
    color: '#8ead69',
    iconKey: 'livestock',
  },
  { id: RESOURCE_IDS.ore, displayName: 'Ore', color: '#727985', iconKey: 'ore' },
] as const;

export const TERRAIN_IDS = {
  forest: terrainId('forest'),
  hills: terrainId('hills'),
  fields: terrainId('fields'),
  pasture: terrainId('pasture'),
  mountains: terrainId('mountains'),
  wasteland: terrainId('wasteland'),
} as const;

export const TERRAINS: readonly TerrainDefinition[] = [
  {
    id: TERRAIN_IDS.forest,
    displayName: 'Forest',
    resourceId: RESOURCE_IDS.wood,
    color: '#315f3c',
  },
  {
    id: TERRAIN_IDS.hills,
    displayName: 'Hills',
    resourceId: RESOURCE_IDS.brick,
    color: '#9a503f',
  },
  {
    id: TERRAIN_IDS.fields,
    displayName: 'Fields',
    resourceId: RESOURCE_IDS.grain,
    color: '#cda642',
  },
  {
    id: TERRAIN_IDS.pasture,
    displayName: 'Pasture',
    resourceId: RESOURCE_IDS.livestock,
    color: '#7e9f5b',
  },
  {
    id: TERRAIN_IDS.mountains,
    displayName: 'Mountains',
    resourceId: RESOURCE_IDS.ore,
    color: '#676f7a',
  },
  {
    id: TERRAIN_IDS.wasteland,
    displayName: 'Wasteland',
    resourceId: null,
    color: '#b79b69',
  },
] as const;
