import { useState } from 'react';

import { HAND_GOODS, isCommodityId } from '../../engine/content/commodities';
import { RESOURCES } from '../../engine/content/resources';
import { resourceBundle } from '../../engine/content/types';
import type { ResourceBundle, ResourceDefinition } from '../../engine/content/types';
import type { PlayerState } from '../../engine/core/game-state';
import type { PlayerId, ResourceId } from '../../engine/core/ids';
import { canAfford } from '../../engine/rules/resource-rules';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

type TradeTab = 'BANK' | 'PLAYER';
type Selection = Readonly<Record<string, number>>;

interface TradeModalProps {
  readonly open: boolean;
  readonly player: PlayerState;
  readonly opponents: readonly PlayerState[];
  readonly bank: ResourceBundle;
  readonly bankRatios: Readonly<Record<string, number>>;
  readonly maximumRequestAmount: number;
  readonly errorMessage: string | null;
  readonly onClearError: () => void;
  readonly onClose: () => void;
  readonly onBankTrade: (giveResourceId: ResourceId, receiveResourceId: ResourceId) => void;
  readonly onCreateTrade: (
    recipientId: PlayerId,
    offered: ResourceBundle,
    requested: ResourceBundle,
  ) => void;
  readonly includeCommodities?: boolean;
}

function selectionBundle(
  selection: Selection,
  goods: readonly ResourceDefinition[],
): ResourceBundle {
  return resourceBundle(
    goods.flatMap((resource) => {
      const amount = selection[resource.id] ?? 0;
      return amount > 0 ? ([[resource.id, amount]] as const) : [];
    }),
  );
}

function selectionTotal(selection: Selection): number {
  return Object.values(selection).reduce<number>((total, amount) => total + (amount ?? 0), 0);
}

function heldCount(player: PlayerState, resourceId: ResourceId): number {
  return isCommodityId(resourceId)
    ? (player.commodities[resourceId] ?? 0)
    : (player.resources[resourceId] ?? 0);
}

function playerCardCount(player: PlayerState, goods: readonly ResourceDefinition[]): number {
  return goods.reduce((total, good) => total + heldCount(player, good.id), 0);
}

interface BundleEditorProps {
  readonly title: string;
  readonly selectionName: 'offer' | 'request';
  readonly selection: Selection;
  readonly blockedBy: Selection;
  readonly maximumFor: (resourceId: ResourceId) => number;
  readonly availableFor?: (resourceId: ResourceId) => number;
  readonly onAdjust: (resourceId: ResourceId, change: -1 | 1) => void;
  readonly goods: readonly ResourceDefinition[];
}

