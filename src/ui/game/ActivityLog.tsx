import { useEffect, useMemo, useRef, type CSSProperties } from 'react';

import { PROGRESS_CARDS } from '../../engine/content/progress-cards';
import { PLAYER_COLORS } from '../../engine/content/colors';
import { HAND_GOODS } from '../../engine/content/commodities';
import { getKNProgressCardDefinition } from '../../engine/content/kn-progress-cards';
import type {
  KNProgressFamily,
  ProgressCardDefinition,
  ResourceBundle,
} from '../../engine/content/types';
import type { GameEvent } from '../../engine/core/events';
import type { GameState, PlayerState } from '../../engine/core/game-state';
import { resourceGlyph } from './game-icons';
import { ProgressCardArtwork } from './ProgressCardArtwork';

interface ActivityLogProps {
  readonly events: readonly GameEvent[];
  readonly state: GameState;
}

interface ActivityEntry {
  readonly icon: string;
  readonly message: string;
  readonly tone?: 'accent' | 'danger' | 'muted';
  readonly dice?: readonly [number, number];
  readonly redFirstDie?: boolean;
  readonly eventDie?: 'BARBARIAN' | 'SCIENCE' | 'TRADE' | 'POLITICS';
  readonly resources?: ResourceBundle;
  readonly secondaryResources?: ResourceBundle;
  readonly piece?: 'ROAD' | 'HOUSE' | 'CITY' | 'PROGRESS' | 'ROBBER';
  readonly pieceColor?: string;
  readonly progressCard?: ProgressCardDefinition;
  readonly progressFamily?: KNProgressFamily;
  readonly improvementTrack?: KNProgressFamily;
}

const ACTIVITY_PIP_POSITIONS: Readonly<Record<number, readonly number[]>> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function ActivityResourceCards({ resources }: { readonly resources: ResourceBundle }) {
  return (
    <span className="activity-resource-cards" aria-hidden="true">
      {HAND_GOODS.flatMap((resource) => {
        const amount = resources[resource.id] ?? 0;
        return Array.from({ length: amount }, (_, index) => (
          <span
            key={`${resource.id}-${index}`}
            className={`activity-resource-card activity-resource-card--${resource.iconKey}`}
            style={{ '--activity-resource-color': resource.color } as CSSProperties}
          >
            {resourceGlyph(resource.id)}
          </span>
        ));
      })}
    </span>
  );
}

function ActivityVisuals({ entry }: { readonly entry: ActivityEntry }) {
  if (
    entry.dice === undefined &&
    entry.eventDie === undefined &&
    entry.resources === undefined &&
    entry.secondaryResources === undefined &&
    entry.piece === undefined &&
    entry.progressCard === undefined &&
    entry.progressFamily === undefined &&
    entry.improvementTrack === undefined
  ) {
    return null;
  }

  return (
    <span className="activity-log__visuals" aria-hidden="true">
      {entry.dice?.map((die, index) => (
        <span
          key={index}
          className={`activity-die ${entry.redFirstDie && index === 0 ? 'activity-die--red' : ''}`}
        >
          {Array.from({ length: 9 }, (_, position) => (
            <i
              key={position}
              className={ACTIVITY_PIP_POSITIONS[die]?.includes(position) ? 'is-visible' : ''}
            />
          ))}
        </span>
      ))}
      {entry.eventDie === undefined ? null : (
        <span
          className={`activity-die activity-event-die activity-event-die--${entry.eventDie.toLocaleLowerCase()}`}
        >
          <strong>
            {entry.eventDie === 'BARBARIAN'
              ? '⛵'
              : entry.eventDie === 'SCIENCE'
                ? '✎'
                : entry.eventDie === 'TRADE'
                  ? '⚖'
                  : '♛'}
          </strong>
          <small>{entry.eventDie === 'BARBARIAN' ? 'SHIP' : entry.eventDie}</small>
        </span>
      )}
      {entry.progressCard === undefined ? null : (
        <ProgressCardArtwork definition={entry.progressCard} compact />
      )}
      {entry.progressFamily === undefined ? null : (
        <span
          className={`activity-kn-progress activity-kn-progress--${entry.progressFamily.toLocaleLowerCase()}`}
        >
          {entry.progressFamily === 'SCIENCE' ? '⚗' : entry.progressFamily === 'TRADE' ? '⚖' : '♜'}
        </span>
      )}
      {entry.improvementTrack === undefined ? null : (
        <span
          className={`activity-improvement-chip activity-improvement-chip--${entry.improvementTrack.toLocaleLowerCase()}`}
        />
      )}
      {entry.piece === undefined ? null : (
        <span
          className={`activity-piece activity-piece--${entry.piece.toLowerCase()}`}
          style={{ '--activity-piece-color': entry.pieceColor ?? '#9ca6a1' } as CSSProperties}
        >
          {entry.piece === 'ROAD' ? (
            <i className="activity-piece__road" />
          ) : entry.piece === 'HOUSE' ? (
            <i className="activity-piece__house">
              <i />
            </i>
          ) : entry.piece === 'CITY' ? (
            <i className="activity-piece__city">
              <i />
              <i />
              <i />
            </i>
          ) : (
            <i className="activity-piece__symbol">{entry.piece === 'PROGRESS' ? '✦' : '♟'}</i>
          )}
        </span>
      )}
      {entry.resources === undefined ? null : <ActivityResourceCards resources={entry.resources} />}
      {entry.secondaryResources === undefined ? null : (
        <>
          <span className="activity-resource-arrow">→</span>
          <ActivityResourceCards resources={entry.secondaryResources} />
        </>
      )}
    </span>
  );
}

