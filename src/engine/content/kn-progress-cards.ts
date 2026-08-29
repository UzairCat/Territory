import { cardDefinitionId } from '../core/ids';
import type { CardDefinitionId } from '../core/ids';
import type { KNProgressFamily } from './types';

export type KNProgressEffect =
  | 'ALCHEMIST'
  | 'CRANE'
  | 'ENGINEER'
  | 'INVENTOR'
  | 'IRRIGATION'
  | 'MEDICINE'
  | 'MINING'
  | 'PRINTER'
  | 'ROAD_BUILDING'
  | 'SMITH'
  | 'COMMERCIAL_HARBOR'
  | 'MASTER_MERCHANT'
  | 'MERCHANT_FLEET'
  | 'MERCHANT'
  | 'RESOURCE_MONOPOLY'
  | 'COMMODITY_MONOPOLY'
  | 'RECLAMATION'
  | 'BISHOP'
  | 'CONSTITUTION'
  | 'DESERTER'
  | 'DIPLOMAT'
  | 'WAR_DRUMS'
  | 'SABOTEUR'
  | 'SPY'
  | 'WARLORD'
  | 'WEDDING';

export interface KNProgressCardDefinition {
  readonly id: CardDefinitionId;
  readonly family: KNProgressFamily;
  readonly displayName: string;
  readonly description: string;
  readonly count: number;
  readonly effect: KNProgressEffect;
  readonly revealedVictoryPoints: number;
}

const science = (
  effect: KNProgressEffect,
  displayName: string,
  count: number,
  description: string,
  revealedVictoryPoints = 0,
): KNProgressCardDefinition => ({
  id: cardDefinitionId(`kn-science-${effect.toLocaleLowerCase().replaceAll('_', '-')}`),
  family: 'SCIENCE',
  displayName,
  description,
  count,
  effect,
  revealedVictoryPoints,
});

const trade = (
  effect: KNProgressEffect,
  displayName: string,
  count: number,
  description: string,
): KNProgressCardDefinition => ({
  id: cardDefinitionId(`kn-trade-${effect.toLocaleLowerCase().replaceAll('_', '-')}`),
  family: 'TRADE',
  displayName,
  description,
  count,
  effect,
  revealedVictoryPoints: 0,
});

const politics = (
  effect: KNProgressEffect,
  displayName: string,
  count: number,
  description: string,
  revealedVictoryPoints = 0,
): KNProgressCardDefinition => ({
  id: cardDefinitionId(`kn-politics-${effect.toLocaleLowerCase().replaceAll('_', '-')}`),
  family: 'POLITICS',
  displayName,
  description,
  count,
  effect,
  revealedVictoryPoints,
});

export const KN_PROGRESS_CARDS: readonly KNProgressCardDefinition[] = [
  science(
    'ALCHEMIST',
    'Alchemist',
    2,
    'Before rolling, choose the red and regular numeric dice. The Event die still rolls normally.',
  ),
  science(
    'CRANE',
    'Crane',
    2,
    'Your next city-improvement purchase costs one fewer matching commodity.',
  ),
  science('ENGINEER', 'Engineer', 1, 'Build one Wall for free on an eligible City.'),
  science(
    'INVENTOR',
    'Inventor',
    2,
    'Swap two eligible number tokens. Tokens 2, 6, 8, and 12 cannot be moved.',
  ),
  science(
    'IRRIGATION',
    'Irrigation',
    2,
    'Gain two Grain for every distinct Field tile touching one of your buildings.',
  ),
  science('MEDICINE', 'Medicine', 2, 'Upgrade one House to a City for two Ore and one Grain.'),
  science(
    'MINING',
    'Mining',
    2,
    'Gain two Ore for every distinct Mountain tile touching one of your buildings.',
  ),
  science('PRINTER', 'Printer', 1, 'Reveal immediately for one permanent victory point.', 1),
  science('ROAD_BUILDING', 'Road Building', 2, 'Place up to two connected Roads for free.'),
  science('SMITH', 'Smith', 2, 'Upgrade up to two eligible Knights by one level for free.'),
  trade(
    'COMMERCIAL_HARBOR',
    'Commercial Harbor',
    2,
    'Offer one resource to each opponent in exchange for a commodity of their choice. You may stop early.',
  ),
  trade(
    'MASTER_MERCHANT',
    'Master Merchant',
    2,
    'Choose a player with more points and take up to two chosen hand cards.',
  ),
  trade(
    'MERCHANT_FLEET',
    'Merchant Fleet',
    2,
    'Choose one hand-card type to trade at 2:1 until the end of this turn.',
  ),
  trade(
    'MERCHANT',
    'Merchant',
    4,
    'Place the Merchant on an adjacent producing tile for one point and a 2:1 trade rate.',
  ),
  trade(
    'RESOURCE_MONOPOLY',
    'Resource Monopoly',
    4,
    'Take up to two cards of one basic resource from every opponent.',
  ),
  trade(
    'COMMODITY_MONOPOLY',
    'Commodity Monopoly',
    3,
    'Take one card of one commodity from every opponent.',
  ),
  trade(
    'RECLAMATION',
    'Reclamation',
    1,
    'Permanently change one producing tile without the robber or a 6/8 token into a different resource terrain.',
  ),
  politics(
    'BISHOP',
    'Bishop',
    2,
    'Move the robber and steal one random hand card from every eligible opponent on its new tile.',
  ),
  politics(
    'CONSTITUTION',
    'Constitution',
    1,
    'Reveal immediately for one permanent victory point.',
    1,
  ),
  politics(
    'DESERTER',
    'Deserter',
    2,
    'Force an opponent to remove a Knight, then place one of your available Knights for free.',
  ),
  politics(
    'DIPLOMAT',
    'Diplomat',
    2,
    'Remove one open Road. If it was yours, you may relocate it.',
  ),
  politics(
    'WAR_DRUMS',
    'War Drums',
    2,
    'Move the barbarian fleet one space forward, one space back, or two spaces back.',
  ),
  politics(
    'SABOTEUR',
    'Saboteur',
    2,
    'Opponents with at least your score discard half of their resource and commodity hand.',
  ),
  politics('SPY', 'Spy', 3, 'Inspect an opponent’s non-victory Progress Cards and steal one.'),
  politics('WARLORD', 'Warlord', 2, 'Activate all of your Knights for free.'),
  politics(
    'WEDDING',
    'Wedding',
    2,
    'Each opponent with more points gives you up to two hand cards of their choice.',
  ),
] as const;

export const KN_PROGRESS_FAMILIES: readonly KNProgressFamily[] = [
  'SCIENCE',
  'TRADE',
  'POLITICS',
] as const;

export function getKNProgressCardDefinition(
  definitionId: CardDefinitionId,
): KNProgressCardDefinition | undefined {
  return KN_PROGRESS_CARDS.find((definition) => definition.id === definitionId);
}
