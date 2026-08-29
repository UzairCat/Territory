import { useState, type CSSProperties } from 'react';

import { PLAYER_COLORS } from '../../engine/content/colors';
import { COMMODITIES, HAND_GOODS, isCommodityId } from '../../engine/content/commodities';
import {
  getKNProgressCardDefinition,
  type KNProgressCardDefinition,
} from '../../engine/content/kn-progress-cards';
import { RESOURCES } from '../../engine/content/resources';
import type { GameState, PlayerState } from '../../engine/core/game-state';
import type { CardInstanceId, ResourceId } from '../../engine/core/ids';
import { Button } from '../components/Button';
import { KNProgressCardArtwork } from './KNProgressCardArtwork';
import { KNProgressCardTooltip } from './KNProgressCardTooltip';
import type { ProgressCardTooltipAnchor } from './ProgressCardTooltip';
import { ResourceArtwork } from './ResourceArtwork';

type KNInteraction = Extract<GameState['pendingInteraction'], { readonly type: 'KN_SELECTION' }>;

interface KNChoiceTrayProps {
  readonly state: GameState;
  readonly interaction: KNInteraction;
  readonly errorMessage: string | null;
  readonly selections?: readonly string[] | undefined;
  readonly onSelectionsChange?: ((selections: readonly string[]) => void) | undefined;
  readonly onResolve: (selections: readonly string[], cancelled?: boolean) => void;
}

interface SpyCardTooltipState {
  readonly id: string;
  readonly definition: KNProgressCardDefinition;
  readonly anchor: ProgressCardTooltipAnchor;
}

interface DisplayGoodCard {
  readonly key: string;
  readonly id: ResourceId;
  readonly selected: boolean;
}

const DIE_PIP_POSITIONS: Readonly<Record<number, readonly number[]>> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function playerColor(state: GameState, playerId: string): string {
  const colorId = state.players[playerId]?.colorId;
  return PLAYER_COLORS.find((candidate) => candidate.id === colorId)?.hex ?? '#7c9290';
}

function handCardCount(player: PlayerState | undefined, resourceId: ResourceId): number {
  if (player === undefined) return 0;
  return isCommodityId(resourceId)
    ? (player.commodities[resourceId] ?? 0)
    : (player.resources[resourceId] ?? 0);
}

function totalHandCards(player: PlayerState | undefined): number {
  return HAND_GOODS.reduce((total, good) => total + handCardCount(player, good.id), 0);
}

function resourceLabel(resourceId: ResourceId): string {
  const resource = HAND_GOODS.find((candidate) => candidate.id === resourceId);
  return resource?.id === 'livestock' ? 'Sheep' : (resource?.displayName ?? resourceId);
}

