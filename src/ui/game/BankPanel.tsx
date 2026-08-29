import type { CSSProperties } from 'react';

import { RESOURCES } from '../../engine/content/resources';
import { HAND_GOODS, isCommodityId } from '../../engine/content/commodities';
import type { ResourceBundle } from '../../engine/content/types';
import type { KNState } from '../../engine/core/game-state';
import { ResourceArtwork } from './ResourceArtwork';

interface BankPanelProps {
  readonly bank: ResourceBundle;
  readonly progressCardsRemaining: number;
  readonly commodityBank?: ResourceBundle;
  readonly knState?: KNState | null;
  readonly hideCounts?: boolean;
}

export function BankPanel({
  bank,
  progressCardsRemaining,
  commodityBank = {},
  knState = null,
  hideCounts = false,
}: BankPanelProps) {
  const goods = knState === null ? RESOURCES : HAND_GOODS;
  return (
    <section className="bank-panel" aria-labelledby="bank-title">
      <h2 id="bank-title" className="visually-hidden">
        Bank
      </h2>
      <div className="bank-inventory">
        <span className="bank-vault" title="Bank supply" aria-hidden="true">
          <i className="bank-vault__roof" />
          <i className="bank-vault__columns">
            <i />
            <i />
            <i />
          </i>
          <i className="bank-vault__base" />
        </span>
        {goods.map((resource) => {
          const label = resource.id === 'livestock' ? 'Sheep' : resource.displayName;
          const count = isCommodityId(resource.id)
            ? (commodityBank[resource.id] ?? 0)
            : (bank[resource.id] ?? 0);
          return (
            <article
              key={resource.id}
              data-bank-card={resource.id}
              className={`bank-card bank-card--${resource.iconKey} ${hideCounts ? 'bank-card--hidden-count' : ''}`}
              style={{ '--resource-color': resource.color } as CSSProperties}
              title={
                hideCounts
                  ? `${resource.displayName}: card count hidden`
                  : `${resource.displayName}: ${count} cards`
              }
            >
              <i className="bank-card__layer bank-card__layer--back" aria-hidden="true" />
              <i className="bank-card__layer bank-card__layer--middle" aria-hidden="true" />
              <span className="bank-card__art" aria-hidden="true">
                <ResourceArtwork resourceId={resource.id} />
              </span>
              {hideCounts ? null : <strong aria-hidden="true">{count}</strong>}
              <span className="visually-hidden">
                {label}: {hideCounts ? 'card count hidden' : count}
              </span>
            </article>
          );
        })}
        {knState === null ? (
          <article
            className="bank-card bank-card--progress"
            data-progress-deck="BASE"
            title="Progress card deck"
          >
            <i className="bank-card__layer bank-card__layer--back" aria-hidden="true" />
            <i className="bank-card__layer bank-card__layer--middle" aria-hidden="true" />
            <span className="bank-card__progress-art" aria-hidden="true">
              🧭
            </span>
            <strong aria-hidden="true">{progressCardsRemaining}</strong>
            <span className="visually-hidden">Progress cards: {progressCardsRemaining}</span>
          </article>
        ) : (
          (['SCIENCE', 'TRADE', 'POLITICS'] as const).map((family) => (
            <article
              key={family}
              data-progress-deck={family}
              className={`bank-card bank-card--progress bank-card--kn-${family.toLocaleLowerCase()}`}
              title={`${family} Progress deck: ${knState.progressDecks[family].length} cards`}
            >
              <i className="bank-card__layer bank-card__layer--back" aria-hidden="true" />
              <i className="bank-card__layer bank-card__layer--middle" aria-hidden="true" />
              <span className="bank-card__progress-art" aria-hidden="true">
                {family === 'SCIENCE' ? '✎' : family === 'TRADE' ? '⚖' : '♜'}
              </span>
              <strong aria-hidden="true">{knState.progressDecks[family].length}</strong>
              <span className="visually-hidden">
                {family} Progress Cards: {knState.progressDecks[family].length}
              </span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
