import { useState } from 'react';

import { COMMODITIES, COMMODITY_IDS } from '../../engine/content/commodities';
import { RESOURCE_IDS } from '../../engine/content/resources';
import type { KNProgressFamily } from '../../engine/content/types';
import type { GameState, PlayerState } from '../../engine/core/game-state';
import { getLegalKnightPlacementVertexIds } from '../../engine/rules/kn-construction-rules';
import { Button } from '../components/Button';
import { ResourceArtwork } from './ResourceArtwork';

type QuickMenu = 'KNIGHTS' | 'IMPROVEMENTS' | null;
export type KnightCommand = 'ACTIVATE' | 'UPGRADE' | 'MOVE';

interface KNActionPanelProps {
  readonly state: GameState;
  readonly player: PlayerState;
  readonly disabled?: boolean;
  readonly buildingKnight: boolean;
  readonly knightCommand: KnightCommand | null;
  readonly eligibleKnightCounts: Readonly<Record<KnightCommand, number>>;
  readonly errorMessage?: string | null;
  readonly onBuildKnight: () => void;
  readonly onSelectKnightCommand: (command: KnightCommand) => void;
  readonly onCancelKnightMode: () => void;
  readonly onBuyImprovement: (track: KNProgressFamily) => void;
}

const TRACKS: Readonly<
  Record<
    KNProgressFamily,
    {
      readonly label: string;
      readonly symbol: string;
      readonly commodityId: (typeof COMMODITY_IDS)[keyof typeof COMMODITY_IDS];
    }
  >
> = {
  SCIENCE: { label: 'Science', symbol: '⚗', commodityId: COMMODITY_IDS.paper },
  TRADE: { label: 'Trade', symbol: '⚖', commodityId: COMMODITY_IDS.cloth },
  POLITICS: { label: 'Politics', symbol: '♜', commodityId: COMMODITY_IDS.coin },
};

function commandName(command: KnightCommand): string {
  return command === 'ACTIVATE' ? 'Activate' : command === 'UPGRADE' ? 'Upgrade' : 'Move';
}

