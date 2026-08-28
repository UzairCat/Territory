import { TERRAINS } from '../engine/content/resources';
import type {
  BoardState,
  BuildingState,
  EdgeState,
  HexState,
  KnightState,
  KNState,
  PortState,
} from '../engine/core/game-state';
import type {
  CardDefinitionId,
  EdgeId,
  HexId,
  PlayerId,
  PortId,
  ResourceId,
  VertexId,
} from '../engine/core/ids';
import {
  axialToWorld,
  hexCornerToTopology,
  topologyToWorld,
  type WorldPoint,
} from '../engine/board/geometry';

export type BoardTarget =
  | { readonly kind: 'HEX'; readonly id: HexId }
  | { readonly kind: 'EDGE'; readonly id: EdgeId }
  | { readonly kind: 'VERTEX'; readonly id: VertexId }
  | { readonly kind: 'PORT'; readonly id: PortId };

export interface BoardViewportPoint {
  readonly x: number;
  readonly y: number;
}

export interface ResourceFlyover {
  readonly id: string;
  readonly source:
    | { readonly kind: 'HEX'; readonly hexId: HexId }
    | { readonly kind: 'BANK' }
    | { readonly kind: 'PLAYER'; readonly playerId: PlayerId };
  readonly resourceId: ResourceId;
  readonly delayMs: number;
  readonly targetPlayerId?: PlayerId;
}

export interface ProgressCardFlyover {
  readonly id: string;
  readonly sourcePlayerId: PlayerId;
  readonly cardDefinitionId: CardDefinitionId;
  readonly delayMs: number;
}

export interface RenderHex {
  readonly target: Extract<BoardTarget, { readonly kind: 'HEX' }>;
  readonly center: WorldPoint;
  readonly corners: readonly WorldPoint[];
  readonly terrainName: string;
  readonly terrainColor: string;
  readonly numberToken: number | null;
  readonly hasRobber: boolean;
  readonly merchantOwnerId: PlayerId | null;
}

export interface RenderEdge {
  readonly target: Extract<BoardTarget, { readonly kind: 'EDGE' }>;
  readonly first: WorldPoint;
  readonly second: WorldPoint;
  readonly roadOwnerId: PlayerId | null;
  readonly isBoundary: boolean;
}

export interface RenderVertex {
  readonly target: Extract<BoardTarget, { readonly kind: 'VERTEX' }>;
  readonly position: WorldPoint;
  readonly building: BuildingState | null;
  readonly knight: KnightState | null;
}

export interface RenderPort {
  readonly target: Extract<BoardTarget, { readonly kind: 'PORT' }>;
  readonly edgeId: EdgeId;
  readonly position: WorldPoint;
  readonly shoreConnections: readonly [WorldPoint, WorldPoint];
  readonly label: string;
  readonly tradeRatio: 2 | 3;
  readonly resourceId: ResourceId | null;
}

export interface BoardRenderModel {
  readonly hexes: readonly RenderHex[];
  readonly edges: readonly RenderEdge[];
  readonly vertices: readonly RenderVertex[];
  readonly ports: readonly RenderPort[];
  readonly bounds: {
    readonly minimumX: number;
    readonly maximumX: number;
    readonly minimumY: number;
    readonly maximumY: number;
  };
}

function vertexPositions(board: BoardState, hexSize: number): ReadonlyMap<VertexId, WorldPoint> {
  const positions = new Map<VertexId, WorldPoint>();

  for (const hex of Object.values(board.hexes)) {
    hex.vertexIds.forEach((id, cornerIndex) => {
      const topology = hexCornerToTopology(hex, cornerIndex);
      const position = topologyToWorld(topology, hexSize);
      const previous = positions.get(id);
      if (
        previous !== undefined &&
        (Math.abs(previous.x - position.x) > Number.EPSILON ||
          Math.abs(previous.y - position.y) > Number.EPSILON)
      ) {
        throw new Error(`Vertex ${id} maps to conflicting board positions.`);
      }
      positions.set(id, position);
    });
  }

  return positions;
}

