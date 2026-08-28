import { KN_PROGRESS_CARDS, KN_PROGRESS_FAMILIES } from '../content/kn-progress-cards';
import type { KNProgressFamily } from '../content/types';
import type { KNProgressCardInstance } from '../core/game-state';
import { cardInstanceId } from '../core/ids';
import type { CardInstanceId } from '../core/ids';
import { shuffle } from '../core/random';
import type { RandomState } from '../core/random';

export interface GeneratedKNProgressDecks {
  readonly cards: Readonly<Record<string, KNProgressCardInstance>>;
  readonly decks: Readonly<Record<KNProgressFamily, readonly CardInstanceId[]>>;
  readonly random: RandomState;
}

export function generateKNProgressDecks(random: RandomState): GeneratedKNProgressDecks {
  const cards: Record<string, KNProgressCardInstance> = {};
  const familyCards: Record<KNProgressFamily, CardInstanceId[]> = {
    SCIENCE: [],
    TRADE: [],
    POLITICS: [],
  };

  for (const definition of KN_PROGRESS_CARDS) {
    for (let copy = 1; copy <= definition.count; copy += 1) {
      const instanceId = cardInstanceId(`kn-card-${definition.id}-${copy}`);
      cards[instanceId] = {
        instanceId,
        definitionId: definition.id,
        ownerId: null,
        drawnTurn: null,
        playedTurn: null,
        revealed: false,
      };
      familyCards[definition.family].push(instanceId);
    }
  }

  let nextRandom = random;
  const decks = Object.fromEntries(
    KN_PROGRESS_FAMILIES.map((family) => {
      const shuffled = shuffle(nextRandom, familyCards[family]);
      nextRandom = shuffled.state;
      return [family, shuffled.value] as const;
    }),
  ) as Readonly<Record<KNProgressFamily, readonly CardInstanceId[]>>;

  return { cards, decks, random: nextRandom };
}
