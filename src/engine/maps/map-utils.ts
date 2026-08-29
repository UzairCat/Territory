import { RESOURCE_IDS, TERRAIN_IDS } from '../content/resources';
import type { AxialCoordinate, MapDefinition, PortPoolEntry } from '../content/types';
import type { TerrainId } from '../core/ids';
import {
  AXIAL_DIRECTIONS,
  axialToWorld,
  hexCornerToTopology,
  topologyPointKey,
  topologyToWorld,
} from '../board/geometry';

export interface CoordinateRow {
  readonly r: number;
  readonly segments: readonly (readonly [minimumQ: number, maximumQ: number])[];
}

export interface TerrainPoolCounts {
  readonly forest: number;
  readonly hills: number;
  readonly fields: number;
  readonly pasture: number;
  readonly mountains: number;
  readonly wasteland: number;
}

export interface MapPortPlacement {
  readonly coordinate: AxialCoordinate;
  readonly edgeIndex: number;
}

interface BoundaryPlacement extends MapPortPlacement {
  readonly vertexKeys: readonly [string, string];
  readonly angle: number;
  readonly portPosition: { readonly x: number; readonly y: number };
}

const NUMBER_WEIGHTS = [
  { value: 2, weight: 1 },
  { value: 3, weight: 2 },
  { value: 4, weight: 2 },
  { value: 5, weight: 2 },
  { value: 6, weight: 2 },
  { value: 8, weight: 2 },
  { value: 9, weight: 2 },
  { value: 10, weight: 2 },
  { value: 11, weight: 2 },
  { value: 12, weight: 1 },
] as const;

const NUMBER_REMAINDER_PRIORITY = [6, 8, 5, 9, 4, 10, 3, 11, 2, 12] as const;
const RESOURCE_PORT_ORDER = [
  RESOURCE_IDS.wood,
  RESOURCE_IDS.brick,
  RESOURCE_IDS.grain,
  RESOURCE_IDS.livestock,
  RESOURCE_IDS.ore,
] as const;

const PORT_EDGE_DIRECTIONS: readonly AxialCoordinate[] = [
  AXIAL_DIRECTIONS[1]!,
  AXIAL_DIRECTIONS[0]!,
  AXIAL_DIRECTIONS[5]!,
  AXIAL_DIRECTIONS[4]!,
  AXIAL_DIRECTIONS[3]!,
  AXIAL_DIRECTIONS[2]!,
];
// The ship and its outward ratio badge span roughly 1.7 hex radii together.
const MINIMUM_PORT_CENTER_DISTANCE = 1.7;

function coordinateKey(coordinate: AxialCoordinate): string {
  return `${coordinate.q},${coordinate.r}`;
}

function repeatTerrain(terrainId: TerrainId, count: number): readonly TerrainId[] {
  return Array.from({ length: count }, () => terrainId);
}

export function coordinatesFromRows(rows: readonly CoordinateRow[]): readonly AxialCoordinate[] {
  return rows.flatMap((row) =>
    row.segments.flatMap(([minimumQ, maximumQ]) =>
      Array.from({ length: maximumQ - minimumQ + 1 }, (_, offset) => ({
        q: minimumQ + offset,
        r: row.r,
      })),
    ),
  );
}

export function createTerrainPool(counts: TerrainPoolCounts): readonly TerrainId[] {
  return [
    ...repeatTerrain(TERRAIN_IDS.forest, counts.forest),
    ...repeatTerrain(TERRAIN_IDS.hills, counts.hills),
    ...repeatTerrain(TERRAIN_IDS.fields, counts.fields),
    ...repeatTerrain(TERRAIN_IDS.pasture, counts.pasture),
    ...repeatTerrain(TERRAIN_IDS.mountains, counts.mountains),
    ...repeatTerrain(TERRAIN_IDS.wasteland, counts.wasteland),
  ];
}

