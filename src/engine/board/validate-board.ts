import { BASE_MAP } from '../maps/base-map';
import { TERRAINS, TERRAIN_IDS } from '../content/resources';
import type { MapDefinition } from '../content/types';
import type { BoardState, EdgeState, HexState, VertexState } from '../core/game-state';
import type { HexId, VertexId } from '../core/ids';
import { areAxialNeighbors, hexCornerToTopology, topologyPointKey } from './geometry';

export interface BoardValidationIssue {
  readonly code: string;
  readonly message: string;
}

function issue(code: string, message: string): BoardValidationIssue {
  return { code, message };
}

function sortedValues(values: readonly (number | string)[]): readonly string[] {
  return values
    .map(String)
    .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
}

function validateHexReferences(
  hex: HexState,
  board: BoardState,
  issues: BoardValidationIssue[],
): void {
  if (hex.vertexIds.length !== 6 || new Set(hex.vertexIds).size !== 6) {
    issues.push(issue('INVALID_HEX_VERTICES', `${hex.id} must reference six unique vertices.`));
  }

  if (hex.edgeIds.length !== 6 || new Set(hex.edgeIds).size !== 6) {
    issues.push(issue('INVALID_HEX_EDGES', `${hex.id} must reference six unique edges.`));
  }

  for (const vertexId of hex.vertexIds) {
    const vertex = board.vertices[vertexId];
    if (vertex === undefined || !vertex.adjacentHexIds.includes(hex.id)) {
      issues.push(
        issue('BROKEN_HEX_VERTEX_REFERENCE', `${hex.id} and ${vertexId} are not reciprocal.`),
      );
    }
  }

  for (const edgeId of hex.edgeIds) {
    const edge = board.edges[edgeId];
    if (edge === undefined || !edge.adjacentHexIds.includes(hex.id)) {
      issues.push(
        issue('BROKEN_HEX_EDGE_REFERENCE', `${hex.id} and ${edgeId} are not reciprocal.`),
      );
    }
  }
}

function validateVertexReferences(
  vertex: VertexState,
  board: BoardState,
  issues: BoardValidationIssue[],
): void {
  if (vertex.adjacentHexIds.length < 1 || vertex.adjacentHexIds.length > 3) {
    issues.push(issue('INVALID_VERTEX_HEX_COUNT', `${vertex.id} must touch one to three hexes.`));
  }

  if (vertex.connectedEdgeIds.length < 2 || vertex.connectedEdgeIds.length > 3) {
    issues.push(
      issue('INVALID_VERTEX_EDGE_COUNT', `${vertex.id} must connect two or three edges.`),
    );
  }

  for (const hexId of vertex.adjacentHexIds) {
    if (!board.hexes[hexId]?.vertexIds.includes(vertex.id)) {
      issues.push(
        issue('BROKEN_VERTEX_HEX_REFERENCE', `${vertex.id} and ${hexId} are not reciprocal.`),
      );
    }
  }

  for (const edgeId of vertex.connectedEdgeIds) {
    const edge = board.edges[edgeId];
    if (edge === undefined || (edge.vertexAId !== vertex.id && edge.vertexBId !== vertex.id)) {
      issues.push(
        issue('BROKEN_VERTEX_EDGE_REFERENCE', `${vertex.id} and ${edgeId} are not reciprocal.`),
      );
    }
  }

  for (const adjacentVertexId of vertex.adjacentVertexIds) {
    if (!board.vertices[adjacentVertexId]?.adjacentVertexIds.includes(vertex.id)) {
      issues.push(
        issue(
          'BROKEN_VERTEX_ADJACENCY',
          `${vertex.id} and ${adjacentVertexId} are not reciprocal.`,
        ),
      );
    }
  }

  if (vertex.building !== null) {
    issues.push(issue('UNEXPECTED_STARTING_BUILDING', `${vertex.id} has a building before setup.`));
  }

  if (vertex.portId !== null) {
    const port = board.ports[vertex.portId];
    if (port === undefined || !port.vertexIds.includes(vertex.id)) {
      issues.push(
        issue(
          'BROKEN_VERTEX_PORT_REFERENCE',
          `${vertex.id} and ${vertex.portId} are not reciprocal.`,
        ),
      );
    }
  }
}

