import type { CSSProperties } from 'react';

import { HAND_GOODS, isCommodityId } from '../../engine/content/commodities';
import { RESOURCES } from '../../engine/content/resources';
import type { ResourceBundle, ResourceDefinition } from '../../engine/content/types';
import type { PlayerState } from '../../engine/core/game-state';
import type { ResourceId } from '../../engine/core/ids';
import { canAfford } from '../../engine/rules/resource-rules';
import { Button } from '../components/Button';
import { ResourceArtwork } from './ResourceArtwork';

interface TradeModalProps {
  readonly player: PlayerState;
  readonly opponents: readonly PlayerState[];
  readonly bank: ResourceBundle;
  readonly hideBankCounts?: boolean;
  readonly bankRatios: Readonly<Record<string, number>>;
  readonly maximumRequestAmount: number;
  readonly offered: ResourceBundle;
  readonly requested: ResourceBundle;
  readonly editingPlayerTrade?: boolean;
  readonly errorMessage: string | null;
  readonly onClose: () => void;
  readonly onBankTrade: (offered: ResourceBundle, requested: ResourceBundle) => void;
  readonly onAddRequested: (resourceId: ResourceId) => void;
  readonly onRemoveRequested: (resourceId: ResourceId) => void;
  readonly onRemoveOffered: (resourceId: ResourceId) => void;
  readonly onCreateTrade: (offered: ResourceBundle, requested: ResourceBundle) => void;
  readonly includeCommodities?: boolean;
}

function selectionTotal(selection: ResourceBundle): number {
  return Object.values(selection).reduce<number>((total, amount) => total + (amount ?? 0), 0);
}

function heldCount(player: PlayerState, resourceId: ResourceId): number {
  return isCommodityId(resourceId)
    ? (player.commodities[resourceId] ?? 0)
    : (player.resources[resourceId] ?? 0);
}

interface SelectedTradeCardsProps {
  readonly bundle: ResourceBundle;
  readonly goods: readonly ResourceDefinition[];
  readonly emptyText: string;
  readonly actionName: string;
  readonly onRemove: (resourceId: ResourceId) => void;
}

function SelectedTradeCards({
  bundle,
  goods,
  emptyText,
  actionName,
  onRemove,
}: SelectedTradeCardsProps) {
  const cards = goods.flatMap((resource) =>
    Array.from({ length: bundle[resource.id] ?? 0 }, (_, index) => ({ resource, index })),
  );
  return (
    <div className="trade-tray__selected-cards">
      {cards.length === 0 ? (
        <span className="trade-tray__empty">{emptyText}</span>
      ) : (
        cards.map(({ resource, index }) => (
          <button
            key={`${resource.id}-${index}`}
            type="button"
            className="trade-tray-card"
            style={{ '--resource-color': resource.color } as CSSProperties}
            aria-label={`${actionName} ${resource.displayName}`}
            onClick={() => onRemove(resource.id)}
          >
            <span className="trade-tray-card__art">
              <ResourceArtwork resourceId={resource.id} />
            </span>
            <strong>{resource.displayName}</strong>
          </button>
        ))
      )}
    </div>
  );
}

