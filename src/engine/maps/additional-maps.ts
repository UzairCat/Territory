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

export const BASE_MEDIUM_MAP = {
  id: mapId('base-medium'),
  displayName: 'Base - Medium',
  landMassCount: 1,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -3, segments: [[0, 2]] },
    { r: -2, segments: [[-1, 2]] },
    { r: -1, segments: [[-2, 2]] },
    { r: 0, segments: [[-3, 2]] },
    { r: 1, segments: [[-3, 1]] },
    { r: 2, segments: [[-3, 0]] },
    { r: 3, segments: [[-3, -1]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 6,
    hills: 5,
    fields: 6,
    pasture: 6,
    mountains: 5,
    wasteland: 2,
  }),
  numberTokenPool: createNumberTokenPool(28),
  portPool: createPortPool(11),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const BASE_LARGE_MAP = {
  id: mapId('base-large'),
  displayName: 'Base - Large',
  landMassCount: 1,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -3, segments: [[0, 3]] },
    { r: -2, segments: [[-1, 3]] },
    { r: -1, segments: [[-2, 3]] },
    { r: 0, segments: [[-3, 3]] },
    { r: 1, segments: [[-3, 2]] },
    { r: 2, segments: [[-3, 1]] },
    { r: 3, segments: [[-3, 0]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 8,
    hills: 6,
    fields: 7,
    pasture: 8,
    mountains: 6,
    wasteland: 2,
  }),
  numberTokenPool: createNumberTokenPool(35),
  portPool: createPortPool(12),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const EARTH_MAP = {
  id: mapId('earth'),
  displayName: 'Earth',
  landMassCount: 7,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    {
      r: -4,
      segments: [
        [-2, -1],
        [1, 2],
        [4, 4],
        [7, 7],
      ],
    },
    {
      r: -3,
      segments: [
        [-5, -2],
        [1, 2],
        [5, 7],
      ],
    },
    {
      r: -2,
      segments: [
        [-6, -1],
        [1, 1],
        [3, 9],
      ],
    },
    {
      r: -1,
      segments: [
        [-6, -2],
        [2, 7],
      ],
    },
    {
      r: 0,
      segments: [
        [-5, -3],
        [0, 6],
        [8, 8],
      ],
    },
    {
      r: 1,
      segments: [
        [-5, -5],
        [-1, 1],
        [3, 3],
        [5, 5],
        [7, 7],
      ],
    },
    {
      r: 2,
      segments: [
        [-5, -4],
        [-2, 1],
      ],
    },
    {
      r: 3,
      segments: [
        [-5, -4],
        [-1, 0],
        [3, 4],
      ],
    },
    {
      r: 4,
      segments: [
        [-6, -5],
        [-2, -1],
        [2, 4],
      ],
    },
    {
      r: 5,
      segments: [
        [-6, -6],
        [-2, -2],
        [0, 0],
        [3, 3],
      ],
    },
  ]),
  terrainPool: createTerrainPool({
    forest: 16,
    hills: 16,
    fields: 14,
    pasture: 16,
    mountains: 14,
    wasteland: 5,
  }),
  numberTokenPool: createNumberTokenPool(76),
  portPool: createPortPool(27),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const USA_MAP = {
  id: mapId('usa'),
  displayName: 'USA',
  landMassCount: 1,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -5, segments: [[-6, 5]] },
    {
      r: -4,
      segments: [
        [-7, 6],
        [12, 12],
      ],
    },
    {
      r: -3,
      segments: [
        [-7, 6],
        [9, 11],
      ],
    },
    {
      r: -2,
      segments: [
        [-8, 5],
        [8, 10],
      ],
    },
    { r: -1, segments: [[-8, 8]] },
    { r: 0, segments: [[-8, 7]] },
    { r: 1, segments: [[-8, 6]] },
    { r: 2, segments: [[-8, 5]] },
    { r: 3, segments: [[-7, 4]] },
    {
      r: 4,
      segments: [
        [-4, 0],
        [3, 3],
      ],
    },
    {
      r: 5,
      segments: [
        [-3, -3],
        [3, 3],
      ],
    },
    { r: 6, segments: [[3, 3]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 29,
    hills: 29,
    fields: 28,
    pasture: 29,
    mountains: 28,
    wasteland: 1,
  }),
  numberTokenPool: createNumberTokenPool(143),
  portPool: createPortPool(25),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const UK_IRELAND_MAP = {
  id: mapId('uk-ireland'),
  displayName: 'UK & Ireland',
  landMassCount: 3,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -6, segments: [[4, 5]] },
    {
      r: -5,
      segments: [
        [1, 1],
        [3, 4],
      ],
    },
    { r: -4, segments: [[3, 6]] },
    { r: -3, segments: [[2, 5]] },
    { r: -2, segments: [[1, 4]] },
    { r: -1, segments: [[2, 3]] },
    {
      r: 0,
      segments: [
        [-3, -2],
        [1, 3],
      ],
    },
    {
      r: 1,
      segments: [
        [-5, -2],
        [1, 2],
      ],
    },
    {
      r: 2,
      segments: [
        [-5, -3],
        [0, 2],
      ],
    },
    {
      r: 3,
      segments: [
        [-6, -3],
        [-1, 2],
      ],
    },
    {
      r: 4,
      segments: [
        [-7, -5],
        [-2, 3],
      ],
    },
    { r: 5, segments: [[-1, 2]] },
    { r: 6, segments: [[-2, 1]] },
    { r: 7, segments: [[-4, -3]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 13,
    hills: 10,
    fields: 13,
    pasture: 14,
    mountains: 10,
    wasteland: 3,
  }),
  numberTokenPool: createNumberTokenPool(60),
  portPool: createPortPool(20),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const DIAMOND_MAP = {
  id: mapId('diamond'),
  displayName: 'Diamond',
  landMassCount: 1,
  lakeCount: 1,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -2, segments: [[0, 4]] },
    { r: -1, segments: [[0, 4]] },
    {
      r: 0,
      segments: [
        [0, 1],
        [3, 4],
      ],
    },
    { r: 1, segments: [[0, 4]] },
    { r: 2, segments: [[0, 4]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 5,
    hills: 4,
    fields: 5,
    pasture: 5,
    mountains: 4,
    wasteland: 1,
  }),
  numberTokenPool: createNumberTokenPool(23),
  portPool: createPortPool(9),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const GEAR_MAP = {
  id: mapId('gear'),
  displayName: 'Gear',
  landMassCount: 1,
  lakeCount: 4,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    {
      r: -4,
      segments: [
        [0, 0],
        [2, 2],
        [4, 4],
      ],
    },
    { r: -3, segments: [[-1, 4]] },
    {
      r: -2,
      segments: [
        [-1, -1],
        [1, 1],
        [3, 3],
      ],
    },
    {
      r: -1,
      segments: [
        [-3, -2],
        [0, 1],
        [3, 4],
      ],
    },
    { r: 0, segments: [[-3, 3]] },
    {
      r: 1,
      segments: [
        [-4, -3],
        [-1, 0],
        [2, 3],
      ],
    },
    {
      r: 2,
      segments: [
        [-3, -3],
        [-1, -1],
        [1, 1],
      ],
    },
    { r: 3, segments: [[-4, 1]] },
    {
      r: 4,
      segments: [
        [-4, -4],
        [-2, -2],
        [0, 0],
      ],
    },
  ]),
  terrainPool: createTerrainPool({
    forest: 9,
    hills: 7,
    fields: 7,
    pasture: 10,
    mountains: 9,
    wasteland: 1,
  }),
  numberTokenPool: createNumberTokenPool(42),
  portPool: createPortPool(14),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const LAKES_MAP = {
  id: mapId('lakes'),
  displayName: 'Lakes',
  landMassCount: 1,
  lakeCount: 4,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -3, segments: [[-1, 4]] },
    {
      r: -2,
      segments: [
        [-2, -1],
        [1, 1],
        [3, 4],
      ],
    },
    {
      r: -1,
      segments: [
        [-3, -2],
        [0, 1],
        [3, 4],
      ],
    },
    { r: 0, segments: [[-2, 2]] },
    {
      r: 1,
      segments: [
        [-4, -3],
        [-1, 0],
        [2, 3],
      ],
    },
    {
      r: 2,
      segments: [
        [-4, -3],
        [-1, -1],
        [1, 2],
      ],
    },
    { r: 3, segments: [[-4, 1]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 8,
    hills: 7,
    fields: 7,
    pasture: 7,
    mountains: 9,
    wasteland: 1,
  }),
  numberTokenPool: createNumberTokenPool(38),
  portPool: createPortPool(9),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const POND_MAP = {
  id: mapId('pond'),
  displayName: 'Pond',
  landMassCount: 1,
  lakeCount: 1,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -2, segments: [[0, 5]] },
    {
      r: -1,
      segments: [
        [0, 1],
        [3, 4],
      ],
    },
    {
      r: 0,
      segments: [
        [-1, 0],
        [3, 4],
      ],
    },
    {
      r: 1,
      segments: [
        [-1, 0],
        [2, 3],
      ],
    },
    { r: 2, segments: [[-2, 3]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 5,
    hills: 5,
    fields: 5,
    pasture: 4,
    mountains: 4,
    wasteland: 1,
  }),
  numberTokenPool: createNumberTokenPool(23),
  portPool: createPortPool(8),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const TWIRL_MAP = {
  id: mapId('twirl'),
  displayName: 'Twirl',
  landMassCount: 1,
  lakeCount: 1,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -4, segments: [[1, 1]] },
    { r: -3, segments: [[0, 5]] },
    {
      r: -2,
      segments: [
        [-3, -3],
        [-1, 3],
      ],
    },
    {
      r: -1,
      segments: [
        [-3, 0],
        [2, 3],
      ],
    },
    {
      r: 0,
      segments: [
        [-3, -2],
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
    { r: 2, segments: [[-3, 1]] },
    { r: 3, segments: [[-4, 0]] },
    { r: 4, segments: [[-1, -1]] },
    { r: 5, segments: [[-2, -2]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 10,
    hills: 8,
    fields: 6,
    pasture: 8,
    mountains: 7,
    wasteland: 3,
  }),
  numberTokenPool: createNumberTokenPool(39),
  portPool: createPortPool(12),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;
