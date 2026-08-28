import { useMemo, useState } from 'react';

import { HAND_GOODS } from '../../engine/content/commodities';
import { getKNProgressCardDefinition } from '../../engine/content/kn-progress-cards';
import type { GameState } from '../../engine/core/game-state';
import type { CardInstanceId, ResourceId } from '../../engine/core/ids';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { KNProgressCardArtwork } from './KNProgressCardArtwork';
import { ResourceArtwork } from './ResourceArtwork';

type KNInteraction = Extract<GameState['pendingInteraction'], { readonly type: 'KN_SELECTION' }>;

interface KNInteractionModalProps {
  readonly state: GameState;
  readonly interaction: KNInteraction;
  readonly errorMessage: string | null;
  readonly onResolve: (selections: readonly string[], cancelled?: boolean) => void;
}

const PURPOSE_TITLES: Readonly<Record<KNInteraction['purpose'], string>> = {
  AQUEDUCT_RESOURCE: 'Choose an Aqueduct resource',
  BARBARIAN_CITY_LOSS: 'Choose a City to lose',
  DEFENDER_TIE_DECK: 'Choose a Progress deck',
  PROGRESS_DISCARD: 'Return one Progress Card',
  ALCHEMIST_DICE: 'Choose the numeric dice',
  ENGINEER_WALL: 'Choose a City for the Wall',
  INVENTOR_FIRST_TOKEN: 'Choose the first number token',
  INVENTOR_SECOND_TOKEN: 'Choose the second number token',
  MEDICINE_CITY: 'Choose a House to upgrade',
  ROAD_BUILDING: 'Place a free Road',
  SMITH_KNIGHT: 'Choose a Knight to upgrade',
  COMMERCIAL_HARBOR_PLAYER: 'Choose a player to visit',
  COMMERCIAL_HARBOR_RESOURCE: 'Choose a resource to offer',
  COMMERCIAL_HARBOR_COMMODITY: 'Choose a commodity to return',
  MASTER_MERCHANT_PLAYER: 'Choose a wealthier player',
  MASTER_MERCHANT_CARDS: 'Choose two hand cards',
  MERCHANT_FLEET_GOOD: 'Choose a 2:1 trade card',
  MERCHANT_HEX: 'Place the Merchant',
  RESOURCE_MONOPOLY: 'Choose a resource',
  COMMODITY_MONOPOLY: 'Choose a commodity',
  BISHOP_HEX: 'Move the robber',
  DESERTER_PLAYER: 'Choose an opponent',
  DESERTER_KNIGHT: 'Choose a Knight to remove',
  DESERTER_PLACE_KNIGHT: 'Place your free Knight',
  DIPLOMAT_ROAD: 'Choose an open Road',
  DIPLOMAT_RELOCATE_ROAD: 'Relocate your Road',
  INTRIGUE_KNIGHT: 'Resolve Intrigue',
  RELOCATE_DISPLACED_KNIGHT: 'Relocate the displaced Knight',
  SABOTEUR_DISCARD: 'Choose cards to discard',
  SPY_PLAYER: 'Choose a player to spy on',
  SPY_CARD: 'Choose a Progress Card to steal',
  WEDDING_CARDS: 'Choose cards to give',
  METROPOLIS_CITY: 'Choose a City for the Metropolis',
};

function isGoodChoice(interaction: KNInteraction): boolean {
  return [
    'AQUEDUCT_RESOURCE',
    'COMMERCIAL_HARBOR_RESOURCE',
    'COMMERCIAL_HARBOR_COMMODITY',
    'MASTER_MERCHANT_CARDS',
    'MERCHANT_FLEET_GOOD',
    'RESOURCE_MONOPOLY',
    'COMMODITY_MONOPOLY',
    'SABOTEUR_DISCARD',
    'WEDDING_CARDS',
  ].includes(interaction.purpose);
}

function isPlayerChoice(interaction: KNInteraction): boolean {
  return ['MASTER_MERCHANT_PLAYER', 'DESERTER_PLAYER', 'SPY_PLAYER'].includes(interaction.purpose);
}

