import type { BalancedDiceState, GameState } from '../core/game-state';
import { nextRandom, randomInteger } from '../core/random';
import type { RandomState } from '../core/random';

const FULL_DICE_DECK = Array.from({ length: 36 }, (_, index) => index);
const RESHUFFLE_AT_CARDS = 12;
const RECENT_ROLL_MEMORY = 2;
const RECENT_TOTAL_REDUCTION = 0.3;

export interface NumericDiceRoll {
  readonly dice: readonly [number, number];
  readonly random: RandomState;
  readonly balancedDice: BalancedDiceState | null;
}

function pairFromId(id: number): readonly [number, number] {
  return [Math.floor(id / 6) + 1, (id % 6) + 1];
}

function balancedRoll(state: GameState): NumericDiceRoll {
  const existing = state.balancedDice ?? { remainingPairIds: FULL_DICE_DECK, recentTotals: [] };
  const deck =
    existing.remainingPairIds.length <= RESHUFFLE_AT_CARDS
      ? [...FULL_DICE_DECK]
      : [...existing.remainingPairIds];
  const weighted = deck.map((id) => {
    const dice = pairFromId(id);
    const total = dice[0] + dice[1];
    const recentMatches = existing.recentTotals.filter((recent) => recent === total).length;
    return {
      id,
      dice,
      total,
      weight: Math.max(0.05, 1 - recentMatches * RECENT_TOTAL_REDUCTION),
    };
  });
  const totalWeight = weighted.reduce((total, candidate) => total + candidate.weight, 0);
  const random = nextRandom(state.random);
  let cursor = random.value * totalWeight;
  let selected = weighted.at(-1)!;
  for (const candidate of weighted) {
    if (cursor <= candidate.weight) {
      selected = candidate;
      break;
    }
    cursor -= candidate.weight;
  }

  return {
    dice: selected.dice,
    random: random.state,
    balancedDice: {
      remainingPairIds: deck.filter((id) => id !== selected.id),
      recentTotals: [...existing.recentTotals, selected.total].slice(-RECENT_ROLL_MEMORY),
    },
  };
}

export function rollNumericDice(state: GameState): NumericDiceRoll {
  if (state.config.balancedDice === true) return balancedRoll(state);
  const first = randomInteger(state.random, 1, 7);
  const second = randomInteger(first.state, 1, 7);
  return {
    dice: [first.value, second.value],
    random: second.state,
    balancedDice: state.balancedDice,
  };
}