function resourceName(resourceId: string): string {
  return HAND_GOODS.find((resource) => resource.id === resourceId)?.displayName ?? resourceId;
}

function bundleLabel(resources: ResourceBundle): string {
  const parts = HAND_GOODS.flatMap((resource) => {
    const amount = resources[resource.id] ?? 0;
    return amount > 0 ? [`${amount} ${resource.displayName}`] : [];
  });
  return parts.length === 0 ? 'no resources' : parts.join(' · ');
}

function eventEntries(event: GameEvent, state: GameState): readonly ActivityEntry[] {
  const playerName = (playerId: PlayerState['id']) => state.players[playerId]?.name ?? 'A player';
  const playerColor = (playerId: PlayerState['id']) => {
    const colorId = state.players[playerId]?.colorId;
    return PLAYER_COLORS.find((color) => color.id === colorId)?.hex ?? '#9ca6a1';
  };

  switch (event.type) {
    case 'SETUP_STARTED':
      return [{ icon: '⌂', message: `${playerName(event.playerId)} begins placement.` }];
    case 'SETUP_PLAYER_ADVANCED':
      return [];
    case 'SETUP_COMPLETED':
      return [
        {
          icon: '◆',
          message: `Setup complete. ${playerName(event.firstPlayerId)} rolls first.`,
          tone: 'accent',
        },
      ];
    case 'BUILDING_PLACED':
      return [
        {
          icon: event.buildingType === 'MANSION' ? '▥' : '⌂',
          message: `${playerName(event.playerId)} placed a ${event.buildingType === 'MANSION' ? 'city' : event.buildingType.toLowerCase()}.`,
          piece: event.buildingType === 'MANSION' ? 'CITY' : 'HOUSE',
          pieceColor: playerColor(event.playerId),
        },
      ];
    case 'BUILDING_UPGRADED':
      return [
        {
          icon: '▥',
          message: `${playerName(event.playerId)} built a city.`,
          piece: 'CITY',
          pieceColor: playerColor(event.playerId),
        },
      ];
    case 'ROAD_BUILT':
      return [
        {
          icon: '═',
          message: `${playerName(event.playerId)} built a road.`,
          piece: 'ROAD',
          pieceColor: playerColor(event.playerId),
        },
      ];
    case 'RESOURCES_SPENT': {
      const purchase =
        event.reason === 'PROGRESS_CARD'
          ? 'a progress card'
          : event.reason === 'MANSION'
            ? 'a city'
            : `a ${event.reason.toLowerCase()}`;
      return [
        {
          icon: '−',
          message: `${playerName(event.playerId)} paid ${bundleLabel(event.resources)} for ${purchase}.`,
          tone: 'muted',
          resources: event.resources,
        },
      ];
    }
    case 'DICE_ROLLED':
      return [
        {
          icon: '⚄',
          message: `${playerName(event.playerId)} rolled ${event.dice[0]} + ${event.dice[1]} = ${event.dice[0] + event.dice[1]}.`,
          tone: 'accent',
          dice: event.dice,
        },
      ];
    case 'KN_DICE_ROLLED':
      return [
        {
          icon: event.event === 'BARBARIAN' ? '⛵' : '◆',
          message: `${playerName(event.playerId)} rolled red ${event.red} + ${event.regular} = ${event.numericTotal}; Event die: ${event.event.toLocaleLowerCase()}.`,
          tone: event.event === 'BARBARIAN' ? 'danger' : 'accent',
          dice: [event.red, event.regular],
          redFirstDie: true,
          eventDie: event.event,
        },
      ];
    case 'BARBARIAN_ADVANCED':
      return [
        {
          icon: '⛵',
          message: `Barbarians advanced to ${event.position}/${event.trackLength}.`,
          tone: 'danger',
        },
      ];
    case 'INVENTORS_MADNESS_TARGETS_SELECTED':
      return [
        {
          icon: '⌁',
          message: "Inventor's Madness marked two number tokens for the next round.",
          tone: 'accent',
        },
      ];
    case 'INVENTORS_MADNESS_SWAPPED':
      return [
        {
          icon: '⇄',
          message: "Inventor's Madness swapped the two marked number tokens.",
          tone: 'accent',
        },
      ];
    case 'TERRAIN_RECLAIMED':
      return [
        {
          icon: '♻',
          message: `${playerName(event.playerId)} played Reclamation and changed a ${resourceName(event.fromResourceId)} tile to ${resourceName(event.toResourceId)}.`,
          tone: 'accent',
          progressFamily: 'TRADE',
        },
      ];
    case 'WAR_DRUMS_MOVED': {
      const movement = event.position - event.fromPosition;
      const movementLabel =
        movement === 1 ? '1 space forward' : movement === -1 ? '1 space back' : '2 spaces back';
      return [
        {
          icon: '♫',
          message: `${playerName(event.playerId)} played War Drums and moved the barbarian fleet ${movementLabel}.`,
          tone: movement > 0 ? 'danger' : 'accent',
          progressFamily: 'POLITICS',
        },
      ];
    }
    case 'BARBARIAN_ATTACK_RESOLVED':
      return [
        {
          icon: event.defended ? '🛡' : '⚔',
          message: event.defended
            ? `The island was defended ${event.defenderStrength}–${event.barbarianStrength}.${event.defenderAwardPlayerId === null ? ' Top defenders tied.' : ` ${playerName(event.defenderAwardPlayerId)} earned a Defender point.`}`
            : `The barbarians won ${event.barbarianStrength}–${event.defenderStrength}; ${event.affectedPlayerIds.length} player${event.affectedPlayerIds.length === 1 ? '' : 's'} lost a City.`,
          tone: event.defended ? 'accent' : 'danger',
        },
      ];
    case 'CITY_DOWNGRADED':
      return [
        {
          icon: '⚔',
          message: `${playerName(event.playerId)}’s City was downgraded to a House${event.wallDestroyed ? ' and its Wall was destroyed' : ''}.`,
          tone: 'danger',
          piece: 'HOUSE',
          pieceColor: playerColor(event.playerId),
        },
      ];
    case 'RESOURCES_PRODUCED': {
      const gains = Object.entries(event.grants).flatMap(([playerId, resources]) => {
        const total = Object.values(resources).reduce<number>(
          (sum, amount) => sum + (amount ?? 0),
          0,
        );
        return total === 0
          ? []
          : [
              {
                icon: '+',
                message: `${playerName(playerId as PlayerState['id'])} received ${bundleLabel(resources)}${event.source === 'DICE' ? ` from roll ${event.rollTotal ?? '—'}` : ' during setup'}.`,
                resources,
              } satisfies ActivityEntry,
            ];
      });
      const shortages = event.unavailableResourceIds.map((resourceId) => resourceName(resourceId));
      const shortageEntries =
        shortages.length === 0
          ? []
          : [
              {
                icon: '!',
                message: `Bank shortage: ${shortages.join(', ')} production was cancelled.`,
                tone: 'danger' as const,
              },
            ];
      if (gains.length > 0) return [...gains, ...shortageEntries];
      return [
        {
          icon: '∅',
          message:
            event.source === 'DICE'
              ? `Roll ${event.rollTotal ?? '—'} produced no resources.`
              : 'Setup produced no starting resources.',
          tone: 'muted',
        },
        ...shortageEntries,
      ];
    }
    case 'RESOURCES_DISCARDED':
      return [
        {
          icon: '−',
          message: `${playerName(event.playerId)} discarded ${bundleLabel(event.resources)}.`,
          tone: 'danger',
          resources: event.resources,
        },
      ];
    case 'ROBBER_MOVED':
      return [
        {
          icon: '♟',
          message: `${playerName(event.playerId)} moved the robber.`,
          tone: 'danger',
          piece: 'ROBBER',
        },
      ];
    case 'ROBBER_SEQUENCE_STARTED':
      return [
        {
          icon: '7',
          message:
            event.discardPlayerIds.length === 0
              ? event.robberUnlocked === false
                ? `${playerName(event.playerId)} rolled a 7. The robber remains locked until the first barbarian attack.`
                : `${playerName(event.playerId)} rolled a 7. Move the robber.`
              : `${playerName(event.playerId)} rolled a 7. ${event.discardPlayerIds.length} player${event.discardPlayerIds.length === 1 ? '' : 's'} must discard.`,
          tone: 'danger',
        },
      ];
    case 'RESOURCE_STOLEN':
      return [
        {
          icon: '♟',
          message: `${playerName(event.playerId)} stole 1 ${resourceName(event.resourceId)} from ${playerName(event.targetPlayerId)}.`,
          tone: 'danger',
          resources: { [event.resourceId]: 1 },
        },
      ];
    case 'TRADE_OFFERED': {
      const trade = state.tradeOffers[event.tradeId];
      const recipients =
        event.recipientIds.length === 1
          ? playerName(event.recipientIds[0]!)
          : `${event.recipientIds.length} opponents`;
      const terms =
        trade === undefined
          ? ''
          : `: ${bundleLabel(trade.offered)} for ${bundleLabel(trade.requested)}`;
      return [
        {
          icon: '⇄',
          message: `${playerName(event.playerId)} offered ${recipients} a trade${terms}.`,
          ...(trade === undefined
            ? {}
            : { resources: trade.offered, secondaryResources: trade.requested }),
        },
      ];
    }
    case 'TRADE_ACCEPTED':
      return [
        {
          icon: '✓',
          message: `${playerName(event.recipientId)} accepted ${playerName(event.playerId)}’s trade offer.`,
          tone: 'accent',
        },
      ];
    case 'TRADE_REJECTED':
      return [
        {
          icon: '×',
          message: `${playerName(event.recipientId)} rejected ${playerName(event.playerId)}’s trade.`,
          tone: 'muted',
        },
      ];
    case 'TRADE_CANCELLED':
      return [
        {
          icon: '×',
          message: `${playerName(event.playerId)}’s open trade was cancelled.`,
          tone: 'muted',
        },
      ];
    case 'TRADE_EXPIRED':
      return [
        {
          icon: '⌛',
          message: `${playerName(event.playerId)}’s trade offer expired.`,
          tone: 'muted',
        },
      ];
    case 'TRADE_COMPLETED':
      return [
        {
          icon: '⇄',
          message:
            event.recipientId === null
              ? `${playerName(event.playerId)} traded ${bundleLabel(event.offered)} with the bank for ${bundleLabel(event.requested)}.`
              : `${playerName(event.playerId)} gave ${bundleLabel(event.offered)} to ${playerName(event.recipientId)} for ${bundleLabel(event.requested)}.`,
          tone: 'accent',
          resources: event.offered,
          secondaryResources: event.requested,
        },
      ];
    case 'COMMERCIAL_HARBOR_EXCHANGED':
      return [
        {
          icon: '⚓',
          message: `${playerName(event.playerId)} gave 1 ${resourceName(event.offeredResourceId)} to ${playerName(event.targetPlayerId)} for 1 ${resourceName(event.receivedCommodityId)}.`,
          tone: 'accent',
          resources: { [event.offeredResourceId]: 1 },
          secondaryResources: { [event.receivedCommodityId]: 1 },
        },
      ];
    case 'WEDDING_CARDS_TRANSFERRED':
      return [
        {
          icon: '◇',
          message: `${playerName(event.targetPlayerId)} gave ${bundleLabel(event.resources)} to ${playerName(event.playerId)} for Wedding.`,
          tone: 'accent',
          resources: event.resources,
        },
      ];
    case 'PROGRESS_CARD_BOUGHT': {
      return [
        {
          icon: '✦',
          message: `${playerName(event.playerId)} bought a progress card.`,
          tone: 'accent',
          piece: 'PROGRESS',
        },
      ];
    }
    case 'KN_PROGRESS_CARD_DRAWN':
      return [
        {
          icon: '✦',
          message: event.revealed
            ? `${playerName(event.playerId)} revealed a victory-point Progress Card.`
            : `${playerName(event.playerId)} drew a Progress Card.`,
          tone: 'accent',
          progressFamily: event.family,
        },
      ];
    case 'KN_PROGRESS_CARD_DISCARDED':
      return [
        {
          icon: '−',
          message: `${playerName(event.playerId)} returned a Progress Card to the ${event.family.toLocaleLowerCase()} deck.`,
          tone: 'muted',
          progressFamily: event.family,
        },
      ];
    case 'KN_PROGRESS_CARD_PLAYED': {
      const definition = getKNProgressCardDefinition(event.cardDefinitionId);
      if (definition?.effect === 'WAR_DRUMS' || definition?.effect === 'RECLAMATION') return [];
      return [
        {
          icon: '✦',
          message: `${playerName(event.playerId)} played ${definition?.displayName ?? 'a Progress Card'}.`,
          tone: 'accent',
          ...(definition === undefined
            ? { piece: 'PROGRESS' as const }
            : { progressFamily: definition.family }),
        },
      ];
    }
    case 'KN_PROGRESS_CARD_RESOLVED': {
      const definition = getKNProgressCardDefinition(event.cardDefinitionId);
      if (definition?.effect === 'WAR_DRUMS' || definition?.effect === 'RECLAMATION') return [];
      const transferTotal = Object.values(event.transfers ?? {}).reduce(
        (total, amount) => total + amount,
        0,
      );
      const collectedResources =
        event.resources ??
        (event.resourceId === undefined || transferTotal === 0
          ? undefined
          : { [event.resourceId]: transferTotal });
      return [
        {
          icon: '✓',
          message: `${playerName(event.playerId)} resolved ${definition?.displayName ?? 'a Progress Card'}${event.resourceId === undefined ? '' : ` choosing ${resourceName(event.resourceId)}`}.`,
          tone: 'accent',
          ...(collectedResources === undefined ? {} : { resources: collectedResources }),
        },
      ];
    }
    case 'KNIGHT_BUILT':
      return [
        {
          icon: '♞',
          message: `${playerName(event.playerId)} placed a level ${event.level} Knight.`,
          pieceColor: playerColor(event.playerId),
        },
      ];
    case 'KNIGHT_ACTIVATED':
      return [
        { icon: '♞', message: `${playerName(event.playerId)} activated a Knight.`, tone: 'accent' },
      ];
    case 'KNIGHT_UPGRADED':
      return [
        {
          icon: '♞',
          message: `${playerName(event.playerId)} upgraded a Knight to level ${event.level}.`,
          tone: 'accent',
        },
      ];
    case 'KNIGHT_MOVED':
      return [{ icon: '♞', message: `${playerName(event.playerId)} moved a Knight.` }];
    case 'KNIGHT_DISPLACED':
      return [
        {
          icon: '⚔',
          message: `${playerName(event.playerId)} displaced ${playerName(event.targetPlayerId)}’s Knight.`,
          tone: 'danger',
        },
      ];
    case 'KNIGHT_REMOVED':
      return [
        { icon: '−', message: `${playerName(event.playerId)} removed a Knight.`, tone: 'danger' },
      ];
    case 'WALL_BUILT':
      return [
        {
          icon: '▥',
          message: `${playerName(event.playerId)} built a City Wall.`,
          tone: 'accent',
          pieceColor: playerColor(event.playerId),
        },
      ];
    case 'IMPROVEMENT_BOUGHT':
      return [
        {
          icon: '◆',
          message: `${playerName(event.playerId)} upgraded ${event.track[0]}${event.track.slice(1).toLocaleLowerCase()} to level ${event.level}.`,
          tone: 'accent',
          improvementTrack: event.track,
        },
      ];
    case 'CITY_IMPROVEMENT_PERK_UNLOCKED': {
      const perkName =
        event.perk === 'AQUEDUCT'
          ? 'Aqueduct'
          : event.perk === 'TRADING_HOUSE'
            ? 'Trading House'
            : 'Fortress';
      return [
        {
          icon: '✦',
          message: `${playerName(event.playerId)} unlocked ${perkName} from ${event.track[0]}${event.track.slice(1).toLocaleLowerCase()} level 3!`,
          tone: 'accent',
          improvementTrack: event.track,
        },
      ];
    }
    case 'METROPOLIS_CHANGED':
      return [
        {
          icon: '♜',
          message: `${playerName(event.playerId)} claimed the ${event.track.toLocaleLowerCase()} Metropolis.`,
          tone: 'accent',
        },
      ];
    case 'MERCHANT_MOVED':
      return [
        {
          icon: '⚖',
          message: `${playerName(event.playerId)} placed the Merchant on ${resourceName(event.resourceId)}.`,
          tone: 'accent',
        },
      ];
    case 'AQUEDUCT_RESOURCE_CHOSEN':
      return [
        {
          icon: '+',
          message: `${playerName(event.playerId)} chose 1 ${resourceName(event.resourceId)} with Aqueduct.`,
          resources: { [event.resourceId]: 1 },
        },
      ];
    case 'PROGRESS_CARD_PLAYED': {
      const instance = state.progressCards[event.cardInstanceId];
      const card = PROGRESS_CARDS.find((candidate) => candidate.id === instance?.definitionId);
      return [
        {
          icon: '✦',
          message: `${playerName(event.playerId)} played ${card?.displayName ?? 'a progress card'}.`,
          ...(card === undefined ? { piece: 'PROGRESS' as const } : { progressCard: card }),
        },
      ];
    }
    case 'PROGRESS_CARD_RESOLVED': {
      const card = PROGRESS_CARDS.find((candidate) => candidate.id === event.cardDefinitionId);
      if (card?.effect === 'TAKE_TWO_RESOURCES' && event.resources !== undefined) {
        return [
          {
            icon: '✓',
            message: `${playerName(event.playerId)} chose ${bundleLabel(event.resources)} with ${card.displayName}.`,
            tone: 'accent',
            resources: event.resources,
          },
        ];
      }
      if (card?.effect === 'MONOPOLY' && event.resourceId !== undefined) {
        return [
          {
            icon: '✓',
            message: `${playerName(event.playerId)} chose ${resourceName(event.resourceId)} for ${card.displayName} and collected ${event.amount ?? 0} card${event.amount === 1 ? '' : 's'}.`,
            tone: 'accent',
            ...(event.amount === null || event.amount === 0
              ? {}
              : { resources: { [event.resourceId]: event.amount } }),
          },
        ];
      }
      return [
        {
          icon: '✓',
          message: `${playerName(event.playerId)} resolved ${card?.displayName ?? 'a progress card'}${event.amount === null ? '' : ` for ${event.amount} resource${event.amount === 1 ? '' : 's'}`}.`,
          tone: 'accent',
        },
      ];
    }
    case 'LONGEST_ROAD_CHANGED':
      return [
        {
          icon: '═',
          message:
            event.playerId === null
              ? 'Longest bridge is unclaimed.'
              : `${playerName(event.playerId)} claimed Longest Bridge.`,
          tone: 'accent',
        },
      ];
    case 'LARGEST_FORCE_CHANGED':
      return [
        {
          icon: '♞',
          message:
            event.playerId === null
              ? 'Largest Force is unclaimed.'
              : `${playerName(event.playerId)} claimed Largest Force.`,
          tone: 'accent',
        },
      ];
    case 'SCORE_CHANGED':
      return [
        {
          icon: '★',
          message: `${playerName(event.playerId)} now has ${event.score} point${event.score === 1 ? '' : 's'}.`,
          tone: 'accent',
        },
      ];
    case 'TURN_ENDED':
      return [];
    case 'TURN_STARTED':
      return [
        {
          icon: '›',
          message: `${playerName(event.playerId)} starts turn ${event.turnNumber + 1}.`,
          tone: 'muted',
        },
      ];
    case 'GAME_WON':
      return [
        {
          icon: '★',
          message: `${playerName(event.playerId)} won with ${event.score} points!`,
          tone: 'accent',
        },
      ];
  }
}

export function ActivityLog({ events, state }: ActivityLogProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const entries = useMemo(
    () => events.flatMap((event) => eventEntries(event, state)),
    [events, state],
  );

  useEffect(() => {
    const list = listRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [entries.length]);

  return (
    <section className="activity-log" aria-labelledby="activity-log-title">
      <header className="rail-section-heading">
        <div>
          <span className="eyebrow">Live match</span>
          <h2 id="activity-log-title">Game log</h2>
        </div>
        <span className="live-indicator">Live</span>
      </header>
      <ol ref={listRef} role="log" aria-live="polite">
        {entries.length === 0 ? (
          <li className="activity-log__empty">
            <span aria-hidden="true">◆</span>
            <p>Match activity will appear here.</p>
          </li>
        ) : (
          entries.map((entry, index) => (
            <li
              key={`${index}-${entry.message}`}
              className={entry.tone === undefined ? '' : `activity-log__entry--${entry.tone}`}
            >
              <span aria-hidden="true">{entry.icon}</span>
              <p>
                <span className="activity-log__message-copy">{entry.message}</span>
                <ActivityVisuals entry={entry} />
              </p>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
