import { BASE_MAP } from '../maps/base-map';
import { TERRAIN_IDS, TERRAINS } from '../content/resources';
import type { AxialCoordinate, PortPoolEntry } from '../content/types';
import type { BoardState, EdgeState, HexState, PortState, VertexState } from '../core/game-state';
import { edgeId, hexId, portId, vertexId } from '../core/ids';
import type { EdgeId, HexId, PortId, TerrainId, VertexId } from '../core/ids';
import { shuffle } from '../core/random';
import type { RandomState } from '../core/random';
import {
  areAxialNeighbors,
  hexCornerToTopology,
  topologyPointKey,
  topologyToWorld,
  type TopologyPoint,
} from './geometry';

const MAX_TOKEN_SHUFFLE_ATTEMPTS = 1_000;
const PORT_BOUNDARY_EDGE_INDICES = [0, 3, 7, 10, 13, 17, 20, 23, 27] as const;

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

function findTerrainResourceId(terrainId: TerrainId) {
  const terrain = TERRAINS.find((definition) => definition.id === terrainId);
  if (terrain === undefined) {
    throw new Error(`Base Map references unknown terrain ${terrainId}.`);
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

function highProbabilityTokensAreSeparated(
  producingHexes: readonly HexBuilder[],
  tokens: readonly number[],
): boolean {
  const highProbabilityHexes = producingHexes.filter((_, index) => {
    const token = tokens[index];
    return token === 6 || token === 8;
  });

  return highProbabilityHexes.every((hex, index) =>
    highProbabilityHexes
      .slice(index + 1)
      .every((candidate) => !areAxialNeighbors(hex.coordinate, candidate.coordinate)),
  );
}

function assignNumberTokens(
  random: RandomState,
  producingHexes: readonly HexBuilder[],
): { readonly assignments: ReadonlyMap<HexId, number>; readonly random: RandomState } {
  let randomState = random;

  for (let attempt = 0; attempt < MAX_TOKEN_SHUFFLE_ATTEMPTS; attempt += 1) {
    const shuffled = shuffle(randomState, BASE_MAP.numberTokenPool);
    randomState = shuffled.state;

    if (
      !BASE_MAP.separateHighProbabilityTokens ||
      highProbabilityTokensAreSeparated(producingHexes, shuffled.value)
    ) {
      return {
        assignments: new Map(
          producingHexes.map((hex, index) => {
            const token = shuffled.value[index];
            if (token === undefined) {
              throw new Error(`No number token was assigned to ${hex.id}.`);
            }
            return [hex.id, token] as const;
          }),
        ),
        random: randomState,
      };
    }
  }

  throw new Error('Unable to generate a board with separated 6 and 8 number tokens.');
}

function boundaryEdgeAngle(edge: EdgeBuilder, verticesById: ReadonlyMap<VertexId, VertexBuilder>) {
  const first = verticesById.get(edge.vertexAId);
  const second = verticesById.get(edge.vertexBId);
  if (first === undefined || second === undefined) {
    throw new Error(`Boundary edge ${edge.id} references an unknown vertex.`);
  }

  const midpoint = topologyToWorld({
    x: (first.point.x + second.point.x) / 2,
    y: (first.point.y + second.point.y) / 2,
  });
  return Math.atan2(midpoint.y, midpoint.x);
}

function createPorts(
  random: RandomState,
  edgeBuilders: readonly EdgeBuilder[],
  verticesById: ReadonlyMap<VertexId, VertexBuilder>,
): { readonly ports: Readonly<Record<string, PortState>>; readonly random: RandomState } {
  const boundaryEdges = edgeBuilders
    .filter((edge) => edge.adjacentHexIds.size === 1)
    .sort(
      (first, second) =>
        boundaryEdgeAngle(first, verticesById) - boundaryEdgeAngle(second, verticesById),
    );

  if (boundaryEdges.length !== 30) {
    throw new Error(`Base Map requires 30 boundary edges; generated ${boundaryEdges.length}.`);
  }

  const shuffledPorts = shuffle(random, BASE_MAP.portPool);
  const ports: Record<string, PortState> = {};

  PORT_BOUNDARY_EDGE_INDICES.forEach((boundaryIndex, portIndex) => {
    const edge = boundaryEdges[boundaryIndex];
    const definition: PortPoolEntry | undefined = shuffledPorts.value[portIndex];
    if (edge === undefined || definition === undefined) {
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
  const shuffledTerrain = shuffle(random, BASE_MAP.terrainPool);
  const vertexBuildersByPoint = new Map<string, VertexBuilder>();
  const verticesById = new Map<VertexId, VertexBuilder>();
  const edgeBuildersByKey = new Map<string, EdgeBuilder>();
  const hexBuilders: HexBuilder[] = [];

  BASE_MAP.coordinates.forEach((coordinate, coordinateIndex) => {
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
  const tokenAssignment = assignNumberTokens(shuffledTerrain.state, producingHexes);
  const edgeBuilders = [...edgeBuildersByKey.values()];
  const portGeneration = createPorts(tokenAssignment.random, edgeBuilders, verticesById);

  const hexes = Object.fromEntries(
    hexBuilders.map((hex): readonly [string, HexState] => [
      hex.id,
      {
        id: hex.id,
        q: hex.coordinate.q,
        r: hex.coordinate.r,
        terrainId: hex.terrainId,
        resourceId: findTerrainResourceId(hex.terrainId),
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
    throw new Error('Generated Base Map has no wasteland for the robber.');
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