function renderHex(
  hex: HexState,
  positions: ReadonlyMap<VertexId, WorldPoint>,
  robberHexId: HexId | null,
  merchant: KNState['merchant'],
  hexSize: number,
): RenderHex {
  const terrain = TERRAINS.find((definition) => definition.id === hex.terrainId);
  if (terrain === undefined) throw new Error(`Cannot render unknown terrain ${hex.terrainId}.`);

  return {
    target: { kind: 'HEX', id: hex.id },
    center: axialToWorld(hex, hexSize),
    corners: hex.vertexIds.map((vertexId) => {
      const position = positions.get(vertexId);
      if (position === undefined) throw new Error(`Cannot render unknown vertex ${vertexId}.`);
      return position;
    }),
    terrainName: terrain.displayName,
    terrainColor: terrain.color,
    numberToken: hex.numberToken,
    hasRobber: robberHexId === hex.id,
    merchantOwnerId: merchant?.hexId === hex.id ? merchant.ownerId : null,
  };
}

function renderEdge(edge: EdgeState, positions: ReadonlyMap<VertexId, WorldPoint>): RenderEdge {
  const first = positions.get(edge.vertexAId);
  const second = positions.get(edge.vertexBId);
  if (first === undefined || second === undefined) {
    throw new Error(`Cannot render ${edge.id} without both vertices.`);
  }
  return {
    target: { kind: 'EDGE', id: edge.id },
    first,
    second,
    roadOwnerId: edge.roadOwnerId,
    isBoundary: edge.adjacentHexIds.length === 1,
  };
}

function portLabel(port: PortState): string {
  if (port.resourceId === null) return `${port.tradeRatio}:1`;
  const resourceName = port.resourceId.charAt(0).toUpperCase() + port.resourceId.slice(1);
  return `${resourceName} ${port.tradeRatio}:1`;
}

function renderPort(
  port: PortState,
  edgeById: ReadonlyMap<EdgeId, RenderEdge>,
  hexSize: number,
): RenderPort {
  const edge = edgeById.get(port.edgeId);
  if (edge === undefined) throw new Error(`Cannot render ${port.id} without its boundary edge.`);
  const midpoint = {
    x: (edge.first.x + edge.second.x) / 2,
    y: (edge.first.y + edge.second.y) / 2,
  };
  const edgeDeltaX = edge.second.x - edge.first.x;
  const edgeDeltaY = edge.second.y - edge.first.y;
  const edgeLength = Math.hypot(edgeDeltaX, edgeDeltaY) || 1;
  let normalX = -edgeDeltaY / edgeLength;
  let normalY = edgeDeltaX / edgeLength;
  if (normalX * midpoint.x + normalY * midpoint.y < 0) {
    normalX *= -1;
    normalY *= -1;
  }
  const offset = hexSize * 0.55;

  return {
    target: { kind: 'PORT', id: port.id },
    edgeId: port.edgeId,
    position: {
      x: midpoint.x + normalX * offset,
      y: midpoint.y + normalY * offset,
    },
    shoreConnections: [edge.first, edge.second],
    label: portLabel(port),
    tradeRatio: port.tradeRatio,
    resourceId: port.resourceId,
  };
}

export function createBoardRenderModel(
  board: BoardState,
  hexSize = 70,
  knights: readonly KnightState[] = [],
  merchant: KNState['merchant'] = null,
): BoardRenderModel {
  const positions = vertexPositions(board, hexSize);
  const hexes = Object.values(board.hexes).map((hex) =>
    renderHex(hex, positions, board.robberHexId, merchant, hexSize),
  );
  const edges = Object.values(board.edges).map((edge) => renderEdge(edge, positions));
  const edgeById = new Map(edges.map((edge) => [edge.target.id, edge] as const));
  const vertices = Object.values(board.vertices).map((vertex): RenderVertex => {
    const position = positions.get(vertex.id);
    if (position === undefined) throw new Error(`Cannot render unknown vertex ${vertex.id}.`);
    return {
      target: { kind: 'VERTEX', id: vertex.id },
      position,
      building: vertex.building,
      knight: knights.find((knight) => knight.id === vertex.knightId) ?? null,
    };
  });
  const ports = Object.values(board.ports).map((port) => renderPort(port, edgeById, hexSize));
  const extentPoints = [
    ...hexes.flatMap((hex) => hex.corners),
    ...ports.map((port) => port.position),
  ];
  const xValues = extentPoints.map((point) => point.x);
  const yValues = extentPoints.map((point) => point.y);
  const padding = hexSize * 0.75;

  return {
    hexes,
    edges,
    vertices,
    ports,
    bounds: {
      minimumX: Math.min(...xValues) - padding,
      maximumX: Math.max(...xValues) + padding,
      minimumY: Math.min(...yValues) - padding,
      maximumY: Math.max(...yValues) + padding,
    },
  };
}
