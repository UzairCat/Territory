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

export const ATOLL_MAP = {
  id: mapId('atoll'),
  displayName: 'Atoll',
  landMassCount: 1,
  lakeCount: 1,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -4, segments: [[1, 3]] },
    { r: -3, segments: [[0, 4]] },
    {
      r: -2,
      segments: [
        [-1, 0],
        [4, 5],
      ],
    },
    {
      r: -1,
      segments: [
        [-2, -1],
        [5, 6],
      ],
    },
    {
      r: 0,
      segments: [
        [-2, -1],
        [5, 6],
      ],
    },
    {
      r: 1,
      segments: [
        [-3, -2],
        [4, 5],
      ],
    },
    {
      r: 2,
      segments: [
        [-3, -1],
        [3, 4],
      ],
    },
    { r: 3, segments: [[-3, 3]] },
    { r: 4, segments: [[-2, 2]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 8,
    hills: 8,
    fields: 8,
    pasture: 8,
    mountains: 7,
    wasteland: 2,
  }),
  numberTokenPool: createNumberTokenPool(39),
  portPool: createPortPool(12),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const ARCHIPELAGO_MAP = {
  id: mapId('archipelago'),
  displayName: 'Archipelago',
  landMassCount: 3,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    {
      r: -5,
      segments: [
        [-3, -1],
        [5, 6],
      ],
    },
    {
      r: -4,
      segments: [
        [-4, 0],
        [4, 7],
      ],
    },
    {
      r: -3,
      segments: [
        [-4, 0],
        [4, 7],
      ],
    },
    {
      r: -2,
      segments: [
        [-3, -1],
        [5, 6],
      ],
    },
    { r: 0, segments: [[0, 2]] },
    { r: 1, segments: [[-1, 3]] },
    { r: 2, segments: [[-2, 3]] },
    { r: 3, segments: [[-2, 2]] },
    { r: 4, segments: [[-1, 1]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 10,
    hills: 9,
    fields: 9,
    pasture: 10,
    mountains: 9,
    wasteland: 3,
  }),
  numberTokenPool: createNumberTokenPool(47),
  portPool: createPortPool(15),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const TWIN_FJORDS_MAP = {
  id: mapId('twin-fjords'),
  displayName: 'Twin Fjords',
  landMassCount: 1,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -4, segments: [[-1, 5]] },
    { r: -3, segments: [[-2, 6]] },
    {
      r: -2,
      segments: [
        [-3, 0],
        [2, 3],
        [5, 7],
      ],
    },
    {
      r: -1,
      segments: [
        [-3, -1],
        [2, 3],
        [6, 7],
      ],
    },
    {
      r: 0,
      segments: [
        [-4, -2],
        [2, 3],
        [6, 8],
      ],
    },
    {
      r: 1,
      segments: [
        [-4, -2],
        [2, 3],
        [7, 8],
      ],
    },
    {
      r: 2,
      segments: [
        [-3, -3],
        [2, 2],
        [7, 7],
      ],
    },
  ]),
  terrainPool: createTerrainPool({
    forest: 9,
    hills: 10,
    fields: 9,
    pasture: 10,
    mountains: 9,
    wasteland: 3,
  }),
  numberTokenPool: createNumberTokenPool(47),
  portPool: createPortPool(15),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const TWIN_LAKES_MAP = {
  id: mapId('twin-lakes'),
  displayName: 'Twin Lakes',
  landMassCount: 1,
  lakeCount: 2,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -4, segments: [[0, 4]] },
    { r: -3, segments: [[-1, 5]] },
    {
      r: -2,
      segments: [
        [-2, -1],
        [1, 2],
        [4, 6],
      ],
    },
    {
      r: -1,
      segments: [
        [-2, -1],
        [1, 2],
        [5, 6],
      ],
    },
    {
      r: 0,
      segments: [
        [-3, -1],
        [1, 2],
        [5, 6],
      ],
    },
    { r: 1, segments: [[-3, 6]] },
    { r: 2, segments: [[-2, 5]] },
    { r: 3, segments: [[-1, 4]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 11,
    hills: 10,
    fields: 11,
    pasture: 10,
    mountains: 11,
    wasteland: 3,
  }),
  numberTokenPool: createNumberTokenPool(53),
  portPool: createPortPool(16),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const STEPPING_STONES_MAP = {
  id: mapId('stepping-stones'),
  displayName: 'Stepping Stones',
  landMassCount: 4,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -5, segments: [[-5, -3]] },
    { r: -4, segments: [[-6, -3]] },
    {
      r: -3,
      segments: [
        [-6, -4],
        [5, 7],
      ],
    },
    { r: -2, segments: [[4, 7]] },
    { r: -1, segments: [[4, 6]] },
    { r: 1, segments: [[-6, -4]] },
    { r: 2, segments: [[-7, -4]] },
    {
      r: 3,
      segments: [
        [-7, -5],
        [4, 6],
      ],
    },
    { r: 4, segments: [[3, 6]] },
    { r: 5, segments: [[3, 5]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 8,
    hills: 8,
    fields: 8,
    pasture: 7,
    mountains: 7,
    wasteland: 2,
  }),
  numberTokenPool: createNumberTokenPool(38),
  portPool: createPortPool(12),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const THE_NARROWS_MAP = {
  id: mapId('the-narrows'),
  displayName: 'The Narrows',
  landMassCount: 2,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -5, segments: [[1, 4]] },
    { r: -4, segments: [[0, 5]] },
    { r: -3, segments: [[-1, 5]] },
    { r: -2, segments: [[-2, 4]] },
    { r: -1, segments: [[-2, 2]] },
    { r: 1, segments: [[-3, 1]] },
    { r: 2, segments: [[-4, 2]] },
    { r: 3, segments: [[-4, 3]] },
    { r: 4, segments: [[-3, 2]] },
    { r: 5, segments: [[-2, 1]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 12,
    hills: 11,
    fields: 11,
    pasture: 11,
    mountains: 11,
    wasteland: 3,
  }),
  numberTokenPool: createNumberTokenPool(56),
  portPool: createPortPool(18),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const KEYHOLE_MAP = {
  id: mapId('keyhole'),
  displayName: 'Keyhole',
  landMassCount: 1,
  lakeCount: 1,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -6, segments: [[2, 3]] },
    { r: -5, segments: [[1, 3]] },
    { r: -4, segments: [[1, 3]] },
    { r: -3, segments: [[0, 3]] },
    { r: -2, segments: [[-1, 4]] },
    { r: -1, segments: [[-2, 5]] },
    {
      r: 0,
      segments: [
        [-3, -1],
        [2, 6],
      ],
    },
    {
      r: 1,
      segments: [
        [-3, -1],
        [3, 6],
      ],
    },
    { r: 2, segments: [[-2, 5]] },
    { r: 3, segments: [[-1, 4]] },
    { r: 4, segments: [[0, 3]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 11,
    hills: 11,
    fields: 12,
    pasture: 11,
    mountains: 11,
    wasteland: 3,
  }),
  numberTokenPool: createNumberTokenPool(56),
  portPool: createPortPool(17),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;

export const CANYONLANDS_MAP = {
  id: mapId('canyonlands'),
  displayName: 'Canyonlands',
  landMassCount: 1,
  lakeCount: 0,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    {
      r: -4,
      segments: [
        [0, 1],
        [3, 5],
      ],
    },
    {
      r: -3,
      segments: [
        [-1, 1],
        [3, 6],
      ],
    },
    {
      r: -2,
      segments: [
        [-2, 1],
        [3, 7],
      ],
    },
    {
      r: -1,
      segments: [
        [-3, 0],
        [3, 7],
      ],
    },
    {
      r: 0,
      segments: [
        [-3, -1],
        [2, 6],
      ],
    },
    {
      r: 1,
      segments: [
        [-4, -2],
        [1, 5],
      ],
    },
    { r: 2, segments: [[-4, 4]] },
    { r: 3, segments: [[-3, 3]] },
    { r: 4, segments: [[-2, 2]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 13,
    hills: 13,
    fields: 13,
    pasture: 12,
    mountains: 12,
    wasteland: 4,
  }),
  numberTokenPool: createNumberTokenPool(63),
  portPool: createPortPool(19),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;
