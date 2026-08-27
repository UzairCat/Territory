import { BASE_MAP } from '../maps/base-map';
import { TERRAINS, TERRAIN_IDS } from '../content/resources';
import type { BoardState, EdgeState, HexState, VertexState } from '../core/game-state';
import type { HexId, VertexId } from '../core/ids';
import { areAxialNeighbors } from './geometry';

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

function validateConnectivity(board: BoardState, issues: BoardValidationIssue[]): void {
  const vertices = Object.values(board.vertices);
  const start = vertices[0];
  if (start === undefined) {
    issues.push(issue('EMPTY_BOARD_GRAPH', 'The board has no vertices.'));
    return;
  }

  const visited = new Set<VertexId>([start.id]);
  const queue: VertexId[] = [start.id];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) continue;
    const current = board.vertices[currentId];
    if (current === undefined) continue;

    for (const adjacentId of current.adjacentVertexIds) {
      if (!visited.has(adjacentId)) {
        visited.add(adjacentId);
        queue.push(adjacentId);
      }
    }
  }

  if (visited.size !== vertices.length) {
    issues.push(issue('DISCONNECTED_BOARD_GRAPH', 'The board vertex graph must be connected.'));
  }
}

function validateNumbers(hexes: readonly HexState[], issues: BoardValidationIssue[]): void {
  const producingHexes = hexes.filter((hex) => hex.resourceId !== null);
  const tokens = producingHexes.flatMap((hex) =>
    hex.numberToken === null ? [] : [hex.numberToken],
  );
  if (
    tokens.length !== BASE_MAP.numberTokenPool.length ||
    sortedValues(tokens).join('|') !== sortedValues(BASE_MAP.numberTokenPool).join('|')
  ) {
    issues.push(issue('INVALID_NUMBER_TOKENS', 'Number tokens do not match the Base Map pool.'));
  }

  if (hexes.some((hex) => (hex.resourceId === null) !== (hex.numberToken === null))) {
    issues.push(issue('TOKEN_TERRAIN_MISMATCH', 'Only producing terrain may have number tokens.'));
  }

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

function validatePorts(board: BoardState, issues: BoardValidationIssue[]): void {
  const ports = Object.values(board.ports);
  if (ports.length !== 9) {
    issues.push(issue('INVALID_PORT_COUNT', 'Base Map requires nine ports.'));
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
  if (specificPorts.length !== 5 || genericPorts.length !== 4) {
    issues.push(
      issue('INVALID_PORT_DISTRIBUTION', 'Ports must contain five 2:1 and four 3:1 trades.'),
    );
  }

  const expectedSpecificResources = BASE_MAP.portPool.flatMap((port) =>
    port.resourceId === null || port.tradeRatio !== 2 ? [] : [port.resourceId],
  );
  if (
    sortedValues(specificPorts.map((port) => port.resourceId ?? '')).join('|') !==
    sortedValues(expectedSpecificResources).join('|')
  ) {
    issues.push(
      issue('INVALID_SPECIFIC_PORTS', 'Specific ports must contain one trade for each resource.'),
    );
  }
}

export function validateBoard(board: BoardState): readonly BoardValidationIssue[] {
  const issues: BoardValidationIssue[] = [];
  const hexes = Object.values(board.hexes);
  const vertices = Object.values(board.vertices);
  const edges = Object.values(board.edges);

  if (hexes.length !== 19) issues.push(issue('INVALID_HEX_COUNT', 'Base Map requires 19 hexes.'));
  if (vertices.length !== 54)
    issues.push(issue('INVALID_VERTEX_COUNT', 'Base Map requires 54 vertices.'));
  if (edges.length !== 72) issues.push(issue('INVALID_EDGE_COUNT', 'Base Map requires 72 edges.'));
  if (edges.filter((edge) => edge.adjacentHexIds.length === 1).length !== 30) {
    issues.push(issue('INVALID_COASTAL_EDGE_COUNT', 'Base Map requires 30 coastal edges.'));
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
    sortedValues(BASE_MAP.terrainPool).join('|')
  ) {
    issues.push(issue('INVALID_TERRAIN_DISTRIBUTION', 'Terrain does not match the Base Map pool.'));
  }

  const robberHex = board.robberHexId === null ? undefined : board.hexes[board.robberHexId];
  if (robberHex === undefined || robberHex.terrainId !== TERRAIN_IDS.wasteland) {
    issues.push(issue('INVALID_ROBBER_START', 'The robber must begin on the wasteland.'));
  }

  validateNumbers(hexes, issues);
  validatePorts(board, issues);
  validateConnectivity(board, issues);
  return issues;
}

export function adjacentHexIds(board: BoardState, hexId: HexId): readonly HexId[] {
  const hex = board.hexes[hexId];
  if (hex === undefined) return [];

  return Object.values(board.hexes)
    .filter((candidate) => candidate.id !== hex.id && areAxialNeighbors(hex, candidate))
    .map((candidate) => candidate.id);
}
