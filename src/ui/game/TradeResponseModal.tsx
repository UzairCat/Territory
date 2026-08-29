import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { HAND_GOODS } from '../../engine/content/commodities';
import { RESOURCES } from '../../engine/content/resources';
import type { ResourceBundle, ResourceDefinition } from '../../engine/content/types';
import type { GameState, PlayerState, TradeOffer } from '../../engine/core/game-state';
import type { PlayerId } from '../../engine/core/ids';
import { getTradeAcceptance } from '../../engine/rules/trade-rules';
import { Button } from '../components/Button';
import { ResourceArtwork } from './ResourceArtwork';

interface TradeResponsePanelProps {
  readonly state: GameState;
  readonly trade: TradeOffer;
  readonly proposer: PlayerState;
  readonly recipients: readonly PlayerState[];
  readonly playerColors: Readonly<Record<string, string>>;
  readonly paused?: boolean;
  readonly errorMessage: string | null;
  readonly onRespond: (playerId: PlayerId, accepted: boolean) => void;
  readonly onConfirm: (playerId: PlayerId) => void;
  readonly onCancel: () => void;
  readonly onExpire: () => void;
  readonly includeCommodities?: boolean;
}

function BundleCards({
  bundle,
  goods,
}: {
  readonly bundle: ResourceBundle;
  readonly goods: readonly ResourceDefinition[];
}) {
  return (
    <div className="trade-offer-panel__cards">
      {goods.flatMap((resource) =>
        Array.from({ length: bundle[resource.id] ?? 0 }, (_, index) => (
          <span
            key={`${resource.id}-${index}`}
            className="trade-offer-card"
            style={{ '--resource-color': resource.color } as CSSProperties}
            title={resource.displayName}
          >
            <ResourceArtwork resourceId={resource.id} />
          </span>
        )),
      )}
    </div>
  );
}

export function TradeResponsePanel({
  state,
  trade,
  proposer,
  recipients,
  playerColors,
  paused = false,
  errorMessage,
  onRespond,
  onConfirm,
  onCancel,
  onExpire,
  includeCommodities = false,
}: TradeResponsePanelProps) {
  const goods = includeCommodities ? HAND_GOODS : RESOURCES;
  const [remainingSeconds, setRemainingSeconds] = useState(15);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (paused || remainingSeconds === 0) return undefined;
    const timer = globalThis.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => globalThis.clearInterval(timer);
  }, [paused, remainingSeconds]);

  useEffect(() => {
    if (remainingSeconds !== 0 || expiredRef.current) return;
    expiredRef.current = true;
    onExpire();
  }, [onExpire, remainingSeconds]);

  return (
    <aside
      className="trade-offer-panel"
      role="dialog"
      aria-modal="false"
      aria-label={`Trade offer from ${proposer.name}`}
    >
      <header>
        <div>
          <strong>{proposer.name} offers a trade</strong>
          <small>Opponents can respond; the proposer chooses one acceptance.</small>
        </div>
        <time
          className={remainingSeconds <= 5 ? 'is-urgent' : ''}
          aria-label={`${remainingSeconds} seconds remaining`}
        >
          {remainingSeconds}s
        </time>
        <Button variant="ghost" aria-label="Cancel trade offer" onClick={onCancel}>
          ×
        </Button>
      </header>

      <section className="trade-offer-panel__terms" aria-label="Trade terms">
        <div>
          <small>Offers</small>
          <BundleCards bundle={trade.offered} goods={goods} />
        </div>
        <span aria-hidden="true">⇄</span>
        <div>
          <small>Requests</small>
          <BundleCards bundle={trade.requested} goods={goods} />
        </div>
      </section>

      <div className="trade-offer-panel__responses">
        {recipients.map((recipient) => {
          const response = trade.responses[recipient.id] ?? 'PENDING';
          const acceptance = getTradeAcceptance(state, trade.id, recipient.id);
          const color = playerColors[recipient.id] ?? '#6c8f91';
          return (
            <section
              key={recipient.id}
              className={`trade-offer-response trade-offer-response--${response.toLocaleLowerCase()}`}
              style={{ '--trade-player-color': color } as CSSProperties}
              aria-label={`${recipient.name} trade response`}
            >
              <span className="trade-offer-response__portrait" aria-hidden="true">
                <i />
                <b />
              </span>
              <div>
                <strong>{recipient.name}</strong>
                <small>
                  {response === 'PENDING'
                    ? (acceptance.reason ?? 'Waiting for response')
                    : response === 'ACCEPTED'
                      ? 'Accepted · proposer may confirm'
                      : 'Declined this offer'}
                </small>
              </div>
              {response === 'PENDING' ? (
                <div className="trade-offer-response__actions">
                  <Button
                    variant="danger"
                    aria-label={`${recipient.name} decline trade`}
                    onClick={() => onRespond(recipient.id, false)}
                  >
                    ×
                  </Button>
                  <Button
                    variant="primary"
                    aria-label={`${recipient.name} accept trade`}
                    title={acceptance.reason ?? 'Accept trade'}
                    disabled={!acceptance.canAccept}
                    onClick={() => onRespond(recipient.id, true)}
                  >
                    ✓
                  </Button>
                </div>
              ) : response === 'ACCEPTED' ? (
                <Button
                  className="trade-offer-response__confirm"
                  variant="primary"
                  aria-label={`Complete trade with ${recipient.name}`}
                  onClick={() => onConfirm(recipient.id)}
                >
                  ✓
                </Button>
              ) : (
                <span
                  className="trade-offer-response__declined"
                  aria-label={`${recipient.name} declined`}
                >
                  ×
                </span>
              )}
            </section>
          );
        })}
      </div>

      {errorMessage === null ? null : (
        <p className="trade-offer-panel__error" role="alert">
          {errorMessage}
        </p>
      )}
    </aside>
  );
}
