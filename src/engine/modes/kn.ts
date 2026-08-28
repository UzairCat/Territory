import { BUILDING_DEFINITIONS } from '../content/buildings';
import { RESOURCE_IDS } from '../content/resources';
import { resourceBundle } from '../content/types';
import type { GameModeDefinition } from '../content/types';
import { modeId } from '../core/ids';

export const KN_MODE_ID = modeId('k-n');

export const KN_MODE = {
  id: KN_MODE_ID,
  displayName: 'K+N',
  description:
    'Advanced Cities, Knights, commodities, city improvements, Progress Cards, Metropolises, and barbarian attacks.',
  kind: 'K_N',
  rules: {
    playerCount: { minimum: 2, maximum: 4 },
    victoryTarget: 13,
    dice: { count: 2, sides: 6, robberTotal: 7 },
    robberFlowEnabled: true,
    discardThreshold: 7,
    bankCardsPerResource: 19,
    bankTradeRatio: 4,
    cardPlayLimitPerTurn: 1,
    canPlayCardOnPurchaseTurn: false,
    productionShortageRule: 'CANCEL_RESOURCE_TYPE',
    longestRoad: {
      minimum: 5,
      victoryPoints: 2,
      incumbentRetainsTie: true,
      unheldTieAwardsNobody: true,
    },
    largestForce: {
      minimum: 999,
      victoryPoints: 0,
      incumbentRetainsTie: true,
      unheldTieAwardsNobody: true,
    },
    buildingCosts: {
      ROAD: BUILDING_DEFINITIONS.ROAD.cost,
      HOUSE: BUILDING_DEFINITIONS.HOUSE.cost,
      MANSION: BUILDING_DEFINITIONS.MANSION.cost,
    },
    progressCardCost: resourceBundle([
      [RESOURCE_IDS.grain, 1],
      [RESOURCE_IDS.livestock, 1],
      [RESOURCE_IDS.ore, 1],
    ]),
  },
} as const satisfies GameModeDefinition;