export function TradeModal({
  player,
  opponents,
  bank,
  hideBankCounts = false,
  bankRatios,
  maximumRequestAmount,
  offered,
  requested,
  editingPlayerTrade = false,
  errorMessage,
  onClose,
  onBankTrade,
  onAddRequested,
  onRemoveRequested,
  onRemoveOffered,
  onCreateTrade,
  includeCommodities = false,
}: TradeModalProps) {
  const goods = includeCommodities ? HAND_GOODS : RESOURCES;
  const currentHand = Object.fromEntries(
    goods.map((good) => [good.id, heldCount(player, good.id)]),
  ) as ResourceBundle;
  const canOfferPlayerTrade =
    opponents.length > 0 &&
    selectionTotal(offered) > 0 &&
    selectionTotal(requested) > 0 &&
    canAfford(currentHand, offered);
  const offeredKinds = goods.filter((resource) => (offered[resource.id] ?? 0) > 0);
  const requestedKinds = goods.filter((resource) => (requested[resource.id] ?? 0) > 0);
  const offeredTotal = selectionTotal(offered);
  const requestedTotal = selectionTotal(requested);
  const bankRatesAreComplete = offeredKinds.every((resource) => {
    const ratio = bankRatios[resource.id] ?? 4;
    return (offered[resource.id] ?? 0) % ratio === 0;
  });
  const bankCardsEarned = offeredKinds.reduce(
    (total, resource) => total + (offered[resource.id] ?? 0) / (bankRatios[resource.id] ?? 4),
    0,
  );
  const bankSelectionOverlaps = offeredKinds.some((resource) => (requested[resource.id] ?? 0) > 0);
  const canCompleteBankTrade =
    !editingPlayerTrade &&
    offeredTotal > 0 &&
    requestedTotal > 0 &&
    requestedKinds.length > 0 &&
    bankRatesAreComplete &&
    bankCardsEarned === requestedTotal &&
    !bankSelectionOverlaps &&
    canAfford(bank, requested) &&
    canAfford(currentHand, offered);
  const offeredBankHint =
    offeredKinds.length === 0
      ? 'Click cards in your hand'
      : `${offeredKinds
          .map((resource) => `${resource.displayName} ${bankRatios[resource.id] ?? 4}:1`)
          .join(
            ' · ',
          )} · ${bankRatesAreComplete ? `buys ${bankCardsEarned} bank card${bankCardsEarned === 1 ? '' : 's'}` : 'complete each rate group'}`;

  return (
    <aside
      className="trade-tray trade-tray--unified"
      role="dialog"
      aria-modal="false"
      aria-labelledby="trade-tray-title"
      aria-describedby="trade-tray-description"
    >
      <header className="trade-tray__heading">
        <span className="trade-tray__crest" aria-hidden="true">
          ⇄
        </span>
        <div>
          <strong id="trade-tray-title">{editingPlayerTrade ? 'Edit trade' : 'Trade'}</strong>
          <small id="trade-tray-description">
            {editingPlayerTrade
              ? 'Change either side of the offer, then update it for every opponent.'
              : `Select one shared offer, then use Bank for an immediate exchange or Players to send it to ${opponents.length} opponent${opponents.length === 1 ? '' : 's'}.`}
          </small>
        </div>
      </header>

      <div className="trade-tray__body">
        <div className="trade-tray__player">
          <section className="trade-tray__request-source" aria-label="Available cards to request">
            <div>
              <strong>Cards you want</strong>
              <small>Click a card to move it into your request</small>
            </div>
            <div className="trade-tray__request-palette">
              {goods.map((resource) => {
                const amount = requested[resource.id] ?? 0;
                const available = bank[resource.id] ?? 0;
                const availability = hideBankCounts ? '' : `, ${available} in bank`;
                return (
                  <button
                    key={resource.id}
                    type="button"
                    style={{ '--resource-color': resource.color } as CSSProperties}
                    aria-label={`Add ${resource.displayName} to trade request${availability}`}
                    disabled={amount >= maximumRequestAmount || (offered[resource.id] ?? 0) > 0}
                    onClick={() => onAddRequested(resource.id)}
                  >
                    <span>
                      <ResourceArtwork resourceId={resource.id} />
                    </span>
                    <b>{amount > 0 ? `×${amount}` : '+'}</b>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="trade-tray__bundle-row trade-tray__bundle-row--request">
            <div className="trade-tray__bundle-label">
              <span aria-hidden="true">↓</span>
              <div>
                <strong>You request</strong>
                <small>Click a selected card to return it</small>
              </div>
            </div>
            <SelectedTradeCards
              bundle={requested}
              goods={goods}
              emptyText="Choose requested cards"
              actionName="Remove requested"
              onRemove={onRemoveRequested}
            />
          </section>
          <section className="trade-tray__bundle-row trade-tray__bundle-row--offer">
            <div className="trade-tray__bundle-label">
              <span aria-hidden="true">↑</span>
              <div>
                <strong>You offer</strong>
                <small>
                  {offeredKinds.length === 1 ? offeredBankHint : 'Click cards in your hand'}
                </small>
              </div>
            </div>
            <SelectedTradeCards
              bundle={offered}
              goods={goods}
              emptyText="Selected hand cards move here"
              actionName="Return offered"
              onRemove={onRemoveOffered}
            />
          </section>
        </div>
        {errorMessage === null ? null : (
          <p className="trade-tray__error" role="alert">
            {errorMessage}
          </p>
        )}
      </div>

      <nav className="trade-tray__modes" aria-label="Trade actions">
        <Button
          className="trade-tray__mode--bank"
          aria-label="Complete bank trade"
          title={
            editingPlayerTrade
              ? 'Finish editing before making a bank trade'
              : canCompleteBankTrade
                ? 'Complete this bank or port exchange'
                : 'Choose a valid bank or port exchange first'
          }
          variant="primary"
          disabled={!canCompleteBankTrade}
          onClick={() => onBankTrade(offered, requested)}
        >
          <span aria-hidden="true">♜</span>
          <small>Bank</small>
        </Button>
        <Button
          className="trade-tray__mode--players"
          aria-label={editingPlayerTrade ? 'Update trade request' : 'Send trade request'}
          title={
            editingPlayerTrade
              ? 'Replace the open offer and ask every player to respond again'
              : 'Send this request to the other players'
          }
          variant="primary"
          disabled={!canOfferPlayerTrade}
          onClick={() => onCreateTrade(offered, requested)}
        >
          <span aria-hidden="true">♟♟</span>
          <small>{editingPlayerTrade ? 'Update' : 'Players'}</small>
        </Button>
        <Button variant="danger" aria-label="Done" onClick={onClose}>
          <span aria-hidden="true">×</span>
          <small>Close</small>
        </Button>
      </nav>
    </aside>
  );
}
