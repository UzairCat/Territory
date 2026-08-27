import type { AxialCoordinate } from '../content/types';

export interface TopologyPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

export const HEX_CORNER_OFFSETS: readonly TopologyPoint[] = [
  { x: 0, y: -2 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: 0, y: 2 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
] as const;

export const AXIAL_DIRECTIONS: readonly AxialCoordinate[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
] as const;

export function axialCenterToTopology(coordinate: AxialCoordinate): TopologyPoint {
  return { x: 2 * coordinate.q + coordinate.r, y: 3 * coordinate.r };
}

export function hexCornerToTopology(
  coordinate: AxialCoordinate,
  cornerIndex: number,
): TopologyPoint {
  const offset = HEX_CORNER_OFFSETS[cornerIndex];
  if (offset === undefined) {
    throw new Error(`Hex corner index ${cornerIndex} is outside 0–5.`);
  }

  const center = axialCenterToTopology(coordinate);
  return { x: center.x + offset.x, y: center.y + offset.y };
}

export function topologyToWorld(point: TopologyPoint, hexSize = 1): WorldPoint {
  return {
    x: point.x * (Math.sqrt(3) / 2) * hexSize,
    y: (point.y / 2) * hexSize,
  };
}

export function axialToWorld(coordinate: AxialCoordinate, hexSize = 1): WorldPoint {
  return topologyToWorld(axialCenterToTopology(coordinate), hexSize);
}

export function topologyPointKey(point: TopologyPoint): string {
  return `${point.x},${point.y}`;
}

export function areAxialNeighbors(first: AxialCoordinate, second: AxialCoordinate): boolean {
  const deltaQ = first.q - second.q;
  const deltaR = first.r - second.r;
  const deltaS = -deltaQ - deltaR;
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(deltaS)) === 1;
}