export function KNActionPanel({
  state,
  player,
  disabled = false,
  buildingKnight,
  knightCommand,
  eligibleKnightCounts,
  errorMessage = null,
  onBuildKnight,
  onSelectKnightCommand,
  onCancelKnightMode,
  onBuyImprovement,
}: KNActionPanelProps) {
  const [menu, setMenu] = useState<QuickMenu>(null);
  const ownsCity = Object.values(state.board.vertices).some(
    (vertex) => vertex.building?.ownerId === player.id && vertex.building.type === 'MANSION',
  );
  const canPayKnight =
    (player.resources[RESOURCE_IDS.livestock] ?? 0) >= 1 &&
    (player.resources[RESOURCE_IDS.ore] ?? 0) >= 1;
  const canBuildKnight =
    !disabled &&
    canPayKnight &&
    getLegalKnightPlacementVertexIds(state, player.id).length > 0 &&
    player.knights.filter((knight) => knight.level === 1).length < 2;

  const toggleMenu = (next: Exclude<QuickMenu, null>) => {
    if (menu === next) {
      if (next === 'KNIGHTS') onCancelKnightMode();
      setMenu(null);
      return;
    }
    if (menu === 'KNIGHTS' || next !== 'KNIGHTS') onCancelKnightMode();
    setMenu(next);
  };

  return (
    <section className="kn-quick-controls" aria-label="K+N actions">
      <div className="kn-quick-launchers">
        <Button
          className="kn-quick-launcher"
          variant={menu === 'KNIGHTS' ? 'primary' : 'ghost'}
          disabled={disabled}
          aria-expanded={menu === 'KNIGHTS'}
          aria-label="Knight actions"
          title="Build, activate, upgrade, or move Knights"
          onClick={() => toggleMenu('KNIGHTS')}
        >
          <span className="kn-menu-icon kn-menu-icon--sword" aria-hidden="true" />
          <strong>Knights</strong>
        </Button>
        <Button
          className="kn-quick-launcher kn-quick-launcher--improvements"
          variant={menu === 'IMPROVEMENTS' ? 'primary' : 'ghost'}
          disabled={disabled}
          aria-expanded={menu === 'IMPROVEMENTS'}
          aria-label="City improvements"
          title="Advance Science, Trade, or Politics"
          onClick={() => toggleMenu('IMPROVEMENTS')}
        >
          <span className="kn-menu-icon kn-menu-icon--grid" aria-hidden="true">
            {Array.from({ length: 16 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
          <strong>Improvements</strong>
        </Button>
      </div>

      {menu === null ? null : (
        <div className={`kn-quick-flyout kn-quick-flyout--${menu.toLocaleLowerCase()}`}>
          {menu === 'IMPROVEMENTS' ? (
            <div className="kn-improvement-quick-row">
              {(['SCIENCE', 'TRADE', 'POLITICS'] as const).map((track) => {
                const details = TRACKS[track];
                const level = player.cityImprovements[track];
                const nextLevel = level + 1;
                const cost = Math.max(0, nextLevel - (player.craneDiscountAvailable ? 1 : 0));
                const held = player.commodities[details.commodityId] ?? 0;
                const commodity = COMMODITIES.find(
                  (candidate) => candidate.id === details.commodityId,
                );
                const isMetropolisAttemptWithoutCity = nextLevel === 4 && !ownsCity;
                const unavailable =
                  disabled ||
                  level >= 5 ||
                  held < cost ||
                  (!ownsCity && !isMetropolisAttemptWithoutCity);
                return (
                  <Button
                    key={track}
                    className={`kn-quick-action kn-quick-action--${track.toLocaleLowerCase()}`}
                    variant="ghost"
                    aria-label={`Buy ${details.label} improvement`}
                    disabled={unavailable}
                    title={
                      isMetropolisAttemptWithoutCity
                        ? 'Level 4 needs an eligible City for its Metropolis. Select to see the warning.'
                        : !ownsCity
                          ? 'Own a City before improving it.'
                          : level >= 5
                            ? `${details.label} is complete.`
                            : `${cost} ${commodity?.displayName ?? 'commodity'} · level ${level} to ${nextLevel}`
                    }
                    onClick={() => onBuyImprovement(track)}
                  >
                    <span className="kn-quick-action__symbol" aria-hidden="true">
                      {details.symbol}
                    </span>
                    <strong>{details.label}</strong>
                    <small>Level {level}</small>
                    {level >= 5 ? null : (
                      <span className="kn-quick-cost" aria-hidden="true">
                        <ResourceArtwork resourceId={details.commodityId} />
                        <b>×{cost}</b>
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          ) : (
            <div className="kn-command-quick-row">
              <Button
                className="kn-quick-action"
                variant={buildingKnight ? 'primary' : 'ghost'}
                aria-label="Build Knight"
                aria-pressed={buildingKnight}
                disabled={!buildingKnight && !canBuildKnight}
                title="Build a Basic Knight for one Sheep and one Ore"
                onClick={onBuildKnight}
              >
                <span className="kn-command-icon kn-command-icon--build" aria-hidden="true">
                  ♟
                </span>
                <strong>Build</strong>
                <small>Knight</small>
              </Button>
              {(['ACTIVATE', 'UPGRADE', 'MOVE'] as const).map((nextCommand) => {
                const selected = knightCommand === nextCommand;
                return (
                  <Button
                    key={nextCommand}
                    className="kn-quick-action"
                    variant={selected ? 'primary' : 'ghost'}
                    aria-label={`${commandName(nextCommand)} Knight`}
                    aria-pressed={selected}
                    disabled={!selected && (disabled || eligibleKnightCounts[nextCommand] === 0)}
                    title={
                      eligibleKnightCounts[nextCommand] === 0
                        ? `No Knight can ${commandName(nextCommand).toLocaleLowerCase()} now.`
                        : `Highlight Knights that can ${commandName(nextCommand).toLocaleLowerCase()}.`
                    }
                    onClick={() => onSelectKnightCommand(nextCommand)}
                  >
                    <span
                      className={`kn-command-icon kn-command-icon--${nextCommand.toLocaleLowerCase()}`}
                      aria-hidden="true"
                    >
                      {nextCommand === 'ACTIVATE' ? '◉' : nextCommand === 'UPGRADE' ? '⇧' : '↪'}
                    </span>
                    <strong>{commandName(nextCommand)}</strong>
                    <small>Knight</small>
                  </Button>
                );
              })}
            </div>
          )}
          {errorMessage === null ? null : (
            <p className="kn-quick-flyout__error" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
