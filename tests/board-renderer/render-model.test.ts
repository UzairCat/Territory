import { describe, expect, it } from 'vitest';

import { createBoardRenderModel } from '../../src/board-renderer/render-model';
import { generateBaseBoard } from '../../src/engine/board/generate-board';
import type { BoardState } from '../../src/engine/core/game-state';
import { playerId } from '../../src/engine/core/ids';
import { createRandomState } from '../../src/engine/core/random';

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
});