export function createNumberTokenPool(producingTileCount: number): readonly number[] {
  if (!Number.isSafeInteger(producingTileCount) || producingTileCount < 1) return [];
  const baseWeight = NUMBER_WEIGHTS.reduce((total, entry) => total + entry.weight, 0);
  const counts = new Map<number, number>();
  const remainders = new Map<number, number>();
  let assigned = 0;

  for (const entry of NUMBER_WEIGHTS) {
    const exact = (producingTileCount * entry.weight) / baseWeight;
    const count = Math.floor(exact);
    counts.set(entry.value, count);
    remainders.set(entry.value, exact - count);
    assigned += count;
  }

  const priorityIndex = new Map(
    NUMBER_REMAINDER_PRIORITY.map((value, index) => [value, index] as const),
  );
  const allocationOrder = [...NUMBER_WEIGHTS].sort((first, second) => {
    const remainderDifference =
      (remainders.get(second.value) ?? 0) - (remainders.get(first.value) ?? 0);
    if (Math.abs(remainderDifference) > Number.EPSILON) return remainderDifference;
    return (priorityIndex.get(first.value) ?? 0) - (priorityIndex.get(second.value) ?? 0);
  });

  for (let index = 0; assigned < producingTileCount; index += 1) {
    const entry = allocationOrder[index % allocationOrder.length];
    if (entry === undefined) break;
    counts.set(entry.value, (counts.get(entry.value) ?? 0) + 1);
    assigned += 1;
  }

  return NUMBER_WEIGHTS.flatMap((entry) =>
    Array.from({ length: counts.get(entry.value) ?? 0 }, () => entry.value),
  );
}

export function createPortPool(portCount: number): readonly PortPoolEntry[] {
  const specificPortCount = Math.round((portCount * 5) / 9);
  return [
    ...Array.from({ length: specificPortCount }, (_, index): PortPoolEntry => ({
      tradeRatio: 2,
      resourceId: RESOURCE_PORT_ORDER[index % RESOURCE_PORT_ORDER.length]!,
    })),
    ...Array.from({ length: portCount - specificPortCount }, (): PortPoolEntry => ({
      tradeRatio: 3,
      resourceId: null,
    })),
  ];
}

