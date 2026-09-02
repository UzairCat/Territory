import type { BoardState } from '../engine/core/game-state';

export function boardVisualKey(board: BoardState): string {
  const parts = [`robber:${board.robberHexId ?? ''}`];
  for (const hex of Object.values(board.hexes)) {
    parts.push(
      `h:${hex.id}:${hex.q}:${hex.r}:${hex.terrainId}:${hex.resourceId ?? ''}:${hex.numberToken ?? ''}`,
    );
  }
  for (const vertex of Object.values(board.vertices)) {
    const building = vertex.building;
    parts.push(
      building === null
        ? `v:${vertex.id}:empty:${vertex.knightId ?? ''}:${vertex.portId ?? ''}`
        : `v:${vertex.id}:${building.ownerId}:${building.type}:${building.hasWall ? 1 : 0}:${building.metropolis ?? ''}:${vertex.knightId ?? ''}:${vertex.portId ?? ''}`,
    );
  }
  for (const edge of Object.values(board.edges)) {
    parts.push(
      `e:${edge.id}:${edge.vertexAId}:${edge.vertexBId}:${edge.roadOwnerId ?? ''}:${edge.portId ?? ''}`,
    );
  }
  for (const port of Object.values(board.ports)) {
    parts.push(
      `p:${port.id}:${port.edgeId}:${port.tradeRatio}:${port.resourceId ?? ''}:${port.vertexIds.join(',')}`,
    );
  }
  return parts.join('|');
}
