import { BASE_MAP } from '../maps/base-map';
import { TERRAIN_IDS, TERRAINS } from '../content/resources';
import type { AxialCoordinate, MapDefinition, PortPoolEntry } from '../content/types';
import type { BoardState, EdgeState, HexState, PortState, VertexState } from '../core/game-state';
import { edgeId, hexId, portId, vertexId } from '../core/ids';
import type { EdgeId, HexId, PortId, TerrainId, VertexId } from '../core/ids';
import { shuffle } from '../core/random';
import type { RandomState } from '../core/random';
import { hexCornerToTopology, topologyPointKey, type TopologyPoint } from './geometry';
import { getMapPortPlacements } from '../maps/map-utils';

interface VertexBuilder {
  readonly id: VertexId;
  readonly point: TopologyPoint;
  readonly adjacentHexIds: Set<HexId>;
  readonly connectedEdgeIds: Set<EdgeId>;
  readonly adjacentVertexIds: Set<VertexId>;
  portId: PortId | null;
}

interface EdgeBuilder {
  readonly id: EdgeId;
  readonly vertexAId: VertexId;
  readonly vertexBId: VertexId;
  readonly adjacentHexIds: Set<HexId>;
  portId: PortId | null;
}

interface HexBuilder {
  readonly id: HexId;
  readonly coordinate: AxialCoordinate;
  readonly terrainId: TerrainId;
  readonly vertexIds: readonly VertexId[];
  readonly edgeIds: readonly EdgeId[];
}

export interface GeneratedBoard {
  readonly board: BoardState;
  readonly random: RandomState;
}

function sortIds<Id extends string>(ids: Iterable<Id>): readonly Id[] {
  return [...ids].sort((first, second) => first.localeCompare(second));
}

function findTerrainResourceId(map: MapDefinition, terrainId: TerrainId) {
  const terrain = TERRAINS.find((definition) => definition.id === terrainId);
  if (terrain === undefined) {
    throw new Error(`${map.displayName} references unknown terrain ${terrainId}.`);
  }

  return terrain.resourceId;
}

function createVertexBuilder(point: TopologyPoint): VertexBuilder {
  return {
    id: vertexId(`vertex-${point.x}-${point.y}`),
    point,
    adjacentHexIds: new Set(),
    connectedEdgeIds: new Set(),
    adjacentVertexIds: new Set(),
    portId: null,
  };
}

function createEdgeBuilder(firstVertex: VertexBuilder, secondVertex: VertexBuilder): EdgeBuilder {
  const [vertexAId, vertexBId] = sortIds([firstVertex.id, secondVertex.id]);
  if (vertexAId === undefined || vertexBId === undefined) {
    throw new Error('Cannot create an edge without two vertices.');
  }

  return {
    id: edgeId(`edge-${vertexAId}--${vertexBId}`),
    vertexAId,
    vertexBId,
    adjacentHexIds: new Set(),
    portId: null,
  };
}

