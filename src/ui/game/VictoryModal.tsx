import { useState, type CSSProperties } from 'react';

import { HAND_GOODS } from '../../engine/content/commodities';
import { PLAYER_COLORS } from '../../engine/content/colors';
import { getKNProgressCardDefinition } from '../../engine/content/kn-progress-cards';
import { PROGRESS_CARDS } from '../../engine/content/progress-cards';
import type { ResourceBundle } from '../../engine/content/types';
import type { GameState } from '../../engine/core/game-state';
import {
  createMatchStatistics,
  resourceStatisticTotal,
  type PlayerMatchStatistics,
  type ProgressStatisticFamily,
} from '../../engine/core/match-statistics';
import type { PlayerId, ResourceId } from '../../engine/core/ids';
import { calculateScoreBreakdown, type ScoreBreakdown } from '../../engine/rules/scoring-rules';
import { orderedPlayerIds } from '../../engine/rules/setup-rules';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { ResourceArtwork } from './ResourceArtwork';

interface VictoryModalProps {
  readonly state: GameState;
  readonly rematchError: string | null;
  readonly onRematch: () => void;
  readonly onLobby: () => void;
  readonly onMenu: () => void;
}

type ReportTab = 'OVERVIEW' | 'POINTS' | 'RESOURCES' | 'DICE' | 'ACTIVITY';

const REPORT_TABS: readonly {
  readonly id: ReportTab;
  readonly label: string;
  readonly icon: string;
}[] = [
  { id: 'OVERVIEW', label: 'Overview', icon: '♛' },
  { id: 'POINTS', label: 'Points', icon: '★' },
  { id: 'RESOURCES', label: 'Resources', icon: '◆' },
  { id: 'DICE', label: 'Dice', icon: '⚄' },
  { id: 'ACTIVITY', label: 'Cards & actions', icon: '✦' },
];

const PROGRESS_FAMILIES: readonly {
  readonly id: ProgressStatisticFamily;
  readonly label: string;
}[] = [
  { id: 'CLASSIC', label: 'Classic' },
  { id: 'SCIENCE', label: 'Science' },
  { id: 'TRADE', label: 'Trade' },
  { id: 'POLITICS', label: 'Politics' },
];

function bundleAmount(bundle: ResourceBundle, resourceId: ResourceId): number {
  return bundle[resourceId] ?? 0;
}

function incomingTotal(statistics: PlayerMatchStatistics): number {
  return (
    resourceStatisticTotal(statistics.produced) +
    resourceStatisticTotal(statistics.gained) +
    resourceStatisticTotal(statistics.tradedIn) +
    resourceStatisticTotal(statistics.stolen)
  );
}

function outgoingTotal(statistics: PlayerMatchStatistics): number {
  return (
    resourceStatisticTotal(statistics.spent) +
    resourceStatisticTotal(statistics.discarded) +
    resourceStatisticTotal(statistics.tradedOut) +
    resourceStatisticTotal(statistics.stolenFrom) +
    resourceStatisticTotal(statistics.lost)
  );
}

function playerStyle(state: GameState, playerId: PlayerId): CSSProperties {
  const player = state.players[playerId];
  const color =
    PLAYER_COLORS.find((candidate) => candidate.id === player?.colorId)?.hex ?? '#d9bc72';
  return { '--report-player-color': color } as CSSProperties;
}

function leaderId(
  playerIds: readonly PlayerId[],
  value: (playerId: PlayerId) => number,
): { readonly playerId: PlayerId; readonly value: number } | null {
  let leader: PlayerId | null = null;
  let highest = 0;
  for (const playerId of playerIds) {
    const candidate = value(playerId);
    if (candidate > highest) {
      leader = playerId;
      highest = candidate;
    }
  }
  return leader === null ? null : { playerId: leader, value: highest };
}

interface PointSource {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly detail: string;
  readonly points: number;
}

const METROPOLIS_NAMES = {
  SCIENCE: 'Science',
  TRADE: 'Trade',
  POLITICS: 'Politics',
} as const;

