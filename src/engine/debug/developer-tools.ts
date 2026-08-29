import { COMMODITIES } from '../content/commodities';
import { KN_PROGRESS_CARDS } from '../content/kn-progress-cards';
import { PROGRESS_CARDS } from '../content/progress-cards';
import { RESOURCES } from '../content/resources';
import { resourceBundle } from '../content/types';
import type { GameState } from '../core/game-state';
import { cardInstanceId } from '../core/ids';
import type { PlayerId } from '../core/ids';

export function grantDeveloperProgressCards(
  state: GameState,
  targetPlayerId: PlayerId,
  grantToken: string,
): GameState {
  const player = state.players[targetPlayerId];
  if (player === undefined) return state;

  if (state.kn !== null) {
    const grantedCards = KN_PROGRESS_CARDS.map((definition) => {
      const instanceId = cardInstanceId(`dev-${grantToken}-${definition.id}`);
      return {
        instanceId,
        definition,
        card: {
          instanceId,
          definitionId: definition.id,
          ownerId: targetPlayerId,
          drawnTurn: state.turn.turnNumber,
          playedTurn: null,
          revealed: definition.revealedVictoryPoints > 0,
        },
      };
    });
    return {
      ...state,
      players: {
        ...state.players,
        [targetPlayerId]: {
          ...player,
          knProgressCardIds: [
            ...player.knProgressCardIds,
            ...grantedCards
              .filter(({ definition }) => definition.revealedVictoryPoints === 0)
              .map(({ instanceId }) => instanceId),
          ],
          revealedKNProgressCardIds: [
            ...player.revealedKNProgressCardIds,
            ...grantedCards
              .filter(({ definition }) => definition.revealedVictoryPoints > 0)
              .map(({ instanceId }) => instanceId),
          ],
        },
      },
      kn: {
        ...state.kn,
        progressCards: {
          ...state.kn.progressCards,
          ...Object.fromEntries(
            grantedCards.map(({ instanceId, card }) => [instanceId, card] as const),
          ),
        },
      },
    };
  }

  const grantedCards = PROGRESS_CARDS.map((definition) => {
    const instanceId = cardInstanceId(`dev-${grantToken}-${definition.id}`);
    return {
      instanceId,
      card: {
        instanceId,
        definitionId: definition.id,
        ownerId: targetPlayerId,
        purchasedTurn: null,
        playedTurn: null,
      },
    };
  });
  return {
    ...state,
    players: {
      ...state.players,
      [targetPlayerId]: {
        ...player,
        progressCardIds: [
          ...player.progressCardIds,
          ...grantedCards.map(({ instanceId }) => instanceId),
        ],
      },
    },
    progressCards: {
      ...state.progressCards,
      ...Object.fromEntries(
        grantedCards.map(({ instanceId, card }) => [instanceId, card] as const),
      ),
    },
  };
}

export function grantDeveloperLoadout(
  state: GameState,
  targetPlayerId: PlayerId,
  grantToken: string,
): GameState {
  const withCards = grantDeveloperProgressCards(state, targetPlayerId, grantToken);
  const player = withCards.players[targetPlayerId];
  if (player === undefined) return state;
  return {
    ...withCards,
    players: {
      ...withCards.players,
      [targetPlayerId]: {
        ...player,
        resources: resourceBundle(RESOURCES.map((resource) => [resource.id, 99])),
        commodities: resourceBundle(COMMODITIES.map((commodity) => [commodity.id, 99])),
      },
    },
  };
}
