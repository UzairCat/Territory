import { describe, expect, it } from 'vitest';

import { createBoardRenderModel } from '../../src/board-renderer/render-model';
import { generateBaseBoard, generateBoard } from '../../src/engine/board/generate-board';
import type { BoardState, KnightState } from '../../src/engine/core/game-state';
import { knightId, playerId } from '../../src/engine/core/ids';
import { createRandomState } from '../../src/engine/core/random';
import { MAPS } from '../../src/engine/maps/maps';

function modelFor(seed: string) {
  const { board } = generateBaseBoard(createRandomState(seed));
  return { board, model: createBoardRenderModel(board) };
}

describe('board render model', () => {
  it('maps every engine entity to one stable render target', () => {
    const { board, model } = modelFor('render-targets');

    expect(model.hexes).toHaveLength(19);
    expect(model.vertices).toHaveLength(54);
    expect(model.edges).toHaveLength(72);
    expect(model.ports).toHaveLength(9);
    expect(model.hexes.map((hex) => hex.target.id).sort()).toEqual(Object.keys(board.hexes).sort());
    expect(model.vertices.map((vertex) => vertex.target.id).sort()).toEqual(
      Object.keys(board.vertices).sort(),
    );
    expect(model.edges.map((edge) => edge.target.id).sort()).toEqual(
      Object.keys(board.edges).sort(),
    );
    expect(model.ports.map((port) => port.target.id).sort()).toEqual(
      Object.keys(board.ports).sort(),
    );
  });

  it('produces finite geometry and six corners for every tile', () => {
    const { model } = modelFor('render-geometry');
    const points = [
      ...model.hexes.flatMap((hex) => [hex.center, ...hex.corners]),
      ...model.vertices.map((vertex) => vertex.position),
      ...model.edges.flatMap((edge) => [edge.first, edge.second]),
      ...model.ports.map((port) => port.position),
    ];

    expect(model.hexes.every((hex) => hex.corners.length === 6)).toBe(true);
    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(
      true,
    );
    expect(model.bounds.minimumX).toBeLessThan(model.bounds.maximumX);
    expect(model.bounds.minimumY).toBeLessThan(model.bounds.maximumY);
  });

  it('carries both buildable shoreline connections and trade details into every port', () => {
    const { board, model } = modelFor('render-port-connections');

    for (const port of model.ports) {
      const edge = model.edges.find((candidate) => candidate.target.id === port.edgeId);
      const source = board.ports[port.target.id];
      expect(edge).toBeDefined();
      expect(source).toBeDefined();
      expect(port.shoreConnections).toEqual([edge?.first, edge?.second]);
      expect(port.tradeRatio).toBe(source?.tradeRatio);
      expect(port.resourceId).toBe(source?.resourceId);
      const [firstConnection, secondConnection] = port.shoreConnections;
      const firstDistance = Math.hypot(
        port.position.x - firstConnection.x,
        port.position.y - firstConnection.y,
      );
      const secondDistance = Math.hypot(
        port.position.x - secondConnection.x,
        port.position.y - secondConnection.y,
      );
      expect(firstDistance).toBeCloseTo(secondDistance, 8);
    }
  });

  it('keeps target geometry stable when a different seed changes board content', () => {
    const first = modelFor('render-first').model;
    const second = modelFor('render-second').model;
    const geometry = (model: typeof first) => ({
      hexes: model.hexes.map(({ target, center, corners }) => ({ target, center, corners })),
      edges: model.edges,
      vertices: model.vertices,
      ports: model.ports.map(({ target, edgeId, position }) => ({ target, edgeId, position })),
      bounds: model.bounds,
    });

    expect(geometry(second)).toEqual(geometry(first));
    expect(second.hexes.map((hex) => hex.terrainName)).not.toEqual(
      first.hexes.map((hex) => hex.terrainName),
    );
  });

  it('carries authoritative building and road ownership into the presentation model', () => {
    const { board } = modelFor('render-pieces');
    const vertex = Object.values(board.vertices)[0];
    const edge = Object.values(board.edges)[0];
    if (vertex === undefined || edge === undefined)
      throw new Error('Generated board has no target.');
    const ownerId = playerId('piece-owner');
    const boardWithPieces: BoardState = {
      ...board,
      vertices: {
        ...board.vertices,
        [vertex.id]: { ...vertex, building: { ownerId, type: 'HOUSE' } },
      },
      edges: {
        ...board.edges,
        [edge.id]: { ...edge, roadOwnerId: ownerId },
      },
    };

    const model = createBoardRenderModel(boardWithPieces);
    expect(model.vertices.find((target) => target.target.id === vertex.id)?.building).toEqual({
      ownerId,
      type: 'HOUSE',
    });
    expect(model.edges.find((target) => target.target.id === edge.id)?.roadOwnerId).toBe(ownerId);
  });

  it('renders a Knight from its authoritative vertex location even before the reverse link lands', () => {
    const { board } = modelFor('render-knight');
    const vertex = Object.values(board.vertices)[0];
    if (vertex === undefined) throw new Error('Generated board has no target vertex.');
    const knight: KnightState = {
      id: knightId('render-knight-piece'),
      ownerId: playerId('knight-owner'),
      vertexId: vertex.id,
      level: 1,
      active: false,
      placedTurn: 2,
      activeSinceTurn: null,
      lastActionTurn: null,
      upgradedTurn: null,
    };

    const renderedVertex = createBoardRenderModel(board, 70, [knight]).vertices.find(
      (candidate) => candidate.target.id === vertex.id,
    );

    expect(renderedVertex?.knight).toBe(knight);
  });

  it.each(MAPS)('points every $displayName port away from its own shoreline', (map) => {
    const { board } = generateBoard(map, createRandomState(`render-${map.id}`));
    const model = createBoardRenderModel(board);

    for (const port of model.ports) {
      const source = board.ports[port.target.id];
      const edge = source === undefined ? undefined : board.edges[source.edgeId];
      const shoreHexId = edge?.adjacentHexIds[0];
      const shoreHex = model.hexes.find((hex) => hex.target.id === shoreHexId);
      const [first, second] = port.shoreConnections;
      if (shoreHex === undefined || first === undefined || second === undefined) {
        throw new Error(`${port.target.id} is missing its shoreline geometry.`);
      }
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const shoreDistance = Math.hypot(
        midpoint.x - shoreHex.center.x,
        midpoint.y - shoreHex.center.y,
      );
      const portDistance = Math.hypot(
        port.position.x - shoreHex.center.x,
        port.position.y - shoreHex.center.y,
      );
      expect(portDistance).toBeGreaterThan(shoreDistance);
    }
  });

  it.each(MAPS)('keeps every $displayName port ship visually separated', (map) => {
    const hexSize = 70;
    const { board } = generateBoard(map, createRandomState(`render-${map.id}`));
    const ports = createBoardRenderModel(board, hexSize).ports;

    for (const [index, first] of ports.entries()) {
      for (const second of ports.slice(index + 1)) {
        const distance = Math.hypot(
          first.position.x - second.position.x,
          first.position.y - second.position.y,
        );
        expect(distance).toBeGreaterThanOrEqual(hexSize * 1.7);
      }
    }
  });
});