function validateEdgeReferences(
  edge: EdgeState,
  board: BoardState,
  issues: BoardValidationIssue[],
): void {
  const first = board.vertices[edge.vertexAId];
  const second = board.vertices[edge.vertexBId];
  if (first === undefined || second === undefined || edge.vertexAId === edge.vertexBId) {
    issues.push(
      issue('INVALID_EDGE_VERTICES', `${edge.id} must connect two valid distinct vertices.`),
    );
  } else if (
    !first.connectedEdgeIds.includes(edge.id) ||
    !second.connectedEdgeIds.includes(edge.id) ||
    !first.adjacentVertexIds.includes(second.id) ||
    !second.adjacentVertexIds.includes(first.id)
  ) {
    issues.push(
      issue('BROKEN_EDGE_VERTEX_REFERENCE', `${edge.id} is not reciprocal with its vertices.`),
    );
  }

  if (edge.adjacentHexIds.length < 1 || edge.adjacentHexIds.length > 2) {
    issues.push(issue('INVALID_EDGE_HEX_COUNT', `${edge.id} must touch one or two hexes.`));
  }

  if (edge.roadOwnerId !== null) {
    issues.push(issue('UNEXPECTED_STARTING_ROAD', `${edge.id} has a road before setup.`));
  }

  if (edge.portId !== null) {
    const port = board.ports[edge.portId];
    if (port === undefined || port.edgeId !== edge.id) {
      issues.push(
        issue('BROKEN_EDGE_PORT_REFERENCE', `${edge.id} and ${edge.portId} are not reciprocal.`),
      );
    }
  }
}

function validateLandMasses(
  board: BoardState,
  map: MapDefinition,
  issues: BoardValidationIssue[],
): void {
  const unvisited = new Set(Object.keys(board.vertices) as VertexId[]);
  if (unvisited.size === 0) {
    issues.push(issue('EMPTY_BOARD_GRAPH', 'The board has no vertices.'));
    return;
  }
  let componentCount = 0;
  while (unvisited.size > 0) {
    const start = unvisited.values().next().value;
    if (start === undefined) break;
    componentCount += 1;
    const queue: VertexId[] = [start];
    unvisited.delete(start);
    for (let index = 0; index < queue.length; index += 1) {
      const currentId = queue[index];
      if (currentId === undefined) continue;
      const current = board.vertices[currentId];
      if (current === undefined) continue;
      for (const adjacentId of current.adjacentVertexIds) {
        if (!unvisited.has(adjacentId)) continue;
        unvisited.delete(adjacentId);
        queue.push(adjacentId);
      }
    }
  }
  if (componentCount !== map.landMassCount) {
    issues.push(
      issue(
        'INVALID_LAND_MASS_COUNT',
        `${map.displayName} requires ${map.landMassCount} landmass${map.landMassCount === 1 ? '' : 'es'}, but the board has ${componentCount}.`,
      ),
    );
  }
}

function validateNumbers(
  hexes: readonly HexState[],
  map: MapDefinition,
  issues: BoardValidationIssue[],
): void {
  const producingHexes = hexes.filter((hex) => hex.resourceId !== null);
  const tokens = producingHexes.flatMap((hex) =>
    hex.numberToken === null ? [] : [hex.numberToken],
  );
  if (
    tokens.length !== map.numberTokenPool.length ||
    sortedValues(tokens).join('|') !== sortedValues(map.numberTokenPool).join('|')
  ) {
    issues.push(
      issue('INVALID_NUMBER_TOKENS', `Number tokens do not match the ${map.displayName} pool.`),
    );
  }

  if (hexes.some((hex) => (hex.resourceId === null) !== (hex.numberToken === null))) {
    issues.push(issue('TOKEN_TERRAIN_MISMATCH', 'Only producing terrain may have number tokens.'));
  }

  if (map.separateHighProbabilityTokens) {
    const highProbabilityHexes = producingHexes.filter(
      (hex) => hex.numberToken === 6 || hex.numberToken === 8,
    );
    for (let index = 0; index < highProbabilityHexes.length; index += 1) {
      const first = highProbabilityHexes[index];
      if (first === undefined) continue;
      for (const second of highProbabilityHexes.slice(index + 1)) {
        if (areAxialNeighbors(first, second)) {
          issues.push(
            issue('ADJACENT_HIGH_TOKENS', `${first.id} and ${second.id} cannot both show 6 or 8.`),
          );
        }
      }
    }
  }
}