export function KNChoiceTray({
  state,
  interaction,
  errorMessage,
  selections: controlledSelections,
  onSelectionsChange,
  onResolve,
}: KNChoiceTrayProps) {
  const [localSelections, setLocalSelections] = useState<readonly string[]>([]);
  const [spyCardTooltip, setSpyCardTooltip] = useState<SpyCardTooltipState | null>(null);
  const selections = controlledSelections ?? localSelections;
  const updateSelections = (next: readonly string[]) => {
    if (controlledSelections === undefined) setLocalSelections(next);
    else onSelectionsChange?.(next);
  };

  const purpose = interaction.purpose;
  const choosingAqueduct = purpose === 'AQUEDUCT_RESOURCE';
  const choosingDefenderDeck = purpose === 'DEFENDER_TIE_DECK';
  const choosingAlchemist = purpose === 'ALCHEMIST_DICE';
  const choosingResourceMonopoly = purpose === 'RESOURCE_MONOPOLY';
  const choosingCommodityMonopoly = purpose === 'COMMODITY_MONOPOLY';
  const choosingMerchantFleet = purpose === 'MERCHANT_FLEET_GOOD';
  const choosingReclamation = purpose === 'RECLAMATION_RESOURCE';
  const choosingHarborPlayer = purpose === 'COMMERCIAL_HARBOR_PLAYER';
  const choosingHarborResource = purpose === 'COMMERCIAL_HARBOR_RESOURCE';
  const choosingHarborCommodity = purpose === 'COMMERCIAL_HARBOR_COMMODITY';
  const choosingMasterPlayer = purpose === 'MASTER_MERCHANT_PLAYER';
  const choosingMasterCards = purpose === 'MASTER_MERCHANT_CARDS';
  const choosingDeserterPlayer = purpose === 'DESERTER_PLAYER';
  const choosingSaboteur = purpose === 'SABOTEUR_DISCARD';
  const choosingWeddingCards = purpose === 'WEDDING_CARDS';
  const choosingProgressDiscard = purpose === 'PROGRESS_DISCARD';
  const choosingSpyPlayer = purpose === 'SPY_PLAYER';
  const choosingSpyCard = purpose === 'SPY_CARD';
  const choosingPlayer =
    choosingHarborPlayer || choosingMasterPlayer || choosingDeserterPlayer || choosingSpyPlayer;
  const choosingGoods =
    choosingAqueduct ||
    choosingResourceMonopoly ||
    choosingCommodityMonopoly ||
    choosingMerchantFleet ||
    choosingReclamation ||
    choosingHarborCommodity ||
    choosingMasterCards;
  const choosingDirectHand =
    choosingHarborResource || choosingSaboteur || choosingWeddingCards || choosingProgressDiscard;
  if (
    !choosingPlayer &&
    !choosingGoods &&
    !choosingDirectHand &&
    !choosingSpyCard &&
    !choosingAlchemist &&
    !choosingDefenderDeck
  )
    return null;

  const targetPlayerId = interaction.context.targetPlayerId as string | undefined;
  const targetPlayer = targetPlayerId === undefined ? undefined : state.players[targetPlayerId];
  const title = choosingAqueduct
    ? 'Choose an Aqueduct card'
    : choosingDefenderDeck
      ? 'Choose your defender reward'
      : choosingAlchemist
        ? 'Set the Alchemist dice'
        : choosingResourceMonopoly
          ? 'Choose a resource for Resource Monopoly'
          : choosingCommodityMonopoly
            ? 'Choose a commodity for Commodity Monopoly'
            : choosingMerchantFleet
              ? 'Choose a good for Merchant Fleet'
              : choosingReclamation
                ? 'Choose the tile’s new resource'
                : choosingHarborPlayer
                  ? 'Choose a Commercial Harbor partner'
                  : choosingHarborResource
                    ? `Choose a card to give ${targetPlayer?.name ?? 'that player'}`
                    : choosingHarborCommodity
                      ? `${state.players[interaction.playerId]?.name ?? 'Player'}, choose a commodity to return`
                      : choosingMasterPlayer
                        ? 'Choose a player for Master Merchant'
                        : choosingMasterCards
                          ? `Choose two of ${targetPlayer?.name ?? 'that player'}’s cards`
                          : choosingDeserterPlayer
                            ? 'Choose a player for Deserter'
                            : choosingSaboteur
                              ? `${state.players[interaction.playerId]?.name ?? 'Player'}, discard cards for Saboteur`
                              : choosingWeddingCards
                                ? `${state.players[interaction.playerId]?.name ?? 'Player'}, choose Wedding cards to give`
                                : choosingProgressDiscard
                                  ? 'Return a Progress Card'
                                  : choosingSpyPlayer
                                    ? 'Choose a player to spy on'
                                    : `Choose one of ${targetPlayer?.name ?? 'that player'}’s Progress Cards`;
  const description = choosingAqueduct
    ? 'Select one available resource from the bank, then confirm your choice.'
    : choosingDefenderDeck
      ? 'Select one Progress deck. Its top card will move into your hand.'
      : choosingAlchemist
        ? 'Choose one white die and one red die. The Event die will still be rolled.'
        : choosingResourceMonopoly
          ? 'Collect up to two of the selected resource from every opponent.'
          : choosingCommodityMonopoly
            ? 'Collect up to one of the selected commodity from every opponent.'
            : choosingMerchantFleet
              ? 'Trade the selected resource or commodity at 2:1 until this turn ends.'
              : choosingReclamation
                ? 'Choose a different resource. This terrain change is permanent.'
                : choosingHarborPlayer
                  ? 'Choose an opponent who has a commodity.'
                  : choosingHarborResource
                    ? 'Click one resource in your hand. Click it here to put it back.'
                    : choosingHarborCommodity
                      ? `Choose one commodity to exchange for ${resourceLabel(interaction.context.resourceId as ResourceId)}.`
                      : choosingMasterPlayer
                        ? 'Only players with more victory points and hand cards are available.'
                        : choosingMasterCards
                          ? 'Every card is shown separately. Choose exactly two.'
                          : choosingDeserterPlayer
                            ? 'Choose an opponent, then select one of their glowing Knights on the board.'
                            : choosingSaboteur
                              ? 'Click cards in your hand to move them here, then confirm your discard.'
                              : choosingWeddingCards
                                ? 'Click cards in your hand to move them here, then confirm the gift.'
                                : choosingProgressDiscard
                                  ? 'Click a Progress Card in your hand, then confirm the return.'
                                  : choosingSpyPlayer
                                    ? 'Only players holding at least one Progress Card are available.'
                                    : 'The selected card will move directly into your Progress inventory.';
  const trayKind = choosingAqueduct
    ? 'aqueduct'
    : choosingDefenderDeck
      ? 'defender-reward'
      : choosingAlchemist
        ? 'alchemist'
        : choosingResourceMonopoly || choosingCommodityMonopoly
          ? 'monopoly'
          : choosingMerchantFleet
            ? 'merchant-fleet'
            : choosingReclamation
              ? 'reclamation'
              : choosingHarborPlayer || choosingHarborResource || choosingHarborCommodity
                ? 'harbor'
                : choosingMasterPlayer || choosingMasterCards
                  ? 'master-merchant'
                  : choosingDeserterPlayer
                    ? 'deserter'
                    : choosingSaboteur
                      ? 'saboteur'
                      : choosingWeddingCards
                        ? 'wedding'
                        : choosingProgressDiscard
                          ? 'progress-discard'
                          : 'spy';
  const crest = choosingAqueduct
    ? '↧'
    : choosingDefenderDeck
      ? '🛡'
      : choosingAlchemist
        ? '⚗'
        : choosingResourceMonopoly || choosingCommodityMonopoly
          ? '◎'
          : choosingMerchantFleet
            ? '⛵'
            : choosingReclamation
              ? '♻'
              : choosingHarborPlayer || choosingHarborResource || choosingHarborCommodity
                ? '⚓'
                : choosingMasterPlayer || choosingMasterCards
                  ? '♜'
                  : choosingDeserterPlayer
                    ? '♞'
                    : choosingSaboteur
                      ? '✂'
                      : choosingWeddingCards
                        ? '◇'
                        : choosingProgressDiscard
                          ? '↥'
                          : '⌕';
  const selectionCount = (id: string) => selections.filter((selection) => selection === id).length;
  const selectionValid =
    selections.length >= interaction.minimumSelections &&
    selections.length <= interaction.maximumSelections;
  const remainingSelections = Math.max(0, interaction.minimumSelections - selections.length);
  const masterCardOwner = choosingMasterCards ? targetPlayer : undefined;
  const harborCommodityOwner = choosingHarborCommodity
    ? state.players[interaction.playerId]
    : undefined;

  const displayGoodCards: readonly DisplayGoodCard[] = choosingMasterCards
    ? HAND_GOODS.flatMap((good) => {
        if (!interaction.eligibleIds.includes(good.id)) return [];
        const remaining = Math.max(
          0,
          handCardCount(masterCardOwner, good.id) - selectionCount(good.id),
        );
        return Array.from({ length: remaining }, (_, index) => ({
          key: `${good.id}-${index}`,
          id: good.id,
          selected: false,
        }));
      })
    : choosingHarborCommodity
      ? COMMODITIES.flatMap((good) => {
          if (!interaction.eligibleIds.includes(good.id)) return [];
          const owned = handCardCount(harborCommodityOwner, good.id);
          return Array.from({ length: owned }, (_, index) => ({
            key: `${good.id}-${index}`,
            id: good.id,
            selected: index < selectionCount(good.id),
          }));
        })
      : (choosingCommodityMonopoly
          ? COMMODITIES
          : choosingMerchantFleet
            ? HAND_GOODS
            : RESOURCES
        ).map((good) => ({
          key: good.id,
          id: good.id,
          selected: selectionCount(good.id) > 0,
        }));

  const chooseGood = (id: ResourceId) => {
    if (choosingMasterCards) {
      if (selections.length >= interaction.maximumSelections) return;
      updateSelections([...selections, id]);
      return;
    }
    updateSelections([id]);
  };
  const removeSelection = (index: number) =>
    updateSelections(selections.filter((_, selectedIndex) => selectedIndex !== index));
  const chooseDie = (color: 'regular' | 'red', value: number) => {
    updateSelections([
      ...selections.filter((selection) => !selection.startsWith(`${color}:`)),
      `${color}:${value}`,
    ]);
  };

  return (
    <aside
      className={`kn-choice-tray kn-choice-tray--${trayKind} ${choosingMasterCards || choosingDirectHand ? 'kn-choice-tray--multi' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="kn-choice-tray-title"
      aria-describedby="kn-choice-tray-description"
    >
      <header className="kn-choice-tray__heading">
        <span className="kn-choice-tray__crest" aria-hidden="true">
          {crest}
        </span>
        <div>
          <strong id="kn-choice-tray-title">{title}</strong>
          <small id="kn-choice-tray-description">{description}</small>
          {!choosingSaboteur ? null : (
            <span className="kn-choice-tray__requirement" aria-live="polite">
              <b>
                {selections.length}/{interaction.minimumSelections} selected
              </b>
              <i>
                {remainingSelections === 0
                  ? 'Ready to confirm'
                  : `${remainingSelections} card${remainingSelections === 1 ? '' : 's'} left`}
              </i>
            </span>
          )}
        </div>
      </header>

      <div className="kn-choice-tray__choice-area">
        {choosingAlchemist ? (
          <div className="kn-choice-tray__dice-picker" aria-label="Alchemist dice choices">
            {(['regular', 'red'] as const).map((color) => (
              <div key={color} className="kn-choice-tray__dice-row">
                <strong>{color === 'regular' ? 'White die' : 'Red die'}</strong>
                <div>
                  {[1, 2, 3, 4, 5, 6].map((value) => {
                    const id = `${color}:${value}`;
                    const selected = selections.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`kn-choice-tray__die kn-choice-tray__die--${color} ${selected ? 'is-selected' : ''}`}
                        aria-label={`Choose ${color === 'regular' ? 'white' : 'red'} die ${value}`}
                        aria-pressed={selected}
                        onClick={() => chooseDie(color, value)}
                      >
                        {Array.from({ length: 9 }, (_, position) => (
                          <i
                            key={position}
                            className={
                              DIE_PIP_POSITIONS[value]?.includes(position) ? 'is-visible' : ''
                            }
                          />
                        ))}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : choosingDefenderDeck ? (
          <div className="kn-choice-tray__options" aria-label="Defender reward Progress decks">
            {(['SCIENCE', 'TRADE', 'POLITICS'] as const).map((family) => {
              const selected = selections[0] === family;
              const available = interaction.eligibleIds.includes(family);
              const familyLabel =
                family === 'SCIENCE' ? 'Science' : family === 'TRADE' ? 'Trade' : 'Politics';
              const glyph = family === 'SCIENCE' ? '⚗' : family === 'TRADE' ? '⚖' : '♜';
              return (
                <button
                  key={family}
                  type="button"
                  className={`kn-choice-tray__progress-card kn-choice-tray__progress-card--${family.toLocaleLowerCase()} ${selected ? 'is-selected' : ''}`}
                  disabled={!available}
                  aria-label={`Choose the ${familyLabel} Progress deck`}
                  aria-pressed={selected}
                  onClick={() => updateSelections([family])}
                >
                  <span className="kn-choice-tray__deck-mark" aria-hidden="true">
                    {glyph}
                  </span>
                  <strong>{familyLabel}</strong>
                  <small>{state.kn?.progressDecks[family].length ?? 0} cards</small>
                </button>
              );
            })}
          </div>
        ) : choosingDirectHand ? null : (
          <div
            className={`kn-choice-tray__options ${choosingPlayer ? 'kn-choice-tray__options--players' : ''}`}
          >
            {choosingGoods
              ? displayGoodCards.map((displayCard) => {
                  const good = HAND_GOODS.find((candidate) => candidate.id === displayCard.id);
                  if (good === undefined) return null;
                  const available = interaction.eligibleIds.includes(good.id);
                  const disabled =
                    !available ||
                    (choosingMasterCards && selections.length >= interaction.maximumSelections);
                  const detail = choosingAqueduct
                    ? `${state.bank[good.id] ?? 0} in bank`
                    : choosingResourceMonopoly
                      ? 'Up to 2 per opponent'
                      : choosingCommodityMonopoly
                        ? 'Up to 1 per opponent'
                        : choosingMerchantFleet
                          ? '2:1 until turn end'
                          : choosingReclamation
                            ? 'Permanent terrain change'
                            : choosingHarborCommodity
                              ? 'In hand'
                              : `Take from ${targetPlayer?.name ?? 'player'}`;
                  const actionLabel = choosingAqueduct
                    ? `Choose ${resourceLabel(good.id)} from the bank`
                    : choosingResourceMonopoly
                      ? `Choose ${resourceLabel(good.id)} for Resource Monopoly`
                      : choosingCommodityMonopoly
                        ? `Choose ${resourceLabel(good.id)} for Commodity Monopoly`
                        : choosingMerchantFleet
                          ? `Choose ${resourceLabel(good.id)} for Merchant Fleet`
                          : choosingReclamation
                            ? `Change the selected tile to ${resourceLabel(good.id)}`
                            : choosingHarborCommodity
                              ? `Return ${resourceLabel(good.id)} through Commercial Harbor`
                              : `Take ${resourceLabel(good.id)} with Master Merchant`;
                  return (
                    <button
                      key={displayCard.key}
                      type="button"
                      className={`kn-choice-tray__resource-card ${displayCard.selected ? 'is-selected' : ''} ${available ? '' : 'is-unavailable'}`}
                      style={{ '--resource-color': good.color } as CSSProperties}
                      disabled={disabled}
                      aria-pressed={displayCard.selected}
                      aria-label={actionLabel}
                      onClick={() => chooseGood(good.id)}
                    >
                      <span>
                        <ResourceArtwork resourceId={good.id} />
                      </span>
                      <strong>{resourceLabel(good.id)}</strong>
                      <small>{detail}</small>
                    </button>
                  );
                })
              : choosingPlayer
                ? interaction.eligibleIds.map((id) => {
                    const player = state.players[id];
                    if (player === undefined) return null;
                    const commodityCount = COMMODITIES.reduce(
                      (total, commodity) => total + handCardCount(player, commodity.id),
                      0,
                    );
                    const detail = choosingSpyPlayer
                      ? `${player.knProgressCardIds.length} Progress Card${player.knProgressCardIds.length === 1 ? '' : 's'}`
                      : choosingHarborPlayer
                        ? `${commodityCount} commodit${commodityCount === 1 ? 'y' : 'ies'}`
                        : choosingDeserterPlayer
                          ? `${player.knights.length} Knight${player.knights.length === 1 ? '' : 's'}`
                          : `${totalHandCards(player)} hand cards`;
                    const actionLabel = choosingSpyPlayer
                      ? `Spy on ${player.name}, ${player.knProgressCardIds.length} Progress Cards`
                      : choosingHarborPlayer
                        ? `Visit ${player.name} with Commercial Harbor`
                        : choosingDeserterPlayer
                          ? `Choose ${player.name} for Deserter`
                          : `Choose ${player.name} for Master Merchant`;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="kn-choice-tray__player"
                        style={{ '--spy-player-color': playerColor(state, id) } as CSSProperties}
                        aria-label={actionLabel}
                        onClick={() => onResolve([id])}
                      >
                        <span className="kn-choice-tray__portrait" aria-hidden="true">
                          <i />
                          <b />
                        </span>
                        <strong>{player.name}</strong>
                        <small>{detail}</small>
                      </button>
                    );
                  })
                : interaction.eligibleIds.map((id) => {
                    const card = state.kn?.progressCards[id as CardInstanceId];
                    const definition =
                      card === undefined
                        ? undefined
                        : getKNProgressCardDefinition(card.definitionId);
                    if (definition === undefined) return null;
                    const tooltipId = `spy-progress-card-tooltip-${id}`;
                    const showTooltip = (element: HTMLButtonElement) => {
                      const bounds = element.getBoundingClientRect();
                      setSpyCardTooltip({
                        id: tooltipId,
                        definition,
                        anchor: { left: bounds.left, top: bounds.top, width: bounds.width },
                      });
                    };
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`kn-choice-tray__progress-card kn-choice-tray__progress-card--${definition.family.toLocaleLowerCase()} ${selections[0] === id ? 'is-selected' : ''}`}
                        aria-label={`Choose ${definition.displayName} to steal`}
                        aria-pressed={selections[0] === id}
                        aria-describedby={spyCardTooltip?.id === tooltipId ? tooltipId : undefined}
                        onClick={() => updateSelections([id])}
                        onMouseEnter={(event) => showTooltip(event.currentTarget)}
                        onMouseLeave={() => setSpyCardTooltip(null)}
                        onFocus={(event) => showTooltip(event.currentTarget)}
                        onBlur={() => setSpyCardTooltip(null)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setSpyCardTooltip(null);
                        }}
                      >
                        <KNProgressCardArtwork definition={definition} compact />
                      </button>
                    );
                  })}
          </div>
        )}

        {choosingMasterCards || choosingDirectHand ? (
          <div
            className="kn-choice-tray__selection"
            aria-label={
              choosingMasterCards
                ? 'Master Merchant selected cards'
                : choosingWeddingCards
                  ? 'Wedding selected cards'
                  : choosingSaboteur
                    ? 'Saboteur selected cards'
                    : choosingProgressDiscard
                      ? 'Progress Card selected for return'
                      : 'Commercial Harbor selected card'
            }
          >
            {selections.length === 0 ? (
              <span>Click a card in your hand</span>
            ) : (
              selections.map((id, index) => {
                if (choosingProgressDiscard) {
                  const card = state.kn?.progressCards[id];
                  const definition =
                    card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
                  if (definition === undefined) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`kn-choice-tray__selection-progress kn-choice-tray__progress-card--${definition.family.toLocaleLowerCase()}`}
                      aria-label={`Return ${definition.displayName} to your hand`}
                      onClick={() => removeSelection(index)}
                    >
                      <KNProgressCardArtwork definition={definition} compact />
                      <i aria-hidden="true">×</i>
                    </button>
                  );
                }
                const good = HAND_GOODS.find((candidate) => candidate.id === id);
                if (good === undefined) return null;
                return (
                  <button
                    key={`${id}-${index}`}
                    type="button"
                    style={{ '--resource-color': good.color } as CSSProperties}
                    aria-label={`Return ${resourceLabel(good.id)} to the hand`}
                    onClick={() => removeSelection(index)}
                  >
                    <ResourceArtwork resourceId={good.id} />
                    <strong>{resourceLabel(good.id)}</strong>
                    <i aria-hidden="true">×</i>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      {errorMessage === null ? null : (
        <p className="kn-choice-tray__error" role="alert">
          {errorMessage}
        </p>
      )}

      <footer className="kn-choice-tray__actions">
        {!interaction.canCancel ? null : (
          <Button variant="ghost" onClick={() => onResolve([], true)}>
            Cancel
          </Button>
        )}
        {choosingPlayer ? null : (
          <Button
            className={`kn-choice-tray__confirm ${selectionValid ? 'is-ready' : ''}`}
            variant="primary"
            disabled={!selectionValid}
            onClick={() => selectionValid && onResolve(selections)}
          >
            Confirm
          </Button>
        )}
      </footer>

      {!choosingSpyCard || spyCardTooltip === null ? null : (
        <KNProgressCardTooltip
          id={spyCardTooltip.id}
          definition={spyCardTooltip.definition}
          status="Available to steal"
          statusDetail="Select this card, then confirm to add it to your Progress inventory."
          anchor={spyCardTooltip.anchor}
        />
      )}
    </aside>
  );
}
