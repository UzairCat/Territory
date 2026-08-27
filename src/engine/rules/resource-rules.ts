import { RESOURCES } from '../content/resources';
import { resourceBundle } from '../content/types';
import type { ResourceBundle } from '../content/types';

export function canAfford(available: ResourceBundle, cost: ResourceBundle): boolean {
  return RESOURCES.every((resource) => (available[resource.id] ?? 0) >= (cost[resource.id] ?? 0));
}

export function addResourceBundles(first: ResourceBundle, second: ResourceBundle): ResourceBundle {
  return resourceBundle(
    RESOURCES.map((resource) => [
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
    RESOURCES.map((resource) => [
      resource.id,
      (available[resource.id] ?? 0) - (cost[resource.id] ?? 0),
    ]),
  );
}
