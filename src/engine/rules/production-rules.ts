import { BUILDING_DEFINITIONS } from '../content/buildings';
import { RESOURCES } from '../content/resources';
import { resourceBundle } from '../content/types';
import type { ResourceBundle } from '../content/types';
import type { GameState, PlayerState } from '../core/game-state';
import type { PlayerId, ResourceId } from '../core/ids';

export type ProductionDemand = Readonly<Record<string, ResourceBundle>>;

export interface ProductionResolution {
  readonly demand: ProductionDemand;
  readonly grants: Readonly<Record<string, ResourceBundle>>;
  readonly unavailableResourceIds: readonly ResourceId[];
  readonly players: GameState['players'];
  readonly bank: ResourceBundle;
}

export function calculateProductionDemand(state: GameState, diceTotal: number): ProductionDemand {
  const demand = new Map<PlayerId, Map<ResourceId, number>>();

  for (const hex of Object.values(state.board.hexes)) {
    if (
      hex.numberToken !== diceTotal ||
      hex.id === state.board.robberHexId ||
      hex.resourceId === null
    ) {
      continue;
    }

    for (const vertexId of hex.vertexIds) {
      const building = state.board.vertices[vertexId]?.building;
      if (
        building === null ||
        building === undefined ||
        state.players[building.ownerId] === undefined
      ) {
        continue;
      }

      const playerDemand = demand.get(building.ownerId) ?? new Map<ResourceId, number>();
      const multiplier = BUILDING_DEFINITIONS[building.type].productionMultiplier;
      playerDemand.set(hex.resourceId, (playerDemand.get(hex.resourceId) ?? 0) + multiplier);
      demand.set(building.ownerId, playerDemand);
    }
  }

  return Object.fromEntries(
    [...demand].map(([playerId, resources]) => [playerId, resourceBundle([...resources])]),
  );
}

function bundleTotal(bundle: ResourceBundle): number {
  return RESOURCES.reduce((total, resource) => total + (bundle[resource.id] ?? 0), 0);
}

function addResources(player: PlayerState, grants: ResourceBundle): PlayerState {
  return {
    ...player,
    resources: resourceBundle(
      RESOURCES.map((resource) => [
        resource.id,
        (player.resources[resource.id] ?? 0) + (grants[resource.id] ?? 0),
      ]),
    ),
  };
}

export function resolveProduction(state: GameState, diceTotal: number): ProductionResolution {
  const demand = calculateProductionDemand(state, diceTotal);
  const unavailableResourceIds = RESOURCES.filter((resource) => {
    const totalDemand = Object.values(demand).reduce(
      (total, playerDemand) => total + (playerDemand[resource.id] ?? 0),
      0,
    );
    return totalDemand > (state.bank[resource.id] ?? 0);
  }).map((resource) => resource.id);
  const unavailable = new Set(unavailableResourceIds);
  const grants: Record<string, ResourceBundle> = {};

  for (const [playerId, playerDemand] of Object.entries(demand)) {
    const playerGrants = resourceBundle(
      RESOURCES.flatMap((resource) => {
        const amount = unavailable.has(resource.id) ? 0 : (playerDemand[resource.id] ?? 0);
        return amount > 0 ? ([[resource.id, amount]] as const) : [];
      }),
    );
    if (bundleTotal(playerGrants) > 0) grants[playerId] = playerGrants;
  }

  const players = Object.fromEntries(
    Object.entries(state.players).map(([playerId, player]) => [
      playerId,
      grants[playerId] === undefined ? player : addResources(player, grants[playerId]),
    ]),
  );
  const bank = resourceBundle(
    RESOURCES.map((resource) => {
      const granted = Object.values(grants).reduce(
        (total, playerGrants) => total + (playerGrants[resource.id] ?? 0),
        0,
      );
      return [resource.id, (state.bank[resource.id] ?? 0) - granted];
    }),
  );

  return { demand, grants, unavailableResourceIds, players, bank };
}
