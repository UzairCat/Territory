import { PROGRESS_CARDS } from '../content/progress-cards';
import type { ProgressCardInstance } from '../core/game-state';
import { cardInstanceId } from '../core/ids';
import type { CardInstanceId } from '../core/ids';
import { shuffle } from '../core/random';
import type { RandomState } from '../core/random';

export interface GeneratedProgressDeck {
  readonly cards: Readonly<Record<string, ProgressCardInstance>>;
  readonly deck: readonly CardInstanceId[];
  readonly random: RandomState;
}

export function generateProgressDeck(random: RandomState): GeneratedProgressDeck {
  const cards: Record<string, ProgressCardInstance> = {};
  const cardIds: CardInstanceId[] = [];

  for (const definition of PROGRESS_CARDS) {
    for (let copy = 1; copy <= definition.count; copy += 1) {
      const instanceId = cardInstanceId(`card-${definition.id}-${copy}`);
      cards[instanceId] = {
        instanceId,
        definitionId: definition.id,
        ownerId: null,
        purchasedTurn: null,
        playedTurn: null,
      };
      cardIds.push(instanceId);
    }
  }

  const shuffled = shuffle(random, cardIds);
  return { cards, deck: shuffled.value, random: shuffled.state };
}