function assignNumberTokens(
  map: MapDefinition,
  random: RandomState,
  producingHexes: readonly HexBuilder[],
): { readonly assignments: ReadonlyMap<HexId, number>; readonly random: RandomState } {
  if (!map.separateHighProbabilityTokens) {
    const shuffled = shuffle(random, map.numberTokenPool);
    return {
      assignments: new Map(
        producingHexes.map((hex, index) => {
          const token = shuffled.value[index];
          if (token === undefined) throw new Error(`No number token was assigned to ${hex.id}.`);
          return [hex.id, token] as const;
        }),
      ),
      random: shuffled.state,
    };
  }

  const highTokens = map.numberTokenPool.filter((token) => token === 6 || token === 8);
  const regularTokens = map.numberTokenPool.filter((token) => token !== 6 && token !== 8);
  const colorClass = (hex: HexBuilder) => (((hex.coordinate.q - hex.coordinate.r) % 3) + 3) % 3;
  const eligibleColorClasses = [0, 1, 2].filter(
    (color) =>
      producingHexes.filter((hex) => colorClass(hex) === color).length >= highTokens.length,
  );
  if (eligibleColorClasses.length === 0) {
    throw new Error(`Unable to generate ${map.displayName} with separated 6 and 8 number tokens.`);
  }

  const shuffledColors = shuffle(random, eligibleColorClasses);
  const selectedColor = shuffledColors.value[0];
  const highProbabilityHexCandidates = producingHexes.filter(
    (hex) => colorClass(hex) === selectedColor,
  );
  const shuffledCandidates = shuffle(shuffledColors.state, highProbabilityHexCandidates);
  const selectedHighProbabilityHexIds = new Set(
    shuffledCandidates.value.slice(0, highTokens.length).map((hex) => hex.id),
  );
  const shuffledHighTokens = shuffle(shuffledCandidates.state, highTokens);
  const shuffledRegularTokens = shuffle(shuffledHighTokens.state, regularTokens);
  let highIndex = 0;
  let regularIndex = 0;
  const assignments = new Map<HexId, number>();

  for (const hex of producingHexes) {
    const token = selectedHighProbabilityHexIds.has(hex.id)
      ? shuffledHighTokens.value[highIndex++]
      : shuffledRegularTokens.value[regularIndex++];
    if (token === undefined) throw new Error(`No number token was assigned to ${hex.id}.`);
    assignments.set(hex.id, token);
  }

  return { assignments, random: shuffledRegularTokens.state };
}

function createPorts(
  map: MapDefinition,
  random: RandomState,
  hexBuildersByCoordinate: ReadonlyMap<string, HexBuilder>,
  edgeBuildersById: ReadonlyMap<EdgeId, EdgeBuilder>,
  verticesById: ReadonlyMap<VertexId, VertexBuilder>,
): { readonly ports: Readonly<Record<string, PortState>>; readonly random: RandomState } {
  const placements = getMapPortPlacements(map);
  const shuffledPorts = shuffle(random, map.portPool);
  const ports: Record<string, PortState> = {};

  placements.forEach((placement, portIndex) => {
    const hex = hexBuildersByCoordinate.get(`${placement.coordinate.q},${placement.coordinate.r}`);
    const edgeIdForPlacement = hex?.edgeIds[placement.edgeIndex];
    const edge =
      edgeIdForPlacement === undefined ? undefined : edgeBuildersById.get(edgeIdForPlacement);
    const definition: PortPoolEntry | undefined = shuffledPorts.value[portIndex];
    if (edge === undefined || edge.adjacentHexIds.size !== 1 || definition === undefined) {
      throw new Error('Port placement references a missing boundary edge or port definition.');
    }

    const id = portId(`port-${portIndex + 1}`);
    const firstVertex = verticesById.get(edge.vertexAId);
    const secondVertex = verticesById.get(edge.vertexBId);
    if (firstVertex === undefined || secondVertex === undefined) {
      throw new Error(`Port ${id} references an unknown vertex.`);
    }

    edge.portId = id;
    firstVertex.portId = id;
    secondVertex.portId = id;
    ports[id] = {
      id,
      edgeId: edge.id,
      vertexIds: [edge.vertexAId, edge.vertexBId],
      tradeRatio: definition.tradeRatio,
      resourceId: definition.resourceId,
    };
  });

  return { ports, random: shuffledPorts.state };
}

export function generateBaseBoard(random: RandomState): GeneratedBoard {
  return generateBoard(BASE_MAP, random);
}

