import type { MapDefinition } from '../content/types';
import type { MapId } from '../core/ids';
import {
  BASE_LARGE_MAP,
  BASE_MEDIUM_MAP,
  DIAMOND_MAP,
  EARTH_MAP,
  GEAR_MAP,
  LAKES_MAP,
  POND_MAP,
  TWIRL_MAP,
  UK_IRELAND_MAP,
  USA_MAP,
} from './additional-maps';
import { BASE_MAP } from './base-map';

export const MAPS: readonly MapDefinition[] = [
  BASE_MAP,
  BASE_MEDIUM_MAP,
  BASE_LARGE_MAP,
  EARTH_MAP,
  USA_MAP,
  UK_IRELAND_MAP,
  DIAMOND_MAP,
  GEAR_MAP,
  LAKES_MAP,
  POND_MAP,
  TWIRL_MAP,
];

export function getMapDefinition(mapId: MapId): MapDefinition | undefined {
  return MAPS.find((map) => map.id === mapId);
}