export function KNInteractionModal({
  state,
  interaction,
  errorMessage,
  onResolve,
}: KNInteractionModalProps) {
  const [selections, setSelections] = useState<readonly string[]>([]);
  const player = state.players[interaction.playerId];
  const choiceCounts = useMemo(
    () =>
      Object.fromEntries(
        interaction.eligibleIds.map((id) => [
          id,
          selections.filter((selection) => selection === id).length,
        ]),
      ),
    [interaction.eligibleIds, selections],
  );

  const toggle = (id: string) => {
    setSelections((current) => {
      if (interaction.maximumSelections === 1) return [id];
      if (current.length >= interaction.maximumSelections) return current;
      const good = HAND_GOODS.find((candidate) => candidate.id === id);
      const requiresOwnedCards = [
        'COMMERCIAL_HARBOR_RESOURCE',
        'COMMERCIAL_HARBOR_COMMODITY',
        'MASTER_MERCHANT_CARDS',
        'SABOTEUR_DISCARD',
        'WEDDING_CARDS',
      ].includes(interaction.purpose);
      const owningPlayer =
        interaction.purpose === 'MASTER_MERCHANT_CARDS'
          ? state.players[interaction.context.targetPlayerId as string]
          : player;
      const owned =
        good === undefined ? 1 : requiresOwnedCards ? playerHandCount(owningPlayer, good.id) : 99;
      const already = current.filter((selection) => selection === id).length;
      return already >= owned ? current : [...current, id];
    });
  };
  const remove = (index: number) =>
    setSelections((current) => current.filter((_, selectedIndex) => selectedIndex !== index));
  const canConfirm =
    selections.length >= interaction.minimumSelections &&
    selections.length <= interaction.maximumSelections;

  return (
    <Modal
      open
      title={PURPOSE_TITLES[interaction.purpose]}
      description={`${player?.name ?? 'Player'} · ${selections.length}/${interaction.maximumSelections} selected`}
      dismissible={interaction.canCancel}
      onClose={() => interaction.canCancel && onResolve([], true)}
      className="kn-interaction-modal"
    >
      <div className="kn-choice-grid">
        {interaction.eligibleIds.map((id, index) => {
          const good = HAND_GOODS.find((candidate) => candidate.id === id);
          const targetPlayer = state.players[id];
          const card = state.kn?.progressCards[id as CardInstanceId];
          const definition =
            card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
          const knight = Object.values(state.players)
            .flatMap((candidate) => candidate.knights)
            .find((candidate) => candidate.id === id);
          const selectedCount = choiceCounts[id] ?? 0;
          return (
            <button
              key={`${id}-${index}`}
              type="button"
              className={`kn-choice ${selectedCount > 0 ? 'kn-choice--selected' : ''}`}
              data-modal-autofocus={index === 0 ? true : undefined}
              aria-pressed={selectedCount > 0}
              onClick={() => toggle(id)}
            >
              {good === undefined ? null : (
                <span className="kn-choice__resource">
                  <ResourceArtwork resourceId={good.id} />
                </span>
              )}
              {definition === undefined ? null : (
                <KNProgressCardArtwork definition={definition} compact />
              )}
              {targetPlayer === undefined ? null : (
                <span className="kn-choice__avatar" aria-hidden="true">
                  ●
                </span>
              )}
              {knight === undefined ? null : (
                <span className={`kn-choice__knight ${knight.active ? 'is-active' : ''}`}>
                  ♞<small>{knight.level}</small>
                </span>
              )}
              <strong>
                {good?.displayName ??
                  targetPlayer?.name ??
                  definition?.displayName ??
                  (['SCIENCE', 'TRADE', 'POLITICS'].includes(id)
                    ? `${id[0]}${id.slice(1).toLocaleLowerCase()} deck`
                    : `Board location ${index + 1}`)}
              </strong>
              {isPlayerChoice(interaction) && targetPlayer !== undefined ? (
                <small>{calculateHandCount(targetPlayer)} hand cards</small>
              ) : null}
              {selectedCount > 0 ? <b>×{selectedCount}</b> : null}
            </button>
          );
        })}
      </div>

      {selections.length <= 1 || !isGoodChoice(interaction) ? null : (
        <div className="kn-choice-selection">
          {selections.map((id, index) => {
            const good = HAND_GOODS.find((candidate) => candidate.id === id);
            return (
              <button key={`${id}-${index}`} type="button" onClick={() => remove(index)}>
                {good === undefined ? (
                  id
                ) : (
                  <>
                    <ResourceArtwork resourceId={good.id} />
                    <span>{good.displayName}</span>
                  </>
                )}
                <i>×</i>
              </button>
            );
          })}
        </div>
      )}

      {errorMessage === null ? null : (
        <p className="modal-error" role="alert">
          {errorMessage}
        </p>
      )}
      <footer className="modal__actions">
        {interaction.canCancel ? (
          <Button variant="ghost" onClick={() => onResolve([], true)}>
            Cancel
          </Button>
        ) : null}
        <Button variant="primary" disabled={!canConfirm} onClick={() => onResolve(selections)}>
          Confirm
        </Button>
      </footer>
    </Modal>
  );
}

function playerHandCount(
  player: GameState['players'][string] | undefined,
  resourceId: ResourceId,
): number {
  if (player === undefined) return 0;
  return (player.resources[resourceId] ?? 0) + (player.commodities[resourceId] ?? 0);
}

function calculateHandCount(player: GameState['players'][string]): number {
  return HAND_GOODS.reduce((total, good) => total + playerHandCount(player, good.id), 0);
}
