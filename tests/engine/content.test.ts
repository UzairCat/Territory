import { describe, expect, it } from 'vitest';

import { BUILDING_DEFINITIONS } from '../../src/engine/content/buildings';
import { PROGRESS_CARDS } from '../../src/engine/content/progress-cards';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import type { AxialCoordinate } from '../../src/engine/content/types';
import { validateClassicContent } from '../../src/engine/content/validate-content';
import { coordinateLakeCount, coordinateLandMasses } from '../../src/engine/maps/map-utils';
import { MAPS } from '../../src/engine/maps/maps';
import { LAKE_LABYRINTH_MAP } from '../../src/engine/maps/themed-maps';
import { CLASSIC_MODE } from '../../src/engine/modes/classic';

function shapeKey(coordinates: readonly AxialCoordinate[]): string {
  const variants: string[] = [];
  for (const reflected of [false, true]) {
    let points = coordinates.map(({ q, r }) => (reflected ? { q: r, r: q } : { q, r }));
    for (let turn = 0; turn < 6; turn += 1) {
      const minimumQ = Math.min(...points.map(({ q }) => q));
      const minimumR = Math.min(...points.map(({ r }) => r));
      variants.push(
        points
          .map(({ q, r }) => `${q - minimumQ},${r - minimumR}`)
          .sort()
          .join(';'),
      );
      points = points.map(({ q, r }) => ({ q: -r, r: q + r }));
    }
  }
  return variants.sort()[0] ?? '';
}

describe('locked classic content', () => {
  it('passes all cross-definition invariants', () => {
    expect(validateClassicContent()).toEqual([]);
  });

  it('locks the agreed piece limits and resource costs', () => {
    expect(BUILDING_DEFINITIONS.ROAD.initialSupply).toBe(15);
    expect(BUILDING_DEFINITIONS.HOUSE.initialSupply).toBe(5);
    expect(BUILDING_DEFINITIONS.MANSION.initialSupply).toBe(4);
    expect(BUILDING_DEFINITIONS.ROAD.cost).toEqual({
      [RESOURCE_IDS.wood]: 1,
      [RESOURCE_IDS.brick]: 1,
    });
    expect(CLASSIC_MODE.rules.victoryTarget).toBe(10);
    expect(CLASSIC_MODE.rules.bankCardsPerResource).toBe(19);
  });

  it('defines every complete map, port pool, and the progress deck', () => {
    expect(
      MAPS.map((map) => [
        map.displayName,
        map.coordinates.length,
        map.portPool.length,
        map.landMassCount,
      ]),
    ).toEqual([
      ['Base - Small', 19, 9, 1],
      ['Base - Medium', 30, 11, 1],
      ['Base - Large', 37, 12, 1],
      ['Earth', 81, 27, 7],
      ['USA', 144, 25, 1],
      ['UK & Ireland', 63, 20, 3],
      ['Diamond', 24, 9, 1],
      ['Gear', 43, 14, 1],
      ['Lakes', 39, 9, 1],
      ['Pond', 24, 8, 1],
      ['Twirl', 42, 12, 1],
      ['Crownlands', 45, 14, 1],
      ['Four Kingdoms', 52, 16, 1],
      ['Crescent Bay', 43, 13, 1],
      ['Citadel', 43, 12, 1],
      ['Rift', 48, 15, 1],
      ["Dragon's Spine", 58, 18, 1],
      ['Compass Rose', 46, 16, 1],
      ['Hourglass', 39, 12, 1],
      ['Clover', 41, 12, 1],
      ['Great River', 56, 17, 2],
      ['Atoll', 41, 12, 1],
      ['Archipelago', 50, 15, 3],
      ['Twin Fjords', 50, 15, 1],
      ['Lake Labyrinth', 48, 14, 1],
    ]);
    for (const map of MAPS) {
      const wastelandCount = map.terrainPool.filter((terrain) => terrain === 'wasteland').length;
      expect(map.terrainPool).toHaveLength(map.coordinates.length);
      expect(map.numberTokenPool).toHaveLength(map.coordinates.length - wastelandCount);
    }
    expect(PROGRESS_CARDS.reduce((total, card) => total + card.count, 0)).toBe(25);
    expect(
      PROGRESS_CARDS.map(({ displayName, count, artwork, victoryPoints }) => ({
        displayName,
        count,
        artwork,
        victoryPoints,
      })),
    ).toEqual([
      { displayName: 'Knight', count: 14, artwork: 'KNIGHT', victoryPoints: 0 },
      { displayName: 'Road Building', count: 2, artwork: 'ROAD_BUILDING', victoryPoints: 0 },
      {
        displayName: 'Year of Plenty',
        count: 2,
        artwork: 'YEAR_OF_PLENTY',
        victoryPoints: 0,
      },
      { displayName: 'Monopoly', count: 2, artwork: 'MONOPOLY', victoryPoints: 0 },
      { displayName: 'Chapel', count: 1, artwork: 'CHAPEL', victoryPoints: 1 },
      { displayName: 'Library', count: 1, artwork: 'LIBRARY', victoryPoints: 1 },
      { displayName: 'Market', count: 1, artwork: 'MARKET', victoryPoints: 1 },
      { displayName: 'Palace', count: 1, artwork: 'PALACE', victoryPoints: 1 },
      { displayName: 'University', count: 1, artwork: 'UNIVERSITY', victoryPoints: 1 },
    ]);
    expect(new Set(PROGRESS_CARDS.map((card) => card.artwork)).size).toBe(9);
  });

  it('gives every map a unique id and silhouette, even after rotation or reflection', () => {
    expect(new Set(MAPS.map((map) => map.id)).size).toBe(MAPS.length);
    expect(new Set(MAPS.map((map) => shapeKey(map.coordinates))).size).toBe(MAPS.length);
  });

  it('keeps all ten Lake Labyrinth lakes enclosed by one connected island', () => {
    expect(coordinateLandMasses(LAKE_LABYRINTH_MAP.coordinates)).toHaveLength(1);
    expect(coordinateLakeCount(LAKE_LABYRINTH_MAP.coordinates)).toBe(10);
  });
});