function victoryCardNames(state: GameState, playerId: PlayerId): readonly string[] {
  if (state.kn === null) {
    return Object.values(state.progressCards).flatMap((card) => {
      if (card.ownerId !== playerId) return [];
      const definition = PROGRESS_CARDS.find((candidate) => candidate.id === card.definitionId);
      return definition !== undefined && definition.victoryPoints > 0
        ? [definition.displayName]
        : [];
    });
  }
  const player = state.players[playerId];
  if (player === undefined) return [];
  return player.revealedKNProgressCardIds.flatMap((cardInstanceId) => {
    const card = state.kn?.progressCards[cardInstanceId];
    const definition =
      card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
    return definition !== undefined && definition.revealedVictoryPoints > 0
      ? [definition.displayName]
      : [];
  });
}

function pointSources(
  state: GameState,
  playerId: PlayerId,
  score: ScoreBreakdown,
): readonly PointSource[] {
  const metropolisNames = Object.values(state.board.vertices).flatMap((vertex) => {
    const metropolis = vertex.building?.ownerId === playerId ? vertex.building.metropolis : null;
    return metropolis === null || metropolis === undefined ? [] : [METROPOLIS_NAMES[metropolis]];
  });
  const cardNames = victoryCardNames(state, playerId);
  const sources: PointSource[] = [
    {
      id: 'houses',
      icon: '⌂',
      label: 'Houses',
      detail: `${score.houses} on the board × 1 VP`,
      points: score.houses,
    },
    {
      id: 'cities',
      icon: '♜',
      label: 'Cities',
      detail: `${score.cities / 2} on the board × 2 VP`,
      points: score.cities,
    },
    {
      id: 'metropolises',
      icon: '♛',
      label: 'Metropolises',
      detail:
        metropolisNames.length > 0 ? `${metropolisNames.join(', ')} × 2 VP` : 'No Metropolis held',
      points: score.metropolises,
    },
    {
      id: 'longest-road',
      icon: '═',
      label: 'Longest Road',
      detail: 'Held at the end of the match',
      points: score.longestRoad,
    },
    {
      id: 'largest-force',
      icon: '♞',
      label: 'Largest Force',
      detail: 'Held at the end of the match',
      points: score.largestForce,
    },
    {
      id: 'defender',
      icon: '⚔',
      label: 'Defender rewards',
      detail: `${score.defenderPoints} successful defense award${score.defenderPoints === 1 ? '' : 's'}`,
      points: score.defenderPoints,
    },
    {
      id: 'merchant',
      icon: '⚓',
      label: 'Merchant',
      detail: 'Controlled at the end of the match',
      points: score.merchant,
    },
    {
      id: 'victory-cards',
      icon: '✦',
      label: 'Victory cards',
      detail: cardNames.length > 0 ? cardNames.join(', ') : 'No victory cards revealed',
      points: score.victoryCards,
    },
  ].filter((source) => source.points > 0);
  const accountedPoints = sources.reduce((total, source) => total + source.points, 0);
  if (accountedPoints < score.total) {
    sources.push({
      id: 'other',
      icon: '+',
      label: 'Other points',
      detail: 'Additional scoring effects',
      points: score.total - accountedPoints,
    });
  }
  return sources;
}