export function coordinateLandMasses(
  coordinates: readonly AxialCoordinate[],
): readonly (readonly AxialCoordinate[])[] {
  const remaining = new Map(
    coordinates.map((coordinate) => [coordinateKey(coordinate), coordinate]),
  );
  const components: AxialCoordinate[][] = [];

  while (remaining.size > 0) {
    const start = remaining.values().next().value;
    if (start === undefined) break;
    const component: AxialCoordinate[] = [];
    const queue = [start];
    remaining.delete(coordinateKey(start));
    for (let index = 0; index < queue.length; index += 1) {
      const coordinate = queue[index];
      if (coordinate === undefined) continue;
      component.push(coordinate);
      for (const direction of AXIAL_DIRECTIONS) {
        const neighborKey = `${coordinate.q + direction.q},${coordinate.r + direction.r}`;
        const neighbor = remaining.get(neighborKey);
        if (neighbor === undefined) continue;
        remaining.delete(neighborKey);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }

  return components.sort((first, second) => {
    const firstTop = Math.min(...first.map((coordinate) => coordinate.r));
    const secondTop = Math.min(...second.map((coordinate) => coordinate.r));
    if (firstTop !== secondTop) return firstTop - secondTop;
    return (
      Math.min(...first.map((coordinate) => coordinate.q + coordinate.r / 2)) -
      Math.min(...second.map((coordinate) => coordinate.q + coordinate.r / 2))
    );
  });
}

export function coordinateLakeCount(coordinates: readonly AxialCoordinate[]): number {
  if (coordinates.length === 0) return 0;
  const occupied = new Set(coordinates.map(coordinateKey));
  const minimumQ = Math.min(...coordinates.map((coordinate) => coordinate.q)) - 1;
  const maximumQ = Math.max(...coordinates.map((coordinate) => coordinate.q)) + 1;
  const minimumR = Math.min(...coordinates.map((coordinate) => coordinate.r)) - 1;
  const maximumR = Math.max(...coordinates.map((coordinate) => coordinate.r)) + 1;
  const remainingWater = new Map<string, AxialCoordinate>();

  for (let r = minimumR; r <= maximumR; r += 1) {
    for (let q = minimumQ; q <= maximumQ; q += 1) {
      const coordinate = { q, r };
      if (!occupied.has(coordinateKey(coordinate))) {
        remainingWater.set(coordinateKey(coordinate), coordinate);
      }
    }
  }

  let lakeCount = 0;
  while (remainingWater.size > 0) {
    const start = remainingWater.values().next().value;
    if (start === undefined) break;
    const queue = [start];
    let touchesOuterSea = false;
    remainingWater.delete(coordinateKey(start));
    for (let index = 0; index < queue.length; index += 1) {
      const coordinate = queue[index];
      if (coordinate === undefined) continue;
      if (
        coordinate.q === minimumQ ||
        coordinate.q === maximumQ ||
        coordinate.r === minimumR ||
        coordinate.r === maximumR
      ) {
        touchesOuterSea = true;
      }
      for (const direction of AXIAL_DIRECTIONS) {
        const neighborKey = `${coordinate.q + direction.q},${coordinate.r + direction.r}`;
        const neighbor = remainingWater.get(neighborKey);
        if (neighbor === undefined) continue;
        remainingWater.delete(neighborKey);
        queue.push(neighbor);
      }
    }
    if (!touchesOuterSea) lakeCount += 1;
  }

  return lakeCount;
}

function boundaryPlacements(component: readonly AxialCoordinate[]): readonly BoundaryPlacement[] {
  const coordinateKeys = new Set(component.map(coordinateKey));
  const componentCenter = component.reduce(
    (center, coordinate) => {
      const point = axialToWorld(coordinate);
      return { x: center.x + point.x / component.length, y: center.y + point.y / component.length };
    },
    { x: 0, y: 0 },
  );
  const placements: BoundaryPlacement[] = [];

  for (const coordinate of component) {
    PORT_EDGE_DIRECTIONS.forEach((direction, edgeIndex) => {
      if (coordinateKeys.has(`${coordinate.q + direction.q},${coordinate.r + direction.r}`)) {
        return;
      }
      const firstPoint = hexCornerToTopology(coordinate, edgeIndex);
      const secondPoint = hexCornerToTopology(coordinate, (edgeIndex + 1) % 6);
      const first = topologyToWorld(firstPoint);
      const second = topologyToWorld(secondPoint);
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const shoreCenter = axialToWorld(coordinate);
      const outwardX = midpoint.x - shoreCenter.x;
      const outwardY = midpoint.y - shoreCenter.y;
      const outwardLength = Math.hypot(outwardX, outwardY) || 1;
      placements.push({
        coordinate,
        edgeIndex,
        vertexKeys: [topologyPointKey(firstPoint), topologyPointKey(secondPoint)],
        angle: Math.atan2(midpoint.y - componentCenter.y, midpoint.x - componentCenter.x),
        portPosition: {
          x: midpoint.x + (outwardX / outwardLength) * 0.55,
          y: midpoint.y + (outwardY / outwardLength) * 0.55,
        },
      });
    });
  }

  return placements.sort((first, second) => first.angle - second.angle);
}

function allocatePorts(
  components: readonly (readonly AxialCoordinate[])[],
  boundaries: readonly (readonly BoundaryPlacement[])[],
  portCount: number,
): readonly number[] {
  if (portCount < components.length) {
    throw new Error(`Cannot place ${portCount} ports across ${components.length} landmasses.`);
  }
  const totalTiles = components.reduce((total, component) => total + component.length, 0);
  const ideal = components.map((component) => (portCount * component.length) / totalTiles);
  const capacities = boundaries.map((boundary, index) =>
    components[index]?.length === 1 ? 1 : Math.floor(boundary.length / 2),
  );
  const allocations = ideal.map((value, index) =>
    Math.min(capacities[index] ?? 0, Math.max(1, Math.floor(value))),
  );

  while (allocations.reduce((total, count) => total + count, 0) < portCount) {
    let selectedIndex = -1;
    let selectedNeed = Number.NEGATIVE_INFINITY;
    allocations.forEach((allocation, index) => {
      if (allocation >= (capacities[index] ?? 0)) return;
      const need = (ideal[index] ?? 0) - allocation;
      if (need > selectedNeed) {
        selectedNeed = need;
        selectedIndex = index;
      }
    });
    if (selectedIndex < 0)
      throw new Error('The selected map has too little coastline for its ports.');
    allocations[selectedIndex] = (allocations[selectedIndex] ?? 0) + 1;
  }

  while (allocations.reduce((total, count) => total + count, 0) > portCount) {
    let selectedIndex = -1;
    let selectedExcess = Number.NEGATIVE_INFINITY;
    allocations.forEach((allocation, index) => {
      if (allocation <= 1) return;
      const excess = allocation - (ideal[index] ?? 0);
      if (excess > selectedExcess) {
        selectedExcess = excess;
        selectedIndex = index;
      }
    });
    if (selectedIndex < 0) throw new Error('The selected map cannot reduce its port allocation.');
    allocations[selectedIndex] = (allocations[selectedIndex] ?? 0) - 1;
  }

  return allocations;
}

function selectComponentPorts(
  boundary: readonly BoundaryPlacement[],
  count: number,
  portsOnOtherLandMasses: readonly BoundaryPlacement[],
): readonly BoundaryPlacement[] {
  for (let rotation = 0; rotation < boundary.length; rotation += 1) {
    const usedVertices = new Set<string>();
    const selected: BoundaryPlacement[] = [];
    for (let portIndex = 0; portIndex < count; portIndex += 1) {
      const target =
        (rotation + Math.floor((portIndex * boundary.length) / count)) % boundary.length;
      const candidates = [...boundary].sort((first, second) => {
        const firstIndex = boundary.indexOf(first);
        const secondIndex = boundary.indexOf(second);
        const firstDistance = Math.min(
          (firstIndex - target + boundary.length) % boundary.length,
          (target - firstIndex + boundary.length) % boundary.length,
        );
        const secondDistance = Math.min(
          (secondIndex - target + boundary.length) % boundary.length,
          (target - secondIndex + boundary.length) % boundary.length,
        );
        return firstDistance - secondDistance || firstIndex - secondIndex;
      });
      const placement = candidates.find(
        (candidate) =>
          candidate.vertexKeys.every((key) => !usedVertices.has(key)) &&
          [...portsOnOtherLandMasses, ...selected].every(
            (other) =>
              Math.hypot(
                candidate.portPosition.x - other.portPosition.x,
                candidate.portPosition.y - other.portPosition.y,
              ) >= MINIMUM_PORT_CENTER_DISTANCE,
          ),
      );
      if (placement === undefined) break;
      placement.vertexKeys.forEach((key) => usedVertices.add(key));
      selected.push(placement);
    }
    if (selected.length === count) {
      return selected.sort((first, second) => first.angle - second.angle);
    }
  }
  throw new Error(`Could not place ${count} non-overlapping ports on a landmass.`);
}

export function getMapPortPlacements(map: MapDefinition): readonly MapPortPlacement[] {
  const components = coordinateLandMasses(map.coordinates);
  const boundaries = components.map(boundaryPlacements);
  const allocations = allocatePorts(components, boundaries, map.portPool.length);
  const selected: BoundaryPlacement[] = [];
  boundaries.forEach((boundary, index) => {
    selected.push(...selectComponentPorts(boundary, allocations[index] ?? 0, selected));
  });
  return selected.map(({ coordinate, edgeIndex }) => ({ coordinate, edgeIndex }));
}
