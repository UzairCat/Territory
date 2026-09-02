import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { HAND_GOODS } from '../../engine/content/commodities';
import { RESOURCES } from '../../engine/content/resources';
import type { ResourceBundle, ResourceDefinition } from '../../engine/content/types';
import type { GameState, PlayerState, TradeOffer } from '../../engine/core/game-state';
import type { PlayerId } from '../../engine/core/ids';
import { canAfford, playerHand } from '../../engine/rules/resource-rules';
import { getTradeAcceptance } from '../../engine/rules/trade-rules';
import { PLAYER_TRADE_OFFER_DURATION_MS } from '../../multiplayer/protocol';
import { Button } from '../components/Button';
import { ResourceArtwork } from './ResourceArtwork';

const PLAYER_TRADE_OFFER_DURATION_SECONDS = PLAYER_TRADE_OFFER_DURATION_MS / 1_000;

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
  readonly viewerPlayerId?: PlayerId | null;
  readonly deadlineAt?: number | null;
  readonly clockOffsetMs?: number;
  readonly serverAuthoritative?: boolean;
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

function remainingForDeadline(deadlineAt: number | null, clockOffsetMs: number): number {
  return deadlineAt === null
    ? PLAYER_TRADE_OFFER_DURATION_SECONDS
    : Math.max(0, Math.ceil((deadlineAt - (Date.now() + clockOffsetMs)) / 1_000));
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
  viewerPlayerId = null,
  deadlineAt = null,
  clockOffsetMs = 0,
  serverAuthoritative = false,
}: TradeResponsePanelProps) {
  const goods = includeCommodities ? HAND_GOODS : RESOURCES;
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    remainingForDeadline(deadlineAt, clockOffsetMs),
  );
  const expiredRef = useRef(false);

  useEffect(() => {
    if (paused || remainingSeconds === 0) return undefined;
    const timer = globalThis.setInterval(
      () => {
        setRemainingSeconds((current) =>
          deadlineAt === null
            ? Math.max(0, current - 1)
            : remainingForDeadline(deadlineAt, clockOffsetMs),
        );
      },
      deadlineAt === null ? 1_000 : 250,
    );
    return () => globalThis.clearInterval(timer);
  }, [clockOffsetMs, deadlineAt, paused, remainingSeconds]);

  useEffect(() => {
    if (serverAuthoritative || remainingSeconds !== 0 || expiredRef.current) return;
    expiredRef.current = true;
    onExpire();
  }, [onExpire, remainingSeconds, serverAuthoritative]);

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
        <time aria-label={`${remainingSeconds} seconds remaining`}>{remainingSeconds}s</time>
        {viewerPlayerId === null || viewerPlayerId === proposer.id ? (
          <Button variant="ghost" aria-label="Cancel trade offer" onClick={onCancel}>
            ×
          </Button>
        ) : null}
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
          const canControlRecipient = viewerPlayerId === null || viewerPlayerId === recipient.id;
          const canControlProposer = viewerPlayerId === null || viewerPlayerId === proposer.id;
          const acceptance =
            serverAuthoritative && viewerPlayerId === recipient.id
              ? canAfford(playerHand(recipient), trade.requested)
                ? { canAccept: true, reason: null }
                : { canAccept: false, reason: 'You do not have all of the requested cards.' }
              : getTradeAcceptance(state, trade.id, recipient.id);
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
                    ? canControlRecipient
                      ? (acceptance.reason ?? 'Waiting for response')
                      : 'Waiting for response'
                    : response === 'ACCEPTED'
                      ? 'Accepted · proposer may confirm'
                      : 'Declined this offer'}
                </small>
              </div>
              {response === 'PENDING' && canControlRecipient ? (
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
              ) : response === 'ACCEPTED' && canControlProposer ? (
                <Button
                  className="trade-offer-response__confirm"
                  variant="primary"
                  aria-label={`Complete trade with ${recipient.name}`}
                  onClick={() => onConfirm(recipient.id)}
                >
                  ✓
                </Button>
              ) : response === 'REJECTED' ? (
                <span
                  className="trade-offer-response__declined"
                  aria-label={`${recipient.name} declined`}
                >
                  ×
                </span>
              ) : (
                <span className="trade-offer-response__waiting" aria-label="Waiting for response">
                  …
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
