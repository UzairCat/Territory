import { COMMODITIES, HAND_GOODS } from '../content/commodities';
import { RESOURCES } from '../content/resources';
import { resourceBundle } from '../content/types';
import type { ResourceBundle } from '../content/types';
import type { PlayerState } from '../core/game-state';

export function canAfford(available: ResourceBundle, cost: ResourceBundle): boolean {
  return HAND_GOODS.every((resource) => (available[resource.id] ?? 0) >= (cost[resource.id] ?? 0));
}

export function addResourceBundles(first: ResourceBundle, second: ResourceBundle): ResourceBundle {
  return resourceBundle(
    HAND_GOODS.map((resource) => [
      resource.id,
      (first[resource.id] ?? 0) + (second[resource.id] ?? 0),
    ]),
  );
}

export function subtractResourceBundles(
  available: ResourceBundle,
  cost: ResourceBundle,
): ResourceBundle {
  return resourceBundle(
    HAND_GOODS.map((resource) => [
      resource.id,
      (available[resource.id] ?? 0) - (cost[resource.id] ?? 0),
    ]),
  );
}

export function playerHand(player: PlayerState): ResourceBundle {
  return resourceBundle(
    HAND_GOODS.map((good) => [
      good.id,
      (player.resources[good.id] ?? 0) + (player.commodities[good.id] ?? 0),
    ]),
  );
}

export function withPlayerHand(player: PlayerState, hand: ResourceBundle): PlayerState {
  return {
    ...player,
    resources: resourceBundle(RESOURCES.map((resource) => [resource.id, hand[resource.id] ?? 0])),
    commodities: resourceBundle(
      COMMODITIES.map((commodity) => [commodity.id, hand[commodity.id] ?? 0]),
    ),
  };
}

export function combinedBank(bank: ResourceBundle, commodityBank: ResourceBundle): ResourceBundle {
  return resourceBundle(
    HAND_GOODS.map((good) => [good.id, (bank[good.id] ?? 0) + (commodityBank[good.id] ?? 0)]),
  );
}

export function splitBank(hand: ResourceBundle): {
  readonly bank: ResourceBundle;
  readonly commodityBank: ResourceBundle;
} {
  return {
    bank: resourceBundle(RESOURCES.map((resource) => [resource.id, hand[resource.id] ?? 0])),
    commodityBank: resourceBundle(
      COMMODITIES.map((commodity) => [commodity.id, hand[commodity.id] ?? 0]),
    ),
  };
}
