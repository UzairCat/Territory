import { cardDefinitionId } from '../core/ids';
import type { ProgressCardDefinition } from './types';

export const PROGRESS_CARD_IDS = {
  guard: cardDefinitionId('guard'),
  roadworks: cardDefinitionId('roadworks'),
  plenty: cardDefinitionId('plenty'),
  monopoly: cardDefinitionId('monopoly'),
  victoryPoint: cardDefinitionId('victory-point'),
} as const;

export const PROGRESS_CARDS: readonly ProgressCardDefinition[] = [
  {
    id: PROGRESS_CARD_IDS.guard,
    displayName: 'Guard',
    description: 'Move the robber and steal from an eligible opponent.',
    count: 14,
    effect: 'MOVE_ROBBER',
    countsTowardForce: true,
    victoryPoints: 0,
  },
  {
    id: PROGRESS_CARD_IDS.roadworks,
    displayName: 'Roadworks',
    description: 'Place two roads without paying their resource costs.',
    count: 2,
    effect: 'PLACE_TWO_ROADS',
    countsTowardForce: false,
    victoryPoints: 0,
  },
  {
    id: PROGRESS_CARD_IDS.plenty,
    displayName: 'Plenty',
    description: 'Take two available resource cards from the bank.',
    count: 2,
    effect: 'TAKE_TWO_RESOURCES',
    countsTowardForce: false,
    victoryPoints: 0,
  },
  {
    id: PROGRESS_CARD_IDS.monopoly,
    displayName: 'Monopoly',
    description: 'Choose a resource and take all of it from your opponents.',
    count: 2,
    effect: 'MONOPOLY',
    countsTowardForce: false,
    victoryPoints: 0,
  },
  {
    id: PROGRESS_CARD_IDS.victoryPoint,
    displayName: 'Territory Charter',
    description: 'Worth one hidden victory point.',
    count: 5,
    effect: 'VICTORY_POINT',
    countsTowardForce: false,
    victoryPoints: 1,
  },
] as const;
