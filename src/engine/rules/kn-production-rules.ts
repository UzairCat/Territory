import { COMMODITY_IDS, HAND_GOODS } from '../content/commodities';
import { RESOURCE_IDS } from '../content/resources';
import { resourceBundle } from '../content/types';
import type { ResourceBundle } from '../content/types';
import type { GameState } from '../core/game-state';
import type { PlayerId, ResourceId } from '../core/ids';
import {
  addResourceBundles,
  combinedBank,
  playerHand,
  splitBank,
  withPlayerHand,
} from './resource-rules';

export interface KNProductionResolution {
  readonly demand: Readonly<Record<string, ResourceBundle>>;
  readonly grants: Readonly<Record<string, ResourceBundle>>;
  readonly unavailableResourceIds: readonly ResourceId[];
  readonly players: GameState['players'];
  readonly bank: ResourceBundle;
  readonly commodityBank: ResourceBundle;
}

function addDemand(
  demand: Map<PlayerId, Map<ResourceId, number>>,
  playerId: PlayerId,
  resourceId: ResourceId,
  amount: number,
): void {
  const playerDemand = demand.get(playerId) ?? new Map<ResourceId, number>();
  playerDemand.set(resourceId, (playerDemand.get(resourceId) ?? 0) + amount);
  demand.set(playerId, playerDemand);
}

export function calculateKNProductionDemand(
  state: GameState,
  diceTotal: number,
): Readonly<Record<string, ResourceBundle>> {
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
      addDemand(demand, building.ownerId, hex.resourceId, 1);
      if (building.type !== 'MANSION') continue;
      if (hex.resourceId === RESOURCE_IDS.wood) {
        addDemand(demand, building.ownerId, COMMODITY_IDS.paper, 1);
      } else if (hex.resourceId === RESOURCE_IDS.livestock) {
        addDemand(demand, building.ownerId, COMMODITY_IDS.cloth, 1);
      } else if (hex.resourceId === RESOURCE_IDS.ore) {
        addDemand(demand, building.ownerId, COMMODITY_IDS.coin, 1);
      } else {
        addDemand(demand, building.ownerId, hex.resourceId, 1);
      }
    }
  }

  return Object.fromEntries(
    [...demand].map(([playerId, goods]) => [playerId, resourceBundle([...goods])]),
  );
}

function bundleTotal(bundle: ResourceBundle): number {
  return HAND_GOODS.reduce((total, good) => total + (bundle[good.id] ?? 0), 0);
}

export function resolveKNProduction(state: GameState, diceTotal: number): KNProductionResolution {
  const demand = calculateKNProductionDemand(state, diceTotal);
  const currentBank = combinedBank(state.bank, state.commodityBank);
  const unavailableResourceIds = HAND_GOODS.filter((good) => {
    const totalDemand = Object.values(demand).reduce(
      (total, playerDemand) => total + (playerDemand[good.id] ?? 0),
      0,
    );
    return totalDemand > (currentBank[good.id] ?? 0);
  }).map((good) => good.id);
  const unavailable = new Set(unavailableResourceIds);
  const grants: Record<string, ResourceBundle> = {};

  for (const [playerId, playerDemand] of Object.entries(demand)) {
    const playerGrants = resourceBundle(
      HAND_GOODS.flatMap((good) => {
        const amount = unavailable.has(good.id) ? 0 : (playerDemand[good.id] ?? 0);
        return amount > 0 ? ([[good.id, amount]] as const) : [];
      }),
    );
    if (bundleTotal(playerGrants) > 0) grants[playerId] = playerGrants;
  }

  const players = Object.fromEntries(
    Object.entries(state.players).map(([playerId, player]) => [
      playerId,
      grants[playerId] === undefined
        ? player
        : withPlayerHand(player, addResourceBundles(playerHand(player), grants[playerId])),
    ]),
  );
  const nextCombinedBank = resourceBundle(
    HAND_GOODS.map((good) => {
      const granted = Object.values(grants).reduce(
        (total, playerGrants) => total + (playerGrants[good.id] ?? 0),
        0,
      );
      return [good.id, (currentBank[good.id] ?? 0) - granted];
    }),
  );
  const banks = splitBank(nextCombinedBank);

  return {
    demand,
    grants,
    unavailableResourceIds,
    players,
    bank: banks.bank,
    commodityBank: banks.commodityBank,
  };
}
