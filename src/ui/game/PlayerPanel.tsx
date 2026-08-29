import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { PLAYER_COLORS } from '../../engine/content/colors';
import { getKNProgressCardDefinition } from '../../engine/content/kn-progress-cards';
import type { KNProgressFamily } from '../../engine/content/types';
import type { GameState, PlayerState } from '../../engine/core/game-state';

interface PlayerPanelProps {
  readonly player: PlayerState;
  readonly position: number;
  readonly active: boolean;
  readonly score: number;
  readonly longestRoadLength: number;
  readonly robberCount: number;
  readonly holdsLongestRoad: boolean;
  readonly holdsLargestForce: boolean;
  readonly winner: boolean;
  readonly activityLabel?: string | null;
  readonly kNMode?: boolean;
  readonly wallCount?: number;
  readonly discardThreshold?: number;
  readonly cityCount?: number;
  readonly knProgressCards?: NonNullable<GameState['kn']>['progressCards'] | undefined;
  readonly publicCardInfo?: {
    readonly resourceCards: number;
    readonly commodityCards: number;
    readonly progressCards: number;
    readonly progressFamilies: Readonly<Record<KNProgressFamily, number>>;
  };
}

interface ProgressSummaryAnchor {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const PROGRESS_FAMILY_DETAILS: Readonly<
  Record<KNProgressFamily, { readonly label: string; readonly glyph: string }>
> = {
  SCIENCE: { label: 'Science', glyph: '⚗' },
  TRADE: { label: 'Trade', glyph: '⚖' },
  POLITICS: { label: 'Politics', glyph: '♜' },
};

export function PlayerPanel({
  player,
  position,
  active,
  score,
  longestRoadLength,
  robberCount,
  holdsLongestRoad,
  holdsLargestForce,
  winner,
  activityLabel = null,
  kNMode = false,
  wallCount = 0,
  discardThreshold = 7,
  cityCount = 0,
  knProgressCards,
  publicCardInfo,
}: PlayerPanelProps) {
  const [progressSummaryAnchor, setProgressSummaryAnchor] = useState<ProgressSummaryAnchor | null>(
    null,
  );
  const color = PLAYER_COLORS.find((definition) => definition.id === player.colorId);
  const resourceCount =
    publicCardInfo?.resourceCards ??
    Object.values(player.resources).reduce<number>((total, amount) => total + (amount ?? 0), 0);
  const commodityCount =
    publicCardInfo?.commodityCards ??
    Object.values(player.commodities).reduce<number>((total, amount) => total + (amount ?? 0), 0);
  const activeKnightStrength = player.knights.reduce(
    (total, knight) => total + (knight.active ? knight.level : 0),
    0,
  );
  const knightPowerGlows =
    holdsLargestForce || (cityCount > 0 && activeKnightStrength >= cityCount);
  const safeHandLimit = discardThreshold + wallCount * 2;
  const progressCount =
    publicCardInfo?.progressCards ??
    (kNMode ? player.knProgressCardIds.length : player.progressCardIds.length);
  const progressFamilyCounts =
    publicCardInfo?.progressFamilies ??
    player.knProgressCardIds.reduce<Record<KNProgressFamily, number>>(
      (counts, cardId) => {
        const card = knProgressCards?.[cardId];
        const definition =
          card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
        if (definition !== undefined) counts[definition.family] += 1;
        return counts;
      },
      { SCIENCE: 0, TRADE: 0, POLITICS: 0 },
    );
  const visibleProgressFamilies = (
    Object.keys(PROGRESS_FAMILY_DETAILS) as KNProgressFamily[]
  ).filter((family) => progressFamilyCounts[family] > 0);
  const showProgressSummary = (element: HTMLElement) => {
    if (visibleProgressFamilies.length === 0) return;
    const bounds = element.getBoundingClientRect();
    setProgressSummaryAnchor({
      left: Math.max(190, bounds.left),
      top: Math.max(70, Math.min(globalThis.innerHeight - 70, bounds.top)),
      width: bounds.width,
      height: bounds.height,
    });
  };

  if (kNMode) {
    return (
      <article
        className={`game-player game-player--kn ${active ? 'game-player--active' : ''} ${activityLabel === null ? '' : 'game-player--busy'} ${winner ? 'game-player--winner' : ''}`}
        data-player-panel={player.id}
        style={{ '--player-color': color?.hex ?? '#ffffff' } as CSSProperties}
        aria-label={`${player.name}, player ${position}`}
      >
        <header className="game-player-kn__heading">
          <strong>{player.name}</strong>
          <small title={activityLabel ?? undefined}>
            {activityLabel === null ? (
              <span className="game-player__status-dot" aria-hidden="true" />
            ) : null}
            {activityLabel ?? (active ? 'Taking their turn' : color?.displayName)}
          </small>
        </header>
        <div className="game-player-kn__body">
          <span className="game-player__portrait game-player-kn__portrait" aria-hidden="true">
            {activityLabel === null ? null : (
              <span className="game-player__busy-dots">
                <i />
                <i />
                <i />
              </span>
            )}
            <span className="game-player__avatar-head" />
            <span className="game-player__avatar-body" />
            <span className="game-player__score-ribbon" title="Victory points">
              <strong>{score}</strong>
            </span>
          </span>
          <dl className="game-player-kn__stats">
            <div title="Resource and commodity cards">
              <dt className="visually-hidden">Resource and commodity cards</dt>
              <dd className="game-player__info-card game-player__info-card--resources">
                <span aria-hidden="true">?</span>
                <strong>{resourceCount + commodityCount}</strong>
              </dd>
            </div>
            <div title={visibleProgressFamilies.length === 0 ? 'Progress cards' : undefined}>
              <dt className="visually-hidden">Progress cards</dt>
              <dd
                className="game-player__info-card game-player__info-card--progress"
                tabIndex={visibleProgressFamilies.length === 0 ? undefined : 0}
                aria-label={`${progressCount} Progress Card${progressCount === 1 ? '' : 's'}`}
                aria-describedby={
                  progressSummaryAnchor === null ? undefined : `progress-summary-${player.id}`
                }
                onMouseEnter={(event) => showProgressSummary(event.currentTarget)}
                onMouseLeave={() => setProgressSummaryAnchor(null)}
                onFocus={(event) => showProgressSummary(event.currentTarget)}
                onBlur={() => setProgressSummaryAnchor(null)}
              >
                <span aria-hidden="true">✶</span>
                <strong>{progressCount}</strong>
              </dd>
            </div>
            <div
              title={`City improvements: Science ${player.cityImprovements.SCIENCE}, Trade ${player.cityImprovements.TRADE}, Politics ${player.cityImprovements.POLITICS}`}
            >
              <dt className="visually-hidden">City improvements</dt>
              <dd className="game-player-kn__improvement-grid" aria-hidden="true">
                {(['SCIENCE', 'TRADE', 'POLITICS'] as const).map((track) => (
                  <span key={track} className={`is-${track.toLocaleLowerCase()}`}>
                    {Array.from({ length: 5 }, (_, index) => (
                      <i
                        key={index}
                        className={index < player.cityImprovements[track] ? 'is-filled' : ''}
                      />
                    ))}
                  </span>
                ))}
              </dd>
            </div>
            <div title={`Longest bridge: ${longestRoadLength}`}>
              <dt className="visually-hidden">Longest bridge</dt>
              <dd
                className={`game-player-kn__plain-stat ${holdsLongestRoad ? 'is-award-holder' : ''}`}
              >
                <span className="game-player__bridge-art" aria-hidden="true">
                  <i />
                </span>
                <strong>{longestRoadLength}</strong>
              </dd>
            </div>
            <div
              title={`Active Knight strength ${activeKnightStrength}; ${wallCount} Walls; safe hand limit ${safeHandLimit}`}
            >
              <dt className="visually-hidden">Active Knight strength</dt>
              <dd
                className={`game-player-kn__plain-stat game-player-kn__plain-stat--knights ${knightPowerGlows ? 'is-award-holder' : ''}`}
              >
                <span aria-hidden="true">⚔</span>
                <strong>{activeKnightStrength}</strong>
              </dd>
            </div>
          </dl>
        </div>
        <footer className="game-player-kn__footer">
          <span className="game-player-kn__wall-status" title={`${wallCount} City Walls`}>
            <i aria-hidden="true" />
            <strong>{wallCount}</strong> walls
          </span>
          <span className="game-player-kn__safe-status" title="Safe hand limit">
            <i aria-hidden="true">▣</i>
            Safe <strong>{safeHandLimit}</strong>
          </span>
          {holdsLongestRoad ? <b>Longest Bridge</b> : null}
        </footer>
        {progressSummaryAnchor === null || typeof document === 'undefined'
          ? null
          : createPortal(
              <aside
                id={`progress-summary-${player.id}`}
                className="player-progress-summary-tooltip"
                role="tooltip"
                style={
                  {
                    '--progress-summary-left': `${progressSummaryAnchor.left}px`,
                    '--progress-summary-top': `${progressSummaryAnchor.top + progressSummaryAnchor.height / 2}px`,
                  } as CSSProperties
                }
              >
                <strong>Progress Cards</strong>
                <div>
                  {visibleProgressFamilies.map((family) => (
                    <span
                      key={family}
                      className={`player-progress-summary-tooltip__family player-progress-summary-tooltip__family--${family.toLocaleLowerCase()}`}
                    >
                      <i aria-hidden="true">{PROGRESS_FAMILY_DETAILS[family].glyph}</i>
                      <b>{PROGRESS_FAMILY_DETAILS[family].label}</b>
                      <em>{progressFamilyCounts[family]}</em>
                    </span>
                  ))}
                </div>
              </aside>,
              document.body,
            )}
      </article>
    );
  }

  return (
    <article
      className={`game-player ${active ? 'game-player--active' : ''} ${activityLabel === null ? '' : 'game-player--busy'} ${winner ? 'game-player--winner' : ''}`}
      data-player-panel={player.id}
      style={{ '--player-color': color?.hex ?? '#ffffff' } as CSSProperties}
      aria-label={`${player.name}, player ${position}`}
    >
      <header className="game-player__heading">
        <div className="game-player__identity">
          <strong>{player.name}</strong>
          <small title={activityLabel ?? undefined}>
            {activityLabel === null ? (
              <span className="game-player__status-dot" aria-hidden="true" />
            ) : null}
            {activityLabel ?? (active ? 'Taking their turn' : color?.displayName)}
          </small>
        </div>
        {winner ? <span className="game-player__winner-label">Winner</span> : null}
      </header>

      <div className="game-player__body">
        <span className="game-player__portrait" aria-hidden="true">
          {activityLabel === null ? null : (
            <span className="game-player__busy-dots">
              <i />
              <i />
              <i />
            </span>
          )}
          <span className="game-player__avatar-head" />
          <span className="game-player__avatar-body" />
          <span className="game-player__score-ribbon" title="Victory points">
            <strong>{score}</strong>
          </span>
        </span>

        <dl className="game-player__stats">
          <div className="game-player__stat game-player__stat--resources" title="Resource cards">
            <dt className="visually-hidden">Resource cards</dt>
            <dd className="game-player__info-card game-player__info-card--resources">
              <span aria-hidden="true">?</span>
              <strong>{resourceCount + commodityCount}</strong>
            </dd>
          </div>
          <div className="game-player__stat game-player__stat--progress" title="Progress cards">
            <dt className="visually-hidden">Progress cards</dt>
            <dd className="game-player__info-card game-player__info-card--progress">
              <span aria-hidden="true">🧭</span>
              <strong>{progressCount}</strong>
            </dd>
          </div>
          <div
            className={`game-player__stat game-player__stat--robber ${holdsLargestForce ? 'is-award-holder' : ''}`}
            title="Robbers used"
          >
            <dt className="visually-hidden">Robbers used</dt>
            <dd>
              <span className="game-player__robber-art" aria-hidden="true">
                ♟
              </span>
              <strong>{robberCount}</strong>
            </dd>
          </div>
          <div
            className={`game-player__stat game-player__stat--bridge ${holdsLongestRoad ? 'is-award-holder' : ''}`}
            title="Longest bridge"
          >
            <dt className="visually-hidden">Longest bridge</dt>
            <dd>
              <span className="game-player__bridge-art" aria-hidden="true">
                <i />
              </span>
              <strong>{longestRoadLength}</strong>
            </dd>
          </div>
        </dl>
      </div>
      <div className="game-player__awards">
        {holdsLongestRoad ? <span>Longest Bridge</span> : null}
        {!kNMode && holdsLargestForce ? <span>Largest Force</span> : null}
        {kNMode ? (
          <div className="game-player__kn-summary" aria-label="K+N status">
            <span title="Active Knight strength">
              <i aria-hidden="true">♞</i>
              <strong>{activeKnightStrength}</strong> defense
            </span>
            <span title="City Walls and discard safe limit">
              <i aria-hidden="true">▥</i>
              <strong>{wallCount}</strong> walls · safe {7 + wallCount * 2}
            </span>
            <span title="Permanent Defender points">
              <i aria-hidden="true">◆</i>
              <strong>{player.defenderPoints}</strong> defender
            </span>
          </div>
        ) : null}
      </div>
      {!kNMode ? null : (
        <div className="game-player__improvements" aria-label="City improvements">
          {(['SCIENCE', 'TRADE', 'POLITICS'] as const).map((track) => (
            <span
              key={track}
              className={`improvement-pip improvement-pip--${track.toLocaleLowerCase()}`}
            >
              <small>{track.slice(0, 1)}</small>
              <strong>{player.cityImprovements[track]}</strong>
              <i>
                {player.cityImprovements[track] >= 5
                  ? 'MAX'
                  : `next ${player.cityImprovements[track] + 1}`}
              </i>
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
