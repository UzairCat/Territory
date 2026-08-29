import { describe, expect, it } from 'vitest';

import { generateBaseBoard, generateBoard } from '../../src/engine/board/generate-board';
import { areAxialNeighbors } from '../../src/engine/board/geometry';
import { validateBoard } from '../../src/engine/board/validate-board';
import type { BoardState } from '../../src/engine/core/game-state';
import { createRandomState } from '../../src/engine/core/random';
import { TERRAIN_IDS } from '../../src/engine/content/resources';
import { MAPS } from '../../src/engine/maps/maps';
import { coordinateLakeCount, coordinateLandMasses } from '../../src/engine/maps/map-utils';

describe('Base Map generation', () => {
  it('creates the complete deterministic topology and passes validation', () => {
    const initial = createRandomState('board-seed');
    const first = generateBaseBoard(initial);
    const second = generateBaseBoard(createRandomState('board-seed'));

    expect(second).toEqual(first);
    expect(initial.draws).toBe(0);
    expect(validateBoard(first.board)).toEqual([]);
    expect(Object.keys(first.board.hexes)).toHaveLength(19);
    expect(Object.keys(first.board.vertices)).toHaveLength(54);
    expect(Object.keys(first.board.edges)).toHaveLength(72);
    expect(Object.keys(first.board.ports)).toHaveLength(9);
  });

  it('keeps topology IDs stable while randomizing content for different seeds', () => {
    const first = generateBaseBoard(createRandomState('first-board'));
    const second = generateBaseBoard(createRandomState('second-board'));

    expect(Object.keys(first.board.vertices).sort()).toEqual(
      Object.keys(second.board.vertices).sort(),
    );
    expect(Object.keys(first.board.edges).sort()).toEqual(Object.keys(second.board.edges).sort());
    expect(Object.values(first.board.hexes).map((hex) => hex.terrainId)).not.toEqual(
      Object.values(second.board.hexes).map((hex) => hex.terrainId),
    );
  });

  it('places the robber on wasteland and never places adjacent 6 or 8 tokens', () => {
    const { board } = generateBaseBoard(createRandomState('balanced-board'));
    expect(board.robberHexId).not.toBeNull();
    expect(board.robberHexId === null ? null : board.hexes[board.robberHexId]?.terrainId).toBe(
      TERRAIN_IDS.wasteland,
    );

    const highProbabilityHexes = Object.values(board.hexes).filter(
      (hex) => hex.numberToken === 6 || hex.numberToken === 8,
    );
    for (let index = 0; index < highProbabilityHexes.length; index += 1) {
      const first = highProbabilityHexes[index];
      if (first === undefined) continue;
      for (const second of highProbabilityHexes.slice(index + 1)) {
        expect(areAxialNeighbors(first, second)).toBe(false);
      }
    }
  });

  it('reports a malformed robber location without mutating the board', () => {
    const { board } = generateBaseBoard(createRandomState('validation-board'));
    const invalid: BoardState = { ...board, robberHexId: null };

    expect(validateBoard(invalid).map((entry) => entry.code)).toContain('INVALID_ROBBER_START');
    expect(board.robberHexId).not.toBeNull();
  });

  it('rejects a port whose vertices do not match its coastal edge', () => {
    const { board } = generateBaseBoard(createRandomState('invalid-port-board'));
    const [port] = Object.values(board.ports);
    const replacementVertex = Object.values(board.vertices).find(
      (vertex) => port !== undefined && !port.vertexIds.includes(vertex.id),
    );
    if (port === undefined || replacementVertex === undefined) {
      throw new Error('Generated board is missing a port or replacement vertex.');
    }
    const invalid: BoardState = {
      ...board,
      ports: {
        ...board.ports,
        [port.id]: { ...port, vertexIds: [port.vertexIds[0], replacementVertex.id] },
      },
    };

    expect(validateBoard(invalid).map((entry) => entry.code)).toContain('INVALID_PORT_PLACEMENT');
  });
});

describe('all map generation', () => {
  it.each(MAPS)('$displayName creates its complete deterministic topology', (map) => {
    const seed = `map-${map.id}`;
    const first = generateBoard(map, createRandomState(seed));
    const second = generateBoard(map, createRandomState(seed));

    expect(second).toEqual(first);
    expect(validateBoard(first.board, map)).toEqual([]);
    expect(Object.keys(first.board.hexes)).toHaveLength(map.coordinates.length);
    expect(Object.keys(first.board.ports)).toHaveLength(map.portPool.length);
    expect(coordinateLandMasses(map.coordinates)).toHaveLength(map.landMassCount);
    if (map.lakeCount !== undefined) {
      expect(coordinateLakeCount(map.coordinates)).toBe(map.lakeCount);
    }

    const portVertexIds = Object.values(first.board.ports).flatMap((port) => port.vertexIds);
    expect(new Set(portVertexIds)).toHaveLength(portVertexIds.length);
  });
});