function validatePorts(
  board: BoardState,
  map: MapDefinition,
  issues: BoardValidationIssue[],
): void {
  const ports = Object.values(board.ports);
  if (ports.length !== map.portPool.length) {
    issues.push(
      issue('INVALID_PORT_COUNT', `${map.displayName} requires ${map.portPool.length} ports.`),
    );
  }

  const portVertices = new Set<VertexId>();
  for (const port of ports) {
    const edge = board.edges[port.edgeId];
    const edgeVertexIds: readonly VertexId[] =
      edge === undefined ? [] : [edge.vertexAId, edge.vertexBId];
    if (
      edge === undefined ||
      edge.adjacentHexIds.length !== 1 ||
      edge.portId !== port.id ||
      new Set(port.vertexIds).size !== 2 ||
      !port.vertexIds.every((vertexId) => edgeVertexIds.includes(vertexId)) ||
      !port.vertexIds.every((vertexId) => board.vertices[vertexId]?.portId === port.id)
    ) {
      issues.push(
        issue('INVALID_PORT_PLACEMENT', `${port.id} must occupy one valid boundary edge.`),
      );
    }

    for (const vertexId of port.vertexIds) {
      if (portVertices.has(vertexId)) {
        issues.push(issue('OVERLAPPING_PORTS', `${vertexId} is assigned to more than one port.`));
      }
      portVertices.add(vertexId);
    }
  }

  const specificPorts = ports.filter((port) => port.resourceId !== null && port.tradeRatio === 2);
  const genericPorts = ports.filter((port) => port.resourceId === null && port.tradeRatio === 3);
  const expectedSpecificPorts = map.portPool.filter(
    (port) => port.resourceId !== null && port.tradeRatio === 2,
  );
  const expectedGenericPorts = map.portPool.filter(
    (port) => port.resourceId === null && port.tradeRatio === 3,
  );
  if (
    specificPorts.length !== expectedSpecificPorts.length ||
    genericPorts.length !== expectedGenericPorts.length
  ) {
    issues.push(
      issue(
        'INVALID_PORT_DISTRIBUTION',
        `Ports must match the ${map.displayName} specific and generic trade distribution.`,
      ),
    );
  }

  const expectedSpecificResources = map.portPool.flatMap((port) =>
    port.resourceId === null || port.tradeRatio !== 2 ? [] : [port.resourceId],
  );
  if (
    sortedValues(specificPorts.map((port) => port.resourceId ?? '')).join('|') !==
    sortedValues(expectedSpecificResources).join('|')
  ) {
    issues.push(
      issue('INVALID_SPECIFIC_PORTS', 'Specific ports must match the selected map pool.'),
    );
  }
}

