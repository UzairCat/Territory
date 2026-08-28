import { describe, expect, it } from 'vitest';

import { BUILDING_DEFINITIONS } from '../../src/engine/content/buildings';
import { PROGRESS_CARDS } from '../../src/engine/content/progress-cards';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { validateClassicContent } from '../../src/engine/content/validate-content';
import { BASE_MAP } from '../../src/engine/maps/base-map';
import { CLASSIC_MODE } from '../../src/engine/modes/classic';

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

  it('defines the complete base map, ports, and progress deck', () => {
    expect(BASE_MAP.coordinates).toHaveLength(19);
    expect(BASE_MAP.terrainPool).toHaveLength(19);
    expect(BASE_MAP.numberTokenPool).toHaveLength(18);
    expect(BASE_MAP.portPool).toHaveLength(9);
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
});
