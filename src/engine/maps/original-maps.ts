import type { MapDefinition } from '../content/types';
import { mapId } from '../core/ids';
import { CLASSIC_MODE_ID } from '../modes/classic';
import { KN_MODE_ID } from '../modes/kn';
import {
  coordinatesFromRows,
  createNumberTokenPool,
  createPortPool,
  createTerrainPool,
} from './map-utils';

const SUPPORTED_PLAYER_COUNTS = [2, 3, 4] as const;
const SUPPORTED_MODE_IDS = [CLASSIC_MODE_ID, KN_MODE_ID] as const;

export const CROWNLANDS_MAP = {
  id: mapId('crownlands'),
  displayName: 'Crownlands',
  landMassCount: 1,
  lakeCount: 1,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    {
      r: -4,
      segments: [
        [0, 0],
        [3, 3],
        [6, 6],
      ],
    },
    {
      r: -3,
      segments: [
        [-1, 0],
        [2, 3],
        [5, 6],
      ],
    },
    { r: -2, segments: [[-2, 5]] },
    {
      r: -1,
      segments: [
        [-2, 0],
        [2, 4],
      ],
    },
    { r: 0, segments: [[-3, 4]] },
    { r: 1, segments: [[-3, 3]] },
    { r: 2, segments: [[-3, 3]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 9,
    hills: 8,
    fields: 9,
    pasture: 9,
    mountains: 8,
    wasteland: 2,
  }),
  numberTokenPool: createNumberTokenPool(43),
  portPool: createPortPool(14),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const FOUR_KINGDOMS_MAP = {
  id: mapId('four-kingdoms'),
  displayName: 'Four Kingdoms',
  landMassCount: 1,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    {
      r: -4,
      segments: [
        [0, 2],
        [5, 7],
      ],
    },
    {
      r: -3,
      segments: [
        [-1, 1],
        [5, 7],
      ],
    },
    {
      r: -2,
      segments: [
        [-1, 1],
        [5, 7],
      ],
    },
    {
      r: -1,
      segments: [
        [0, 2],
        [4, 6],
      ],
    },
    { r: 0, segments: [[2, 5]] },
    {
      r: 1,
      segments: [
        [0, 2],
        [4, 6],
      ],
    },
    {
      r: 2,
      segments: [
        [-1, 1],
        [5, 7],
      ],
    },
    {
      r: 3,
      segments: [
        [-1, 1],
        [5, 7],
      ],
    },
    {
      r: 4,
      segments: [
        [0, 2],
        [5, 7],
      ],
    },
  ]),
  terrainPool: createTerrainPool({
    forest: 10,
    hills: 10,
    fields: 10,
    pasture: 10,
    mountains: 9,
    wasteland: 3,
  }),
  numberTokenPool: createNumberTokenPool(49),
  portPool: createPortPool(16),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const CRESCENT_BAY_MAP = {
  id: mapId('crescent-bay'),
  displayName: 'Crescent Bay',
  landMassCount: 1,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -4, segments: [[0, 4]] },
    { r: -3, segments: [[-1, 4]] },
    { r: -2, segments: [[-2, 1]] },
    { r: -1, segments: [[-3, 0]] },
    { r: 0, segments: [[-3, 0]] },
    { r: 1, segments: [[-3, 0]] },
    { r: 2, segments: [[-3, 1]] },
    { r: 3, segments: [[-2, 3]] },
    { r: 4, segments: [[-1, 3]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 9,
    hills: 8,
    fields: 8,
    pasture: 8,
    mountains: 8,
    wasteland: 2,
  }),
  numberTokenPool: createNumberTokenPool(41),
  portPool: createPortPool(13),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const CITADEL_MAP = {
  id: mapId('citadel'),
  displayName: 'Citadel',
  landMassCount: 1,
  lakeCount: 1,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    {
      r: -3,
      segments: [
        [-2, -1],
        [1, 2],
      ],
    },
    { r: -2, segments: [[-3, 3]] },
    {
      r: -1,
      segments: [
        [-3, -1],
        [1, 3],
      ],
    },
    {
      r: 0,
      segments: [
        [-4, -1],
        [1, 4],
      ],
    },
    {
      r: 1,
      segments: [
        [-4, -1],
        [1, 3],
      ],
    },
    { r: 2, segments: [[-3, 3]] },
    {
      r: 3,
      segments: [
        [-2, -1],
        [1, 2],
      ],
    },
  ]),
  terrainPool: createTerrainPool({
    forest: 9,
    hills: 8,
    fields: 8,
    pasture: 8,
    mountains: 8,
    wasteland: 2,
  }),
  numberTokenPool: createNumberTokenPool(41),
  portPool: createPortPool(12),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const RIFT_MAP = {
  id: mapId('rift'),
  displayName: 'Rift',
  landMassCount: 1,
  lakeCount: 1,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    {
      r: -4,
      segments: [
        [-2, -2],
        [2, 2],
      ],
    },
    {
      r: -3,
      segments: [
        [-3, -1],
        [1, 3],
      ],
    },
    {
      r: -2,
      segments: [
        [-3, -2],
        [2, 3],
      ],
    },
    { r: -1, segments: [[-3, 3]] },
    {
      r: 0,
      segments: [
        [-3, -1],
        [1, 3],
      ],
    },
    {
      r: 1,
      segments: [
        [-3, -1],
        [1, 3],
      ],
    },
    { r: 2, segments: [[-3, 3]] },
    {
      r: 3,
      segments: [
        [-3, -2],
        [2, 3],
      ],
    },
    {
      r: 4,
      segments: [
        [-3, -1],
        [1, 3],
      ],
    },
  ]),
  terrainPool: createTerrainPool({
    forest: 10,
    hills: 10,
    fields: 9,
    pasture: 9,
    mountains: 8,
    wasteland: 2,
  }),
  numberTokenPool: createNumberTokenPool(46),
  portPool: createPortPool(15),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const DRAGONS_SPINE_MAP = {
  id: mapId('dragons-spine'),
  displayName: "Dragon's Spine",
  landMassCount: 1,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -6, segments: [[4, 4]] },
    { r: -5, segments: [[2, 5]] },
    { r: -4, segments: [[1, 5]] },
    {
      r: -3,
      segments: [
        [-3, -2],
        [0, 3],
      ],
    },
    { r: -2, segments: [[-2, 3]] },
    { r: -1, segments: [[-3, 2]] },
    { r: 0, segments: [[-4, 1]] },
    { r: 1, segments: [[-5, 0]] },
    { r: 2, segments: [[-5, -1]] },
    { r: 3, segments: [[-6, -3]] },
    { r: 4, segments: [[-7, -4]] },
    { r: 5, segments: [[-8, -6]] },
    { r: 6, segments: [[-9, -8]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 11,
    hills: 11,
    fields: 11,
    pasture: 11,
    mountains: 11,
    wasteland: 3,
  }),
  numberTokenPool: createNumberTokenPool(55),
  portPool: createPortPool(18),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const COMPASS_ROSE_MAP = {
  id: mapId('compass-rose'),
  displayName: 'Compass Rose',
  landMassCount: 1,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -4, segments: [[1, 1]] },
    { r: -3, segments: [[0, 2]] },
    { r: -2, segments: [[-2, 2]] },
    { r: -1, segments: [[-4, 4]] },
    { r: 0, segments: [[-5, 4]] },
    { r: 1, segments: [[-5, 3]] },
    { r: 2, segments: [[-4, 0]] },
    { r: 3, segments: [[-3, -1]] },
    { r: 4, segments: [[-3, -3]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 9,
    hills: 9,
    fields: 9,
    pasture: 9,
    mountains: 8,
    wasteland: 2,
  }),
  numberTokenPool: createNumberTokenPool(44),
  portPool: createPortPool(16),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const HOURGLASS_MAP = {
  id: mapId('hourglass'),
  displayName: 'Hourglass',
  landMassCount: 1,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -4, segments: [[0, 4]] },
    { r: -3, segments: [[-1, 4]] },
    { r: -2, segments: [[-1, 3]] },
    { r: -1, segments: [[0, 2]] },
    { r: 0, segments: [[0, 0]] },
    { r: 1, segments: [[-2, 0]] },
    { r: 2, segments: [[-3, 1]] },
    { r: 3, segments: [[-4, 1]] },
    { r: 4, segments: [[-4, 0]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 8,
    hills: 7,
    fields: 8,
    pasture: 7,
    mountains: 7,
    wasteland: 2,
  }),
  numberTokenPool: createNumberTokenPool(37),
  portPool: createPortPool(12),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const CLOVER_MAP = {
  id: mapId('clover'),
  displayName: 'Clover',
  landMassCount: 1,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -4, segments: [[1, 2]] },
    { r: -3, segments: [[0, 2]] },
    { r: -2, segments: [[0, 2]] },
    { r: -1, segments: [[-3, 4]] },
    { r: 0, segments: [[-4, 4]] },
    { r: 1, segments: [[-4, 3]] },
    { r: 2, segments: [[-2, 0]] },
    { r: 3, segments: [[-2, 0]] },
    { r: 4, segments: [[-2, -1]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 8,
    hills: 8,
    fields: 8,
    pasture: 7,
    mountains: 8,
    wasteland: 2,
  }),
  numberTokenPool: createNumberTokenPool(39),
  portPool: createPortPool(12),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const GREAT_RIVER_MAP = {
  id: mapId('great-river'),
  displayName: 'Great River',
  landMassCount: 2,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    {
      r: -4,
      segments: [
        [0, 1],
        [3, 4],
      ],
    },
    {
      r: -3,
      segments: [
        [-1, 1],
        [3, 5],
      ],
    },
    {
      r: -2,
      segments: [
        [-2, 0],
        [2, 5],
      ],
    },
    {
      r: -1,
      segments: [
        [-3, 0],
        [2, 4],
      ],
    },
    {
      r: 0,
      segments: [
        [-4, -1],
        [1, 4],
      ],
    },
    {
      r: 1,
      segments: [
        [-4, -1],
        [1, 3],
      ],
    },
    {
      r: 2,
      segments: [
        [-5, -2],
        [0, 2],
      ],
    },
    {
      r: 3,
      segments: [
        [-5, -2],
        [0, 1],
      ],
    },
    {
      r: 4,
      segments: [
        [-5, -3],
        [-1, -1],
      ],
    },
  ]),
  terrainPool: createTerrainPool({
    forest: 11,
    hills: 11,
    fields: 11,
    pasture: 10,
    mountains: 10,
    wasteland: 3,
  }),
  numberTokenPool: createNumberTokenPool(53),
  portPool: createPortPool(17),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;
