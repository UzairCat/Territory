import { mapId } from '../core/ids';
import { TERRAIN_IDS } from '../content/resources';
import type { AxialCoordinate, MapDefinition } from '../content/types';
import { CLASSIC_MODE_ID } from '../modes/classic';
import { KN_MODE_ID } from '../modes/kn';
import { createPortPool } from './map-utils';

export const BASE_MAP_ID = mapId('base-map');

export const BASE_MAP_COORDINATES: readonly AxialCoordinate[] = [
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },
  { q: -1, r: -1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 2, r: -1 },
  { q: -2, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: -2, r: 1 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },
  { q: -2, r: 2 },
  { q: -1, r: 2 },
  { q: 0, r: 2 },
] as const;

const TERRAIN_POOL = [
  ...Array.from({ length: 4 }, () => TERRAIN_IDS.forest),
  ...Array.from({ length: 3 }, () => TERRAIN_IDS.hills),
  ...Array.from({ length: 4 }, () => TERRAIN_IDS.fields),
  ...Array.from({ length: 4 }, () => TERRAIN_IDS.pasture),
  ...Array.from({ length: 3 }, () => TERRAIN_IDS.mountains),
  TERRAIN_IDS.wasteland,
] as const;

export const BASE_MAP = {
  id: BASE_MAP_ID,
  displayName: 'Base - Small',
  landMassCount: 1,
  supportedPlayerCounts: [2, 3, 4],
  supportedModeIds: [CLASSIC_MODE_ID, KN_MODE_ID],
  coordinates: BASE_MAP_COORDINATES,
  terrainPool: TERRAIN_POOL,
  numberTokenPool: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
  portPool: createPortPool(9),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;