function BundleEditor({
  title,
  selectionName,
  selection,
  blockedBy,
  maximumFor,
  availableFor,
  onAdjust,
  goods,
}: BundleEditorProps) {
  return (
    <fieldset className="trade-bundle-editor">
      <legend>{title}</legend>
      <div className="trade-bundle-editor__rows">
        {goods.map((resource) => {
          const selected = selection[resource.id] ?? 0;
          const maximum = maximumFor(resource.id);
          const blocked = (blockedBy[resource.id] ?? 0) > 0;
          return (
            <div key={resource.id} className="trade-resource-row">
              <span
                className="trade-resource-row__swatch"
                style={{ backgroundColor: resource.color }}
                aria-hidden="true"
              />
              <div>
                <strong>{resource.displayName}</strong>
                {availableFor === undefined ? null : (
                  <small>{availableFor(resource.id)} available</small>
                )}
              </div>
              <Button
                variant="ghost"
                aria-label={`Remove ${resource.displayName} from ${selectionName}`}
                disabled={selected < 1}
                onClick={() => onAdjust(resource.id, -1)}
              >
                −
              </Button>
              <output aria-label={`${resource.displayName} in ${selectionName}`}>{selected}</output>
              <Button
                variant="ghost"
                aria-label={`Add ${resource.displayName} to ${selectionName}`}
                disabled={blocked || selected >= maximum}
                title={blocked ? 'A resource cannot appear on both sides of one trade.' : undefined}
                onClick={() => onAdjust(resource.id, 1)}
              >
                +
              </Button>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export function TradeModal({
  open,
  player,
  opponents,
  bank,
  bankRatios,
  maximumRequestAmount,
  errorMessage,
  onClearError,
  onClose,
  onBankTrade,
  onCreateTrade,
  includeCommodities = false,
}: TradeModalProps) {
  const goods = includeCommodities ? HAND_GOODS : RESOURCES;
  const [tab, setTab] = useState<TradeTab>('BANK');
  const [giveResourceId, setGiveResourceId] = useState<ResourceId | null>(null);
  const [receiveResourceId, setReceiveResourceId] = useState<ResourceId | null>(null);
  const [recipientId, setRecipientId] = useState<PlayerId | null>(opponents[0]?.id ?? null);
  const [offeredSelection, setOfferedSelection] = useState<Selection>({});
  const [requestedSelection, setRequestedSelection] = useState<Selection>({});

  const selectTab = (nextTab: TradeTab) => {
    setTab(nextTab);
    onClearError();
  };
  const selectedRatio = giveResourceId === null ? null : (bankRatios[giveResourceId] ?? null);
  const canCompleteBankTrade =
    giveResourceId !== null &&
    receiveResourceId !== null &&
    giveResourceId !== receiveResourceId &&
    selectedRatio !== null &&
    heldCount(player, giveResourceId) >= selectedRatio &&
    (bank[receiveResourceId] ?? 0) >= 1;

  const adjustBundle = (side: 'OFFER' | 'REQUEST', resourceId: ResourceId, change: -1 | 1) => {
    const setter = side === 'OFFER' ? setOfferedSelection : setRequestedSelection;
    const maximum = side === 'OFFER' ? heldCount(player, resourceId) : maximumRequestAmount;
    setter((current) => {
      const amount = current[resourceId] ?? 0;
      if ((change < 0 && amount < 1) || (change > 0 && amount >= maximum)) return current;
      return { ...current, [resourceId]: amount + change };
    });
    onClearError();
  };

  const offered = selectionBundle(offeredSelection, goods);
  const requested = selectionBundle(requestedSelection, goods);
  const canOfferPlayerTrade =
    recipientId !== null &&
    selectionTotal(offeredSelection) > 0 &&
    selectionTotal(requestedSelection) > 0 &&
    canAfford(resourceBundle(goods.map((good) => [good.id, heldCount(player, good.id)])), offered);

  return (
    <Modal
      open={open}
      title="Trade resources"
      description="Exchange with the finite bank or make one exact offer to an opponent."
      onClose={onClose}
    >
      <div className="trade-tabs" role="tablist" aria-label="Trade type">
        <Button
          data-modal-autofocus
          role="tab"
          aria-selected={tab === 'BANK'}
          variant={tab === 'BANK' ? 'primary' : 'ghost'}
          onClick={() => selectTab('BANK')}
        >
          Bank or port
        </Button>
        <Button
          role="tab"
          aria-selected={tab === 'PLAYER'}
          variant={tab === 'PLAYER' ? 'primary' : 'ghost'}
          onClick={() => selectTab('PLAYER')}
        >
          Player offer
        </Button>
      </div>

      {tab === 'BANK' ? (
        <div className="bank-trade" role="tabpanel">
          <fieldset className="trade-resource-choices">
            <legend>Give to the bank</legend>
            <div>
              {goods.map((resource) => {
                const ratio = bankRatios[resource.id] ?? 4;
                const available = heldCount(player, resource.id);
                return (
                  <button
                    key={resource.id}
                    type="button"
                    className="trade-resource-choice"
                    aria-label={`Give ${resource.displayName}: ${ratio} required, ${available} available`}
                    aria-pressed={giveResourceId === resource.id}
                    disabled={available < ratio}
                    onClick={() => {
                      setGiveResourceId(resource.id);
                      if (receiveResourceId === resource.id) setReceiveResourceId(null);
                      onClearError();
                    }}
                  >
                    <i style={{ backgroundColor: resource.color }} aria-hidden="true" />
                    <span>{resource.displayName}</span>
                    <small>
                      {ratio}:1 · {available} held
                    </small>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="trade-resource-choices">
            <legend>Receive from the bank</legend>
            <div>
              {goods.map((resource) => {
                const available = bank[resource.id] ?? 0;
                return (
                  <button
                    key={resource.id}
                    type="button"
                    className="trade-resource-choice"
                    aria-label={`Receive ${resource.displayName}: ${available} in bank`}
                    aria-pressed={receiveResourceId === resource.id}
                    disabled={available < 1 || giveResourceId === resource.id}
                    onClick={() => {
                      setReceiveResourceId(resource.id);
                      onClearError();
                    }}
                  >
                    <i style={{ backgroundColor: resource.color }} aria-hidden="true" />
                    <span>{resource.displayName}</span>
                    <small>{available} in bank</small>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="trade-summary" aria-live="polite">
            {giveResourceId === null || selectedRatio === null
              ? 'Choose the resource you will give.'
              : receiveResourceId === null
                ? `Give ${selectedRatio} cards. Now choose one resource to receive.`
                : `Exchange ${selectedRatio} for 1.`}
          </div>

          {errorMessage === null ? null : (
            <p className="modal-error" role="alert">
              {errorMessage}
            </p>
          )}
          <div className="modal__actions">
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            <Button
              variant="primary"
              disabled={!canCompleteBankTrade}
              onClick={() => {
                if (giveResourceId !== null && receiveResourceId !== null) {
                  onBankTrade(giveResourceId, receiveResourceId);
                }
              }}
            >
              Complete bank trade
            </Button>
          </div>
        </div>
      ) : (
        <div className="player-trade" role="tabpanel">
          <label className="field" htmlFor="trade-recipient">
            <span>Offer to</span>
            <select
              id="trade-recipient"
              value={recipientId ?? ''}
              onChange={(event) => {
                setRecipientId(event.target.value as PlayerId);
                onClearError();
              }}
            >
              {opponents.map((opponent) => (
                <option key={opponent.id} value={opponent.id}>
                  {opponent.name} · {playerCardCount(opponent, goods)} hand cards
                </option>
              ))}
            </select>
          </label>

          <div className="trade-bundle-grid">
            <BundleEditor
              title="You give"
              selectionName="offer"
              selection={offeredSelection}
              blockedBy={requestedSelection}
              maximumFor={(resourceId) => heldCount(player, resourceId)}
              availableFor={(resourceId) => heldCount(player, resourceId)}
              onAdjust={(resourceId, change) => adjustBundle('OFFER', resourceId, change)}
              goods={goods}
            />
            <BundleEditor
              title="You request"
              selectionName="request"
              selection={requestedSelection}
              blockedBy={offeredSelection}
              maximumFor={() => maximumRequestAmount}
              onAdjust={(resourceId, change) => adjustBundle('REQUEST', resourceId, change)}
              goods={goods}
            />
          </div>

          <p className="trade-note">
            The recipient’s resources are checked when they accept the offer.
          </p>
          {errorMessage === null ? null : (
            <p className="modal-error" role="alert">
              {errorMessage}
            </p>
          )}
          <div className="modal__actions">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!canOfferPlayerTrade}
              onClick={() => {
                if (recipientId !== null) onCreateTrade(recipientId, offered, requested);
              }}
            >
              Send offer
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
