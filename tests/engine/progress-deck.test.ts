import { describe, expect, it } from 'vitest';

import { generateProgressDeck } from '../../src/engine/cards/generate-deck';
import { PROGRESS_CARDS } from '../../src/engine/content/progress-cards';
import { createRandomState } from '../../src/engine/core/random';

describe('progress deck generation', () => {
  it('creates and deterministically shuffles all 25 card instances', () => {
    const first = generateProgressDeck(createRandomState('deck-seed'));
    const second = generateProgressDeck(createRandomState('deck-seed'));

    expect(second).toEqual(first);
    expect(first.deck).toHaveLength(25);
    expect(Object.keys(first.cards)).toHaveLength(25);
    expect(new Set(first.deck).size).toBe(25);

    for (const definition of PROGRESS_CARDS) {
      expect(
        Object.values(first.cards).filter((card) => card.definitionId === definition.id),
      ).toHaveLength(definition.count);
    }
  });
});