export function generateBoard(map: MapDefinition, random: RandomState): GeneratedBoard {
  const shuffledTerrain = shuffle(random, map.terrainPool);
  const vertexBuildersByPoint = new Map<string, VertexBuilder>();
  const verticesById = new Map<VertexId, VertexBuilder>();
  const edgeBuildersByKey = new Map<string, EdgeBuilder>();
  const hexBuilders: HexBuilder[] = [];

  map.coordinates.forEach((coordinate, coordinateIndex) => {
    const terrainId = shuffledTerrain.value[coordinateIndex];
    if (terrainId === undefined) {
      throw new Error(`No terrain was assigned to coordinate ${coordinate.q},${coordinate.r}.`);
    }

    const id = hexId(`hex-${coordinate.q}-${coordinate.r}`);
    const vertices = Array.from({ length: 6 }, (_, cornerIndex) => {
      const point = hexCornerToTopology(coordinate, cornerIndex);
      const key = topologyPointKey(point);
      const vertex = vertexBuildersByPoint.get(key) ?? createVertexBuilder(point);
      vertex.adjacentHexIds.add(id);
      vertexBuildersByPoint.set(key, vertex);
      verticesById.set(vertex.id, vertex);
      return vertex;
    });
    const edges = vertices.map((vertex, cornerIndex) => {
      const nextVertex = vertices[(cornerIndex + 1) % vertices.length];
      if (nextVertex === undefined) {
        throw new Error(`Hex ${id} is missing corner ${cornerIndex + 1}.`);
      }

      const vertexKey = sortIds([vertex.id, nextVertex.id]).join('|');
      const edge = edgeBuildersByKey.get(vertexKey) ?? createEdgeBuilder(vertex, nextVertex);
      edge.adjacentHexIds.add(id);
      edgeBuildersByKey.set(vertexKey, edge);
      vertex.connectedEdgeIds.add(edge.id);
      vertex.adjacentVertexIds.add(nextVertex.id);
      nextVertex.connectedEdgeIds.add(edge.id);
      nextVertex.adjacentVertexIds.add(vertex.id);
      return edge;
    });

    hexBuilders.push({
      id,
      coordinate,
      terrainId,
      vertexIds: vertices.map((vertex) => vertex.id),
      edgeIds: edges.map((edge) => edge.id),
    });
  });

  const producingHexes = hexBuilders.filter((hex) => hex.terrainId !== TERRAIN_IDS.wasteland);
  const tokenAssignment = assignNumberTokens(map, shuffledTerrain.state, producingHexes);
  const edgeBuilders = [...edgeBuildersByKey.values()];
  const portGeneration = createPorts(
    map,
    tokenAssignment.random,
    new Map(hexBuilders.map((hex) => [`${hex.coordinate.q},${hex.coordinate.r}`, hex] as const)),
    new Map(edgeBuilders.map((edge) => [edge.id, edge] as const)),
    verticesById,
  );

  const hexes = Object.fromEntries(
    hexBuilders.map((hex): readonly [string, HexState] => [
      hex.id,
      {
        id: hex.id,
        q: hex.coordinate.q,
        r: hex.coordinate.r,
        terrainId: hex.terrainId,
        resourceId: findTerrainResourceId(map, hex.terrainId),
        numberToken: tokenAssignment.assignments.get(hex.id) ?? null,
        vertexIds: hex.vertexIds,
        edgeIds: hex.edgeIds,
      },
    ]),
  );
  const vertices = Object.fromEntries(
    [...verticesById.values()].map((vertex): readonly [string, VertexState] => [
      vertex.id,
      {
        id: vertex.id,
        adjacentHexIds: sortIds(vertex.adjacentHexIds),
        connectedEdgeIds: sortIds(vertex.connectedEdgeIds),
        adjacentVertexIds: sortIds(vertex.adjacentVertexIds),
        building: null,
        portId: vertex.portId,
      },
    ]),
  );
  const edges = Object.fromEntries(
    edgeBuilders.map((edge): readonly [string, EdgeState] => [
      edge.id,
      {
        id: edge.id,
        vertexAId: edge.vertexAId,
        vertexBId: edge.vertexBId,
        adjacentHexIds: sortIds(edge.adjacentHexIds),
        roadOwnerId: null,
        portId: edge.portId,
      },
    ]),
  );
  const wasteland = hexBuilders.find((hex) => hex.terrainId === TERRAIN_IDS.wasteland);
  if (wasteland === undefined) {
    throw new Error(`Generated ${map.displayName} has no wasteland for the robber.`);
  }

  return {
    board: {
      hexes,
      vertices,
      edges,
      ports: portGeneration.ports,
      robberHexId: wasteland.id,
    },
    random: portGeneration.random,
  };
}
