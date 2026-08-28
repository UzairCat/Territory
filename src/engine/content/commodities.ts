import { resourceId } from '../core/ids';
import type { ResourceDefinition } from './types';
import { RESOURCES } from './resources';

export const COMMODITY_IDS = {
  paper: resourceId('paper'),
  cloth: resourceId('cloth'),
  coin: resourceId('coin'),
} as const;

export const COMMODITIES: readonly ResourceDefinition[] = [
  {
    id: COMMODITY_IDS.paper,
    displayName: 'Paper',
    color: '#2f8063',
    iconKey: 'paper',
  },
  {
    id: COMMODITY_IDS.cloth,
    displayName: 'Cloth',
    color: '#b58a36',
    iconKey: 'cloth',
  },
  {
    id: COMMODITY_IDS.coin,
    displayName: 'Coin',
    color: '#416b9b',
    iconKey: 'coin',
  },
] as const;

export const HAND_GOODS: readonly ResourceDefinition[] = [...RESOURCES, ...COMMODITIES];

const COMMODITY_ID_SET = new Set(COMMODITIES.map((commodity) => commodity.id));

export function isCommodityId(resourceId: ResourceDefinition['id']): boolean {
  return COMMODITY_ID_SET.has(resourceId);
}