function StatTile({
  icon,
  value,
  label,
}: {
  readonly icon: string;
  readonly value: string | number;
  readonly label: string;
}) {
  return (
    <article className="match-report-stat">
      <span aria-hidden="true">{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

export function VictoryModal({
  state,
  rematchError,
  onRematch,
  onLobby,
  onMenu,
}: VictoryModalProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>('OVERVIEW');
  const winner = state.winnerId === null ? undefined : state.players[state.winnerId];
  if (winner === undefined || state.winnerId === null) return null;

  const statistics =
    state.statistics ?? createMatchStatistics(Object.keys(state.players) as PlayerId[]);
  const playerIds = orderedPlayerIds(state);
  const rankedPlayerIds = [...playerIds].sort((first, second) => {
    const scoreDifference =
      calculateScoreBreakdown(state, second).total - calculateScoreBreakdown(state, first).total;
    return scoreDifference === 0
      ? playerIds.indexOf(first) - playerIds.indexOf(second)
      : scoreDifference;
  });
  const winnerStatistics = statistics.players[state.winnerId]!;
  const totalProduced = Object.values(statistics.players).reduce(
    (total, player) => total + resourceStatisticTotal(player.produced),
    0,
  );
  const totalProgressPlayed = Object.values(statistics.players).reduce(
    (total, player) => total + player.progressCardsPlayed,
    0,
  );
  const totalBuilds = Object.values(statistics.players).reduce(
    (total, player) =>
      total +
      player.roadsBuilt +
      player.housesBuilt +
      player.citiesBuilt +
      player.wallsBuilt +
      player.knightsBuilt,
    0,
  );
  const mostRolled = Object.entries(statistics.dice.totals).reduce<
    readonly [string, number] | null
  >((highest, entry) => (highest === null || entry[1] > highest[1] ? entry : highest), null);
  const maximumRollFrequency = Math.max(1, ...Object.values(statistics.dice.totals));
  const longestMatchTurn = Math.max(
    state.turn.turnNumber,
    ...Object.values(statistics.players).map((player) => player.turnsTaken),
  );
  const productionLeader = leaderId(playerIds, (playerId) =>
    resourceStatisticTotal(statistics.players[playerId]!.produced),
  );
  const tradeLeader = leaderId(
    playerIds,
    (playerId) =>
      statistics.players[playerId]!.bankTrades + statistics.players[playerId]!.playerTrades,
  );
  const builderLeader = leaderId(
    playerIds,
    (playerId) =>
      statistics.players[playerId]!.roadsBuilt +
      statistics.players[playerId]!.housesBuilt +
      statistics.players[playerId]!.citiesBuilt +
      statistics.players[playerId]!.wallsBuilt +
      statistics.players[playerId]!.knightsBuilt,
  );
  const cardLeader = leaderId(
    playerIds,
    (playerId) => statistics.players[playerId]!.progressCardsPlayed,
  );
  const matchLeaders = [
    {
      title: 'Production powerhouse',
      icon: '♨',
      leader: productionLeader,
      suffix: 'cards produced',
    },
    { title: 'Master builder', icon: '⌂', leader: builderLeader, suffix: 'pieces placed' },
    { title: 'Trade magnate', icon: '⇄', leader: tradeLeader, suffix: 'deals completed' },
    { title: 'Card strategist', icon: '✦', leader: cardLeader, suffix: 'cards played' },
  ].filter((entry) => entry.leader !== null);

  return (
    <Modal
      open
      title={`${winner.name} wins Territory!`}
      description={`Match complete · first to ${state.config.victoryTarget} victory points`}
      dismissible={false}
      onClose={() => undefined}
      backdropClassName="victory-backdrop"
      className="modal--match-report"
    >
      <div className="match-report">
        <section className="match-report-hero" style={playerStyle(state, state.winnerId)}>
          <div className="match-report-confetti" aria-hidden="true">
            {Array.from({ length: 14 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="match-report-winner-avatar">
            <span className="match-report-crown" aria-hidden="true">
              ♛
            </span>
            <PlayerAvatar playerName={winner.name} avatarId={winner.avatarId} />
          </div>
          <div className="match-report-winner-copy">
            <small>CHAMPION OF THE REALM</small>
            <h3>{winner.name}</h3>
            <p>
              A victory forged across {Math.max(1, longestMatchTurn)} turns with{' '}
              {winnerStatistics.progressCardsPlayed} progress cards played.
            </p>
          </div>
          <div className="match-report-winner-score">
            <strong>{calculateScoreBreakdown(state, state.winnerId).total}</strong>
            <span>VICTORY POINTS</span>
          </div>
        </section>

        <nav className="match-report-tabs" role="tablist" aria-label="Match report sections">
          {REPORT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`match-report-${tab.id.toLocaleLowerCase()}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div
          id={`match-report-${activeTab.toLocaleLowerCase()}`}
          className="match-report-panel"
          role="tabpanel"
        >
          {activeTab === 'OVERVIEW' ? (
            <>
              <section className="match-report-stat-grid" aria-label="Match highlights">
                <StatTile icon="⚄" value={statistics.dice.rolls} label="Dice rolls" />
                <StatTile icon="◆" value={totalProduced} label="Cards produced" />
                <StatTile
                  icon="⇄"
                  value={statistics.bankTrades + statistics.playerTrades}
                  label="Trades completed"
                />
                <StatTile icon="⌂" value={totalBuilds} label="Pieces placed" />
                <StatTile icon="✦" value={totalProgressPlayed} label="Progress cards played" />
              </section>

              <div className="match-report-overview-grid">
                <section className="match-report-section">
                  <header className="match-report-section__heading">
                    <div>
                      <small>FINAL STANDINGS</small>
                      <h4>The table</h4>
                    </div>
                    <span>{playerIds.length} players</span>
                  </header>
                  <div className="match-report-standings">
                    {rankedPlayerIds.map((playerId, index) => {
                      const player = state.players[playerId]!;
                      const score = calculateScoreBreakdown(state, playerId);
                      const sources = pointSources(state, playerId, score);
                      const playerStatistics = statistics.players[playerId]!;
                      return (
                        <article
                          key={playerId}
                          className={playerId === state.winnerId ? 'is-winner' : ''}
                          style={playerStyle(state, playerId)}
                        >
                          <span className="match-report-rank">{index + 1}</span>
                          <PlayerAvatar playerName={player.name} avatarId={player.avatarId} />
                          <div className="match-report-standing-copy">
                            <header>
                              <strong>{player.name}</strong>
                              {playerId === state.winnerId ? <em>Winner</em> : null}
                            </header>
                            <div className="match-report-score-track" aria-hidden="true">
                              <i
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (score.total / state.config.victoryTarget) * 100,
                                  )}%`,
                                }}
                              />
                            </div>
                            <small>
                              {sources.length === 0
                                ? 'No victory points scored'
                                : sources
                                    .map((source) => `${source.label} ${source.points}`)
                                    .join(' · ')}
                            </small>
                          </div>
                          <div className="match-report-standing-score">
                            <strong>{score.total} VP</strong>
                            <small>{playerStatistics.diceRolls} rolls</small>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section className="match-report-section">
                  <header className="match-report-section__heading">
                    <div>
                      <small>MATCH HONOURS</small>
                      <h4>Standout players</h4>
                    </div>
                  </header>
                  <div className="match-report-honours">
                    {matchLeaders.length === 0 ? (
                      <p className="match-report-empty">No match honours were recorded.</p>
                    ) : (
                      matchLeaders.map((entry) => {
                        const playerId = entry.leader!.playerId;
                        const player = state.players[playerId]!;
                        return (
                          <article key={entry.title} style={playerStyle(state, playerId)}>
                            <span aria-hidden="true">{entry.icon}</span>
                            <div>
                              <small>{entry.title}</small>
                              <strong>{player.name}</strong>
                              <em>
                                {entry.leader!.value} {entry.suffix}
                              </em>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : null}

          {activeTab === 'POINTS' ? (
            <section className="match-report-section" aria-label="Victory point breakdown">
              <header className="match-report-section__heading">
                <div>
                  <small>VICTORY POINTS</small>
                  <h4>How every point was earned</h4>
                </div>
                <span>{state.config.victoryTarget} VP target</span>
              </header>
              <div className="match-report-point-players">
                {rankedPlayerIds.map((playerId) => {
                  const player = state.players[playerId]!;
                  const score = calculateScoreBreakdown(state, playerId);
                  const sources = pointSources(state, playerId, score);
                  return (
                    <article
                      key={playerId}
                      className={`match-report-point-player ${playerId === state.winnerId ? 'is-winner' : ''}`}
                      style={playerStyle(state, playerId)}
                      aria-label={`${player.name} point breakdown`}
                    >
                      <header>
                        <PlayerAvatar playerName={player.name} avatarId={player.avatarId} />
                        <div>
                          <strong>{player.name}</strong>
                          <small>
                            {playerId === state.winnerId ? 'Match winner' : 'Final score'}
                          </small>
                        </div>
                        <b>{score.total} VP</b>
                      </header>
                      {sources.length === 0 ? (
                        <p className="match-report-empty">No victory points were scored.</p>
                      ) : (
                        <ul>
                          {sources.map((source) => (
                            <li key={source.id}>
                              <i aria-hidden="true">{source.icon}</i>
                              <div>
                                <strong>{source.label}</strong>
                                <small>{source.detail}</small>
                              </div>
                              <b>+{source.points} VP</b>
                            </li>
                          ))}
                        </ul>
                      )}
                      <footer>
                        <span>Total accounted points</span>
                        <strong>{score.total} VP</strong>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {activeTab === 'RESOURCES' ? (
            <>
              <section
                className="match-report-stat-grid match-report-stat-grid--resource"
                aria-label="Resource totals"
              >
                <StatTile icon="♨" value={totalProduced} label="Produced by tiles" />
                <StatTile
                  icon="↑"
                  value={Object.values(statistics.players).reduce(
                    (total, player) => total + incomingTotal(player),
                    0,
                  )}
                  label="Total inflow"
                />
                <StatTile
                  icon="↓"
                  value={Object.values(statistics.players).reduce(
                    (total, player) => total + outgoingTotal(player),
                    0,
                  )}
                  label="Total outflow"
                />
                <StatTile
                  icon="☗"
                  value={Object.values(statistics.players).reduce(
                    (total, player) => total + resourceStatisticTotal(player.stolen),
                    0,
                  )}
                  label="Cards stolen"
                />
              </section>
              <section className="match-report-section">
                <header className="match-report-section__heading">
                  <div>
                    <small>RESOURCE ECONOMY</small>
                    <h4>Every card in and out</h4>
                  </div>
                  <span className="match-report-flow-key">
                    <i /> gained <b /> lost
                  </span>
                </header>
                <div className="match-report-resource-players">
                  {rankedPlayerIds.map((playerId) => {
                    const player = state.players[playerId]!;
                    const playerStatistics = statistics.players[playerId]!;
                    const incoming = incomingTotal(playerStatistics);
                    const outgoing = outgoingTotal(playerStatistics);
                    return (
                      <article
                        key={playerId}
                        className="match-report-resource-player"
                        style={playerStyle(state, playerId)}
                      >
                        <header>
                          <PlayerAvatar playerName={player.name} avatarId={player.avatarId} />
                          <div>
                            <strong>{player.name}</strong>
                            <small>
                              {incoming - outgoing >= 0 ? '+' : ''}
                              {incoming - outgoing} net cards
                            </small>
                          </div>
                          <span>
                            <b>{incoming}</b> in · <em>{outgoing}</em> out
                          </span>
                        </header>
                        <div className="match-report-resource-metrics">
                          <span>
                            <small>Produced</small>
                            <strong>{resourceStatisticTotal(playerStatistics.produced)}</strong>
                          </span>
                          <span>
                            <small>Other gains</small>
                            <strong>{resourceStatisticTotal(playerStatistics.gained)}</strong>
                          </span>
                          <span>
                            <small>Spent</small>
                            <strong>{resourceStatisticTotal(playerStatistics.spent)}</strong>
                          </span>
                          <span>
                            <small>Discarded</small>
                            <strong>{resourceStatisticTotal(playerStatistics.discarded)}</strong>
                          </span>
                          <span>
                            <small>Trade</small>
                            <strong>
                              {resourceStatisticTotal(playerStatistics.tradedOut)} ⇄{' '}
                              {resourceStatisticTotal(playerStatistics.tradedIn)}
                            </strong>
                          </span>
                          <span>
                            <small>Stolen</small>
                            <strong>
                              {resourceStatisticTotal(playerStatistics.stolen)} /{' '}
                              {resourceStatisticTotal(playerStatistics.stolenFrom)}
                            </strong>
                          </span>
                          <span>
                            <small>Forced loss</small>
                            <strong>{resourceStatisticTotal(playerStatistics.lost)}</strong>
                          </span>
                        </div>
                        <div className="match-report-goods">
                          {HAND_GOODS.map((good) => {
                            const goodIncoming =
                              bundleAmount(playerStatistics.produced, good.id) +
                              bundleAmount(playerStatistics.gained, good.id) +
                              bundleAmount(playerStatistics.tradedIn, good.id) +
                              bundleAmount(playerStatistics.stolen, good.id);
                            const goodOutgoing =
                              bundleAmount(playerStatistics.spent, good.id) +
                              bundleAmount(playerStatistics.discarded, good.id) +
                              bundleAmount(playerStatistics.tradedOut, good.id) +
                              bundleAmount(playerStatistics.stolenFrom, good.id) +
                              bundleAmount(playerStatistics.lost, good.id);
                            if (goodIncoming === 0 && goodOutgoing === 0) return null;
                            return (
                              <div
                                key={good.id}
                                className="match-report-good"
                                title={`${good.displayName}: ${goodIncoming} gained, ${goodOutgoing} lost`}
                              >
                                <ResourceArtwork resourceId={good.id} />
                                <small>{good.displayName}</small>
                                <span>
                                  <b>+{goodIncoming}</b>
                                  <em>−{goodOutgoing}</em>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}

          {activeTab === 'DICE' ? (
            <div className="match-report-dice-layout">
              <section className="match-report-section match-report-dice-chart-section">
                <header className="match-report-section__heading">
                  <div>
                    <small>DICE DISTRIBUTION</small>
                    <h4>How the table rolled</h4>
                  </div>
                  <span>
                    {statistics.dice.rolls === 0
                      ? 'No rolls recorded'
                      : `${(statistics.dice.pips / statistics.dice.rolls).toFixed(1)} average`}
                  </span>
                </header>
                <div className="match-report-dice-chart" aria-label="Dice total frequency chart">
                  {Array.from({ length: 11 }, (_, index) => String(index + 2)).map((total) => {
                    const count = statistics.dice.totals[total] ?? 0;
                    return (
                      <div key={total} className={total === '7' ? 'is-seven' : ''}>
                        <strong>{count}</strong>
                        <span>
                          <i style={{ height: `${(count / maximumRollFrequency) * 100}%` }} />
                        </span>
                        <b>{total}</b>
                      </div>
                    );
                  })}
                </div>
                <div className="match-report-dice-summary">
                  <StatTile icon="⚄" value={statistics.dice.rolls} label="Total rolls" />
                  <StatTile
                    icon="♜"
                    value={mostRolled?.[1] === 0 ? '—' : (mostRolled?.[0] ?? '—')}
                    label="Most common"
                  />
                  <StatTile icon="⚀⚀" value={statistics.dice.doubles} label="Doubles" />
                  <StatTile icon="●" value={statistics.dice.sevens} label="Sevens" />
                </div>
              </section>

              {state.kn === null ? null : (
                <section className="match-report-section">
                  <header className="match-report-section__heading">
                    <div>
                      <small>EVENT DIE</small>
                      <h4>City & Knights events</h4>
                    </div>
                  </header>
                  <div className="match-report-event-faces">
                    <span className="is-barbarian">
                      <i>☠</i>
                      <small>Barbarian</small>
                      <strong>{statistics.dice.eventFaces.BARBARIAN}</strong>
                    </span>
                    <span className="is-science">
                      <i>⚙</i>
                      <small>Science</small>
                      <strong>{statistics.dice.eventFaces.SCIENCE}</strong>
                    </span>
                    <span className="is-trade">
                      <i>⇄</i>
                      <small>Trade</small>
                      <strong>{statistics.dice.eventFaces.TRADE}</strong>
                    </span>
                    <span className="is-politics">
                      <i>♜</i>
                      <small>Politics</small>
                      <strong>{statistics.dice.eventFaces.POLITICS}</strong>
                    </span>
                  </div>
                </section>
              )}

              <section className="match-report-section">
                <header className="match-report-section__heading">
                  <div>
                    <small>PLAYER LUCK</small>
                    <h4>Rolls by player</h4>
                  </div>
                </header>
                <div className="match-report-table-wrap">
                  <table className="match-report-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Rolls</th>
                        <th>Average</th>
                        <th>Doubles</th>
                        <th>Sevens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedPlayerIds.map((playerId) => {
                        const player = state.players[playerId]!;
                        const playerStatistics = statistics.players[playerId]!;
                        return (
                          <tr key={playerId} style={playerStyle(state, playerId)}>
                            <th>
                              <i />
                              <PlayerAvatar playerName={player.name} avatarId={player.avatarId} />
                              <span>{player.name}</span>
                            </th>
                            <td>{playerStatistics.diceRolls}</td>
                            <td>
                              {playerStatistics.diceRolls === 0
                                ? '—'
                                : (playerStatistics.dicePips / playerStatistics.diceRolls).toFixed(
                                    1,
                                  )}
                            </td>
                            <td>{playerStatistics.doublesRolled}</td>
                            <td>{playerStatistics.sevensRolled}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === 'ACTIVITY' ? (
            <div className="match-report-activity-layout">
              <section className="match-report-section">
                <header className="match-report-section__heading">
                  <div>
                    <small>PROGRESS CARDS</small>
                    <h4>Deck activity</h4>
                  </div>
                  <span>{totalProgressPlayed} played</span>
                </header>
                <div className="match-report-table-wrap">
                  <table className="match-report-table match-report-progress-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Drawn</th>
                        <th>Played</th>
                        <th>Discarded</th>
                        <th>Stole</th>
                        <th>Lost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedPlayerIds.map((playerId) => {
                        const player = state.players[playerId]!;
                        const playerStatistics = statistics.players[playerId]!;
                        return (
                          <tr key={playerId} style={playerStyle(state, playerId)}>
                            <th>
                              <i />
                              <PlayerAvatar playerName={player.name} avatarId={player.avatarId} />
                              <span>{player.name}</span>
                            </th>
                            <td>{playerStatistics.progressCardsDrawn}</td>
                            <td>{playerStatistics.progressCardsPlayed}</td>
                            <td>{playerStatistics.progressCardsDiscarded}</td>
                            <td>{playerStatistics.progressCardsStolen}</td>
                            <td>{playerStatistics.progressCardsLost}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="match-report-progress-families">
                  {rankedPlayerIds.map((playerId) => {
                    const player = state.players[playerId]!;
                    const playerStatistics = statistics.players[playerId]!;
                    return (
                      <article key={playerId} style={playerStyle(state, playerId)}>
                        <strong>{player.name}</strong>
                        <div>
                          {PROGRESS_FAMILIES.filter((family) =>
                            family.id === 'CLASSIC' ? state.kn === null : state.kn !== null,
                          ).map((family) => (
                            <span key={family.id} className={`is-${family.id.toLocaleLowerCase()}`}>
                              <small>{family.label}</small>
                              <b>{playerStatistics.progressPlayedByFamily[family.id]}</b>
                              <em>
                                played / {playerStatistics.progressDrawnByFamily[family.id]} drawn
                              </em>
                            </span>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="match-report-section">
                <header className="match-report-section__heading">
                  <div>
                    <small>BUILDING & ACTIONS</small>
                    <h4>What everyone accomplished</h4>
                  </div>
                </header>
                <div className="match-report-table-wrap">
                  <table className="match-report-table match-report-actions-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th title="Roads built">Roads</th>
                        <th title="Houses built">Houses</th>
                        <th title="Cities built">Cities</th>
                        {state.kn === null ? null : (
                          <>
                            <th>Knights</th>
                            <th>Walls</th>
                            <th>Upgrades</th>
                          </>
                        )}
                        <th>Trades</th>
                        <th>Robber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedPlayerIds.map((playerId) => {
                        const player = state.players[playerId]!;
                        const playerStatistics = statistics.players[playerId]!;
                        return (
                          <tr key={playerId} style={playerStyle(state, playerId)}>
                            <th>
                              <i />
                              <PlayerAvatar playerName={player.name} avatarId={player.avatarId} />
                              <span>{player.name}</span>
                            </th>
                            <td>{playerStatistics.roadsBuilt}</td>
                            <td>{playerStatistics.housesBuilt}</td>
                            <td>{playerStatistics.citiesBuilt}</td>
                            {state.kn === null ? null : (
                              <>
                                <td>
                                  {playerStatistics.knightsBuilt}{' '}
                                  <small>({playerStatistics.knightsActivated} active)</small>
                                </td>
                                <td>{playerStatistics.wallsBuilt}</td>
                                <td>{playerStatistics.improvementsBought}</td>
                              </>
                            )}
                            <td>{playerStatistics.bankTrades + playerStatistics.playerTrades}</td>
                            <td>{playerStatistics.robberMoves}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="match-report-player-feats">
                  {rankedPlayerIds.map((playerId) => {
                    const player = state.players[playerId]!;
                    const playerStatistics = statistics.players[playerId]!;
                    const feats = [
                      { label: 'Turns taken', value: playerStatistics.turnsTaken, icon: '↻' },
                      {
                        label: 'Longest road claims',
                        value: playerStatistics.longestRoadClaims,
                        icon: '═',
                      },
                      {
                        label: 'Knight power claims',
                        value: playerStatistics.largestForceClaims,
                        icon: '♞',
                      },
                      { label: 'Cities lost', value: playerStatistics.citiesLost, icon: '⌂' },
                      { label: 'Defender wins', value: playerStatistics.defenderWins, icon: '⚔' },
                      {
                        label: 'Metropolis claims',
                        value: playerStatistics.metropolisesClaimed,
                        icon: '♛',
                      },
                      {
                        label: 'Knight upgrades',
                        value: playerStatistics.knightsUpgraded,
                        icon: '⬆',
                      },
                      {
                        label: 'Knight moves',
                        value: playerStatistics.knightsMoved,
                        icon: '➜',
                      },
                      {
                        label: 'Rivals displaced',
                        value: playerStatistics.knightsDisplaced,
                        icon: '⚑',
                      },
                      { label: 'Knights lost', value: playerStatistics.knightsLost, icon: '✕' },
                      { label: 'Perks unlocked', value: playerStatistics.perksUnlocked, icon: '✦' },
                      {
                        label: 'Merchant moves',
                        value: playerStatistics.merchantMoves,
                        icon: '⚓',
                      },
                      {
                        label: 'Tiles reclaimed',
                        value: playerStatistics.terrainsReclaimed,
                        icon: '⬡',
                      },
                    ].filter((feat) => feat.value > 0);
                    return (
                      <article key={playerId} style={playerStyle(state, playerId)}>
                        <header>
                          <PlayerAvatar playerName={player.name} avatarId={player.avatarId} />
                          <strong>{player.name}</strong>
                        </header>
                        <div>
                          {feats.length === 0 ? (
                            <small>No special milestones recorded</small>
                          ) : (
                            feats.map((feat) => (
                              <span key={feat.label} title={feat.label}>
                                <i aria-hidden="true">{feat.icon}</i>
                                <b>{feat.value}</b>
                                <small>{feat.label}</small>
                              </span>
                            ))
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {state.kn === null ? null : (
                  <div className="match-report-kn-summary">
                    <span>
                      <i>⚔</i>
                      <strong>{statistics.barbarianAttacks}</strong>
                      <small>Barbarian attacks</small>
                    </span>
                    <span>
                      <i>🛡</i>
                      <strong>{statistics.barbarianDefenses}</strong>
                      <small>Successful defenses</small>
                    </span>
                    <span>
                      <i>⟳</i>
                      <strong>{statistics.inventorSwaps}</strong>
                      <small>Madness swaps</small>
                    </span>
                    <span>
                      <i>♛</i>
                      <strong>
                        {Object.values(statistics.players).reduce(
                          (total, player) => total + player.metropolisesClaimed,
                          0,
                        )}
                      </strong>
                      <small>Metropolis claims</small>
                    </span>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>

        {rematchError === null ? null : (
          <p className="modal-error" role="alert">
            {rematchError}
          </p>
        )}
        <footer className="victory-actions">
          <Button data-modal-autofocus variant="primary" onClick={onRematch}>
            Rematch · new board
          </Button>
          <Button variant="secondary" onClick={onLobby}>
            Return to lobby
          </Button>
          <Button variant="ghost" onClick={onMenu}>
            Main menu
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
