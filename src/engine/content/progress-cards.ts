import { cardDefinitionId } from '../core/ids';
import type { ProgressCardDefinition } from './types';

const KNIGHT_ID = cardDefinitionId('knight');
const ROAD_BUILDING_ID = cardDefinitionId('road-building');
const YEAR_OF_PLENTY_ID = cardDefinitionId('year-of-plenty');
const MONOPOLY_ID = cardDefinitionId('monopoly');
const CHAPEL_ID = cardDefinitionId('chapel');
const LIBRARY_ID = cardDefinitionId('library');
const MARKET_ID = cardDefinitionId('market');
const PALACE_ID = cardDefinitionId('palace');
const UNIVERSITY_ID = cardDefinitionId('university');

export const PROGRESS_CARD_IDS = {
  knight: KNIGHT_ID,
  roadBuilding: ROAD_BUILDING_ID,
  yearOfPlenty: YEAR_OF_PLENTY_ID,
  monopoly: MONOPOLY_ID,
  chapel: CHAPEL_ID,
  library: LIBRARY_ID,
  market: MARKET_ID,
  palace: PALACE_ID,
  university: UNIVERSITY_ID,
  // Compatibility aliases for saves and integrations created before the card-name pass.
  guard: KNIGHT_ID,
  roadworks: ROAD_BUILDING_ID,
  plenty: YEAR_OF_PLENTY_ID,
  victoryPoint: CHAPEL_ID,
} as const;

export const PROGRESS_CARDS: readonly ProgressCardDefinition[] = [
  {
    id: PROGRESS_CARD_IDS.knight,
    displayName: 'Knight',
    description: 'Move the robber and steal from an eligible opponent.',
    count: 14,
    effect: 'MOVE_ROBBER',
    artwork: 'KNIGHT',
    countsTowardForce: true,
    victoryPoints: 0,
  },
  {
    id: PROGRESS_CARD_IDS.roadBuilding,
    displayName: 'Road Building',
    description: 'Place two roads without paying their resource costs.',
    count: 2,
    effect: 'PLACE_TWO_ROADS',
    artwork: 'ROAD_BUILDING',
    countsTowardForce: false,
    victoryPoints: 0,
  },
  {
    id: PROGRESS_CARD_IDS.yearOfPlenty,
    displayName: 'Year of Plenty',
    description: 'Take two available resource cards from the bank.',
    count: 2,
    effect: 'TAKE_TWO_RESOURCES',
    artwork: 'YEAR_OF_PLENTY',
    countsTowardForce: false,
    victoryPoints: 0,
  },
  {
    id: PROGRESS_CARD_IDS.monopoly,
    displayName: 'Monopoly',
    description: 'Choose a resource and take all of it from your opponents.',
    count: 2,
    effect: 'MONOPOLY',
    artwork: 'MONOPOLY',
    countsTowardForce: false,
    victoryPoints: 0,
  },
  {
    id: PROGRESS_CARD_IDS.chapel,
    displayName: 'Chapel',
    description: 'Worth one hidden victory point.',
    count: 1,
    effect: 'VICTORY_POINT',
    artwork: 'CHAPEL',
    countsTowardForce: false,
    victoryPoints: 1,
  },
  {
    id: PROGRESS_CARD_IDS.library,
    displayName: 'Library',
    description: 'Worth one hidden victory point.',
    count: 1,
    effect: 'VICTORY_POINT',
    artwork: 'LIBRARY',
    countsTowardForce: false,
    victoryPoints: 1,
  },
  {
    id: PROGRESS_CARD_IDS.market,
    displayName: 'Market',
    description: 'Worth one hidden victory point.',
    count: 1,
    effect: 'VICTORY_POINT',
    artwork: 'MARKET',
    countsTowardForce: false,
    victoryPoints: 1,
  },
  {
    id: PROGRESS_CARD_IDS.palace,
    displayName: 'Palace',
    description: 'Worth one hidden victory point.',
    count: 1,
    effect: 'VICTORY_POINT',
    artwork: 'PALACE',
    countsTowardForce: false,
    victoryPoints: 1,
  },
  {
    id: PROGRESS_CARD_IDS.university,
    displayName: 'University',
    description: 'Worth one hidden victory point.',
    count: 1,
    effect: 'VICTORY_POINT',
    artwork: 'UNIVERSITY',
    countsTowardForce: false,
    victoryPoints: 1,
  },
] as const;