export function validateBoard(
  board: BoardState,
  map: MapDefinition = BASE_MAP,
): readonly BoardValidationIssue[] {
  const issues: BoardValidationIssue[] = [];
  const hexes = Object.values(board.hexes);
  const vertices = Object.values(board.vertices);
  const edges = Object.values(board.edges);

  const expectedCoordinateKeys = new Set(
    map.coordinates.map((coordinate) => `${coordinate.q},${coordinate.r}`),
  );
  const actualCoordinateKeys = new Set(hexes.map((hex) => `${hex.q},${hex.r}`));
  const expectedVertexCount = new Set(
    map.coordinates.flatMap((coordinate) =>
      Array.from({ length: 6 }, (_, cornerIndex) =>
        topologyPointKey(hexCornerToTopology(coordinate, cornerIndex)),
      ),
    ),
  ).size;
  const expectedAdjacencyCount = map.coordinates.reduce(
    (total, coordinate, index) =>
      total +
      map.coordinates
        .slice(index + 1)
        .filter((candidate) => areAxialNeighbors(coordinate, candidate)).length,
    0,
  );
  const expectedEdgeCount = map.coordinates.length * 6 - expectedAdjacencyCount;
  const expectedCoastalEdgeCount = map.coordinates.length * 6 - expectedAdjacencyCount * 2;

  if (hexes.length !== map.coordinates.length) {
    issues.push(
      issue('INVALID_HEX_COUNT', `${map.displayName} requires ${map.coordinates.length} hexes.`),
    );
  }
  if (
    actualCoordinateKeys.size !== expectedCoordinateKeys.size ||
    [...actualCoordinateKeys].some((key) => !expectedCoordinateKeys.has(key))
  ) {
    issues.push(
      issue('INVALID_HEX_COORDINATES', `Hex coordinates do not match ${map.displayName}.`),
    );
  }
  if (vertices.length !== expectedVertexCount) {
    issues.push(
      issue('INVALID_VERTEX_COUNT', `${map.displayName} requires ${expectedVertexCount} vertices.`),
    );
  }
  if (edges.length !== expectedEdgeCount) {
    issues.push(
      issue('INVALID_EDGE_COUNT', `${map.displayName} requires ${expectedEdgeCount} edges.`),
    );
  }
  if (
    edges.filter((edge) => edge.adjacentHexIds.length === 1).length !== expectedCoastalEdgeCount
  ) {
    issues.push(
      issue(
        'INVALID_COASTAL_EDGE_COUNT',
        `${map.displayName} requires ${expectedCoastalEdgeCount} coastal edges.`,
      ),
    );
  }

  for (const [key, hex] of Object.entries(board.hexes)) {
    if (key !== hex.id)
      issues.push(issue('HEX_KEY_MISMATCH', `Hex key ${key} does not match ${hex.id}.`));
    validateHexReferences(hex, board, issues);
    const expectedResource = TERRAINS.find((terrain) => terrain.id === hex.terrainId)?.resourceId;
    if (expectedResource === undefined || expectedResource !== hex.resourceId) {
      issues.push(issue('TERRAIN_RESOURCE_MISMATCH', `${hex.id} has the wrong resource mapping.`));
    }
  }

  for (const [key, vertex] of Object.entries(board.vertices)) {
    if (key !== vertex.id)
      issues.push(issue('VERTEX_KEY_MISMATCH', `Vertex key ${key} does not match ${vertex.id}.`));
    validateVertexReferences(vertex, board, issues);
  }

  for (const [key, edge] of Object.entries(board.edges)) {
    if (key !== edge.id)
      issues.push(issue('EDGE_KEY_MISMATCH', `Edge key ${key} does not match ${edge.id}.`));
    validateEdgeReferences(edge, board, issues);
  }

  if (
    sortedValues(hexes.map((hex) => hex.terrainId)).join('|') !==
    sortedValues(map.terrainPool).join('|')
  ) {
    issues.push(
      issue('INVALID_TERRAIN_DISTRIBUTION', `Terrain does not match the ${map.displayName} pool.`),
    );
  }

  const robberHex = board.robberHexId === null ? undefined : board.hexes[board.robberHexId];
  if (robberHex === undefined || robberHex.terrainId !== TERRAIN_IDS.wasteland) {
    issues.push(issue('INVALID_ROBBER_START', 'The robber must begin on the wasteland.'));
  }

  validateNumbers(hexes, map, issues);
  validatePorts(board, map, issues);
  validateLandMasses(board, map, issues);
  return issues;
}

export function adjacentHexIds(board: BoardState, hexId: HexId): readonly HexId[] {
  const hex = board.hexes[hexId];
  if (hex === undefined) return [];

  return Object.values(board.hexes)
    .filter((candidate) => candidate.id !== hex.id && areAxialNeighbors(hex, candidate))
    .map((candidate) => candidate.id);
}
