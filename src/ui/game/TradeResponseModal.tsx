import { HAND_GOODS, isCommodityId } from '../../engine/content/commodities';
import { RESOURCES } from '../../engine/content/resources';
import type { ResourceBundle, ResourceDefinition } from '../../engine/content/types';
import type { PlayerState, TradeOffer } from '../../engine/core/game-state';
import type { TradeAcceptance } from '../../engine/rules/trade-rules';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface TradeResponseModalProps {
  readonly trade: TradeOffer;
  readonly proposer: PlayerState;
  readonly recipient: PlayerState;
  readonly acceptance: TradeAcceptance;
  readonly errorMessage: string | null;
  readonly onRespond: (accepted: boolean) => void;
  readonly includeCommodities?: boolean;
}

const preventDismiss = () => undefined;

function bundleText(resources: ResourceBundle, goods: readonly ResourceDefinition[]): string {
  return goods
    .flatMap((resource) => {
      const amount = resources[resource.id] ?? 0;
      return amount > 0 ? [`${amount} ${resource.displayName}`] : [];
    })
    .join(' · ');
}

export function TradeResponseModal({
  trade,
  proposer,
  recipient,
  acceptance,
  errorMessage,
  onRespond,
  includeCommodities = false,
}: TradeResponseModalProps) {
  const goods = includeCommodities ? HAND_GOODS : RESOURCES;
  return (
    <Modal
      open
      title={`${recipient.name}: trade offer`}
      description="This offer must be accepted or rejected before play continues."
      dismissible={false}
      onClose={preventDismiss}
    >
      <div className="trade-response">
        <p>
          <strong>{proposer.name}</strong> offers you:
        </p>
        <div className="trade-response__bundle">{bundleText(trade.offered, goods)}</div>
        <p>In exchange for:</p>
        <div className="trade-response__bundle">{bundleText(trade.requested, goods)}</div>

        <section className="trade-response__hand" aria-label={`${recipient.name} resource hand`}>
          <span>Your hand</span>
          <div>
            {goods.map((resource) => (
              <small key={resource.id}>
                {resource.displayName}{' '}
                <strong>
                  {isCommodityId(resource.id)
                    ? (recipient.commodities[resource.id] ?? 0)
                    : (recipient.resources[resource.id] ?? 0)}
                </strong>
              </small>
            ))}
          </div>
        </section>

        {acceptance.reason === null ? null : (
          <p className="trade-warning">{acceptance.reason} You can still reject the offer.</p>
        )}
        {errorMessage === null ? null : (
          <p className="modal-error" role="alert">
            {errorMessage}
          </p>
        )}
        <div className="modal__actions trade-response__actions">
          <Button variant="danger" onClick={() => onRespond(false)}>
            Reject trade
          </Button>
          <Button
            variant="primary"
            disabled={!acceptance.canAccept}
            onClick={() => onRespond(true)}
          >
            Accept trade
          </Button>
        </div>
      </div>
    </Modal>
  );
}
