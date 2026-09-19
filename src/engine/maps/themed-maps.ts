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

export const LAKE_LABYRINTH_MAP = {
  id: mapId('lake-labyrinth'),
  displayName: 'Lake Labyrinth',
  landMassCount: 1,
  lakeCount: 10,
  supportedPlayerCounts: SUPPORTED_PLAYER_COUNTS,
  supportedModeIds: SUPPORTED_MODE_IDS,
  coordinates: coordinatesFromRows([
    { r: -4, segments: [[0, 4]] },
    {
      r: -3,
      segments: [
        [-1, -1],
        [1, 2],
        [4, 4],
      ],
    },
    {
      r: -2,
      segments: [
        [-2, 0],
        [2, 4],
      ],
    },
    {
      r: -1,
      segments: [
        [-3, -2],
        [0, 1],
        [4, 4],
      ],
    },
    {
      r: 0,
      segments: [
        [-4, -4],
        [-2, -1],
        [1, 4],
      ],
    },
    {
      r: 1,
      segments: [
        [-4, -4],
        [-2, 0],
        [2, 3],
      ],
    },
    {
      r: 2,
      segments: [
        [-4, -3],
        [0, 2],
      ],
    },
    {
      r: 3,
      segments: [
        [-4, -1],
        [1, 1],
      ],
    },
    { r: 4, segments: [[-4, 0]] },
  ]),
  terrainPool: createTerrainPool({
    forest: 9,
    hills: 9,
    fields: 9,
    pasture: 9,
    mountains: 9,
    wasteland: 3,
  }),
  numberTokenPool: createNumberTokenPool(45),
  portPool: createPortPool(14),
  separateHighProbabilityTokens: true,
} as const satisfies MapDefinition;
