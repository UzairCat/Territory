import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
} from 'react';

import { HAND_GOODS, isCommodityId } from '../../engine/content/commodities';
import {
  getKNProgressCardDefinition,
  type KNProgressCardDefinition,
} from '../../engine/content/kn-progress-cards';
import type { ProgressCardDefinition } from '../../engine/content/types';
import type { ResourceBundle } from '../../engine/content/types';
import type { GameState, PlayerState, ProgressCardInstance } from '../../engine/core/game-state';
import type { CardInstanceId, ResourceId } from '../../engine/core/ids';
import {
  getProgressCardDefinition,
  getProgressCardPlayAvailability,
} from '../../engine/rules/progress-card-rules';
import { canUseCraneProgressCard } from '../../engine/rules/kn-progress-card-rules';
import { ProgressCardArtwork } from './ProgressCardArtwork';
import {
  ProgressCardTooltip,
  type ProgressCardTooltipAnchor,
  type ProgressCardTooltipTone,
} from './ProgressCardTooltip';
import { ResourceArtwork } from './ResourceArtwork';
import { KNProgressCardArtwork } from './KNProgressCardArtwork';
import { KNProgressCardTooltip } from './KNProgressCardTooltip';

interface HandTrayProps {
  readonly state: GameState;
  readonly player: PlayerState | undefined;
  readonly animateResources: boolean;
  readonly tooltipResetSignal?: string;
  readonly discardSelection?: ResourceBundle;
  readonly onSelectResourceForDiscard?: (resourceId: ResourceId) => void;
  readonly selectedHandResources?: ResourceBundle;
  readonly handResourceSelectionName?: string;
  readonly onSelectHandResource?: (resourceId: ResourceId) => void;
  readonly resourceSelectionStartsPlayerTrade?: boolean;
  readonly warningResourceId?: ResourceId | null;
  readonly warningSignal?: number;
  readonly selectedKNProgressCardIds?: readonly CardInstanceId[];
  readonly onSelectKNProgressCard?: (cardInstanceId: CardInstanceId) => void;
  readonly progressCardPlayIntentId?: CardInstanceId | null;
  readonly knProgressCardPlayIntentId?: CardInstanceId | null;
  readonly progressCardPlayErrorMessage?: string | null;
  readonly onCancelProgressCardPlay?: () => void;
  readonly onConfirmProgressCardPlay?: (cardInstanceId: CardInstanceId) => void;
  readonly onCancelKNProgressCardPlay?: () => void;
  readonly onConfirmKNProgressCardPlay?: (cardInstanceId: CardInstanceId) => void;
  readonly onPlayProgressCard: (cardInstanceId: CardInstanceId) => void;
  readonly onPlayKNProgressCard?: (cardInstanceId: CardInstanceId) => void;
}

interface OpenProgressCardTooltip {
  readonly instanceId: CardInstanceId;
  readonly definition: ProgressCardDefinition;
  readonly status: string;
  readonly statusDetail: string;
  readonly tone: ProgressCardTooltipTone;
  readonly anchor: ProgressCardTooltipAnchor;
}

interface OwnedProgressCardGroup {
  readonly definition: ProgressCardDefinition;
  readonly instances: readonly ProgressCardInstance[];
}

export function HandTray({
  state,
  player,
  animateResources,
  tooltipResetSignal = '',
  discardSelection = {},
  onSelectResourceForDiscard,
  selectedHandResources = {},
  handResourceSelectionName = 'for this choice',
  onSelectHandResource,
  resourceSelectionStartsPlayerTrade = false,
  warningResourceId = null,
  warningSignal = 0,
  selectedKNProgressCardIds = [],
  onSelectKNProgressCard,
  progressCardPlayIntentId = null,
  knProgressCardPlayIntentId = null,
  progressCardPlayErrorMessage = null,
  onCancelProgressCardPlay,
  onConfirmProgressCardPlay,
  onCancelKNProgressCardPlay,
  onConfirmKNProgressCardPlay,
  onPlayProgressCard,
  onPlayKNProgressCard = () => undefined,
}: HandTrayProps) {
  const [openTooltip, setOpenTooltip] = useState<OpenProgressCardTooltip | null>(null);
  const [openKNTooltip, setOpenKNTooltip] = useState<{
    readonly instanceId: CardInstanceId;
    readonly definition: KNProgressCardDefinition;
    readonly anchor: ProgressCardTooltipAnchor;
  } | null>(null);
  const tooltipNeedsPointerExitRef = useRef(false);
  const tooltipNeedsFocusExitRef = useRef(false);
  const previousTooltipResetSignalRef = useRef(tooltipResetSignal);
  const pinnedProgressCardIdRef = useRef<CardInstanceId | null>(progressCardPlayIntentId);
  const pinnedKNProgressCardIdRef = useRef<CardInstanceId | null>(knProgressCardPlayIntentId);

  useLayoutEffect(() => {
    pinnedProgressCardIdRef.current = progressCardPlayIntentId;
  }, [progressCardPlayIntentId]);

  useLayoutEffect(() => {
    pinnedKNProgressCardIdRef.current = knProgressCardPlayIntentId;
  }, [knProgressCardPlayIntentId]);

  useLayoutEffect(() => {
    if (previousTooltipResetSignalRef.current === tooltipResetSignal) return;
    previousTooltipResetSignalRef.current = tooltipResetSignal;
    tooltipNeedsPointerExitRef.current = true;
    tooltipNeedsFocusExitRef.current = true;
    setOpenTooltip(null);
    setOpenKNTooltip(null);
    const focusGuard = globalThis.setTimeout(() => {
      tooltipNeedsFocusExitRef.current = false;
    }, 700);
    return () => globalThis.clearTimeout(focusGuard);
  }, [tooltipResetSignal]);
  const ownedCards =
    player?.progressCardIds.flatMap((cardInstanceId) => {
      const instance = state.progressCards[cardInstanceId];
      const definition = getProgressCardDefinition(instance);
      return instance === undefined || definition === undefined ? [] : [{ instance, definition }];
    }) ?? [];
  const ownedCardGroups = [
    ...ownedCards
      .reduce((groups, card) => {
        const existing = groups.get(card.definition.id);
        if (existing === undefined) {
          groups.set(card.definition.id, {
            definition: card.definition,
            instances: [card.instance],
          });
        } else {
          groups.set(card.definition.id, {
            ...existing,
            instances: [...existing.instances, card.instance],
          });
        }
        return groups;
      }, new Map<ProgressCardDefinition['id'], OwnedProgressCardGroup>())
      .values(),
  ];
  const pendingBoardCard =
    state.pendingInteraction?.type === 'KN_SELECTION' &&
    [
      'MEDICINE_CITY',
      'SMITH_KNIGHT',
      'INVENTOR_FIRST_TOKEN',
      'INVENTOR_SECOND_TOKEN',
      'RECLAMATION_HEX',
      'RECLAMATION_RESOURCE',
      'WAR_DRUMS_POSITION',
    ].includes(state.pendingInteraction.purpose) &&
    state.pendingInteraction.sourceCardId !== undefined &&
    state.kn?.progressCards[state.pendingInteraction.sourceCardId]?.ownerId === player?.id
      ? state.pendingInteraction
      : null;
  const pendingBoardCardId = pendingBoardCard?.sourceCardId;
  const visibleKNCardIds = [
    ...(player?.knProgressCardIds ?? []),
    ...(pendingBoardCardId !== undefined && !player?.knProgressCardIds.includes(pendingBoardCardId)
      ? [pendingBoardCardId]
      : []),
  ].filter((cardId) => !selectedKNProgressCardIds.includes(cardId));
  const ownedKNCards =
    visibleKNCardIds.flatMap((cardInstanceId) => {
      const instance = state.kn?.progressCards[cardInstanceId];
      const definition =
        instance === undefined ? undefined : getKNProgressCardDefinition(instance.definitionId);
      return instance === undefined || definition === undefined ? [] : [{ instance, definition }];
    }) ?? [];
  const ownedKNCardGroups = [
    ...ownedKNCards
      .reduce((groups, card) => {
        const existing = groups.get(card.definition.id);
        groups.set(card.definition.id, {
          definition: card.definition,
          instances: [...(existing?.instances ?? []), card.instance],
        });
        return groups;
      }, new Map<KNProgressCardDefinition['id'], { definition: KNProgressCardDefinition; instances: (typeof ownedKNCards)[number]['instance'][] }>())
      .values(),
  ];
  const visibleOpenTooltip =
    openTooltip !== null &&
    ownedCards.some((card) => card.instance.instanceId === openTooltip.instanceId)
      ? openTooltip
      : null;
  const visibleOpenKNTooltip =
    openKNTooltip !== null &&
    ownedKNCards.some((card) => card.instance.instanceId === openKNTooltip.instanceId)
      ? openKNTooltip
      : null;
  const resourceSelector = onSelectHandResource ?? onSelectResourceForDiscard;
  const selectedResources =
    onSelectHandResource === undefined ? discardSelection : selectedHandResources;

  const openCardTooltip = (
    element: HTMLElement,
    card: Omit<OpenProgressCardTooltip, 'anchor'>,
    ignorePointerLatch = false,
  ) => {
    if (!ignorePointerLatch && tooltipNeedsPointerExitRef.current) return;
    if (
      pinnedKNProgressCardIdRef.current !== null ||
      (pinnedProgressCardIdRef.current !== null &&
        pinnedProgressCardIdRef.current !== card.instanceId)
    ) {
      return;
    }
    const bounds = element.getBoundingClientRect();
    setOpenTooltip({
      ...card,
      anchor: { left: bounds.left, top: bounds.top, width: bounds.width },
    });
  };

  const closeCardTooltip = (instanceId: CardInstanceId) => {
    setOpenTooltip((current) => (current?.instanceId === instanceId ? null : current));
  };

  return (
    <section
      className={`hand-tray ${animateResources ? 'hand-tray--resources-changed' : ''}`}
      data-hand-player={player?.id}
      aria-label={
        resourceSelector === undefined
          ? 'Active player resource hand'
          : `${player?.name ?? 'Player'} resource hand ${onSelectHandResource === undefined ? 'for discarding' : handResourceSelectionName}`
      }
      onScroll={() => {
        if (progressCardPlayIntentId === null) setOpenTooltip(null);
        if (knProgressCardPlayIntentId === null) setOpenKNTooltip(null);
      }}
    >
      <div className="resource-hand" aria-label="Resource cards">
        {HAND_GOODS.flatMap((resource) => {
          const ownedCount = isCommodityId(resource.id)
            ? (player?.commodities[resource.id] ?? 0)
            : (player?.resources[resource.id] ?? 0);
          const selectedCount = selectedResources[resource.id] ?? 0;
          const count = Math.max(0, ownedCount - selectedCount);
          if (count <= 0) return [];
          const visibleStackLayers = Math.min(count - 1, 5);
          const stackSpread = 0.44;
          const label = resource.id === 'livestock' ? 'Sheep' : resource.displayName;
          return [
            <article
              key={`${resource.id}-${warningResourceId === resource.id ? warningSignal : 'stable'}`}
              data-resource-card={resource.id}
              className={`resource-card-stack resource-card-stack--${resource.iconKey} resource-card-stack--layers-${visibleStackLayers} ${resourceSelector === undefined ? '' : 'resource-card-stack--discardable'} ${warningResourceId === resource.id ? 'resource-card-stack--warning' : ''}`}
              style={
                {
                  '--resource-color': resource.color,
                  '--stack-width': `${3.15 + visibleStackLayers * stackSpread}rem`,
                } as CSSProperties
              }
              role={resourceSelector === undefined ? undefined : 'button'}
              tabIndex={resourceSelector === undefined ? undefined : 0}
              aria-label={
                resourceSelector === undefined || resourceSelectionStartsPlayerTrade
                  ? `${resource.displayName}: ${count} card${count === 1 ? '' : 's'}`
                  : `Select ${resource.displayName} ${onSelectHandResource === undefined ? 'for discard' : handResourceSelectionName}. ${count} card${count === 1 ? '' : 's'} available`
              }
              title={
                resourceSelectionStartsPlayerTrade
                  ? `Select ${resource.displayName} to start a trade`
                  : undefined
              }
              onClick={() => resourceSelector?.(resource.id)}
              onKeyDown={(event) => {
                if (
                  resourceSelector !== undefined &&
                  (event.key === 'Enter' || event.key === ' ')
                ) {
                  event.preventDefault();
                  resourceSelector(resource.id);
                }
              }}
            >
              {Array.from({ length: visibleStackLayers }, (_, index) => (
                <span
                  key={index}
                  className="resource-card-stack__layer"
                  style={
                    {
                      '--stack-offset': `${(index + 1) * stackSpread}rem`,
                      '--stack-drop': `${(visibleStackLayers - index) * 0.08}rem`,
                      '--stack-turn': `${(index - (visibleStackLayers - 1) / 2) * 1.2}deg`,
                    } as CSSProperties
                  }
                  aria-hidden="true"
                />
              ))}
              <span className={`resource-card resource-card--${resource.iconKey}`}>
                <span className="resource-card__art">
                  <ResourceArtwork resourceId={resource.id} />
                </span>
                <small>{label}</small>
                <strong className="resource-card__count" aria-hidden="true">
                  {count}
                </strong>
              </span>
            </article>,
          ];
        })}
      </div>

      <span className="hand-tray__divider" aria-hidden="true" />

      <section className="progress-tray" aria-labelledby="progress-tray-title">
        <header>
          <span id="progress-tray-title">Progress</span>
        </header>
        <div className="progress-tray__cards">
          {ownedCards.length + ownedKNCards.length === 0 ? (
            <span className="progress-tray__empty">No cards</span>
          ) : (
            <>
              {ownedCardGroups.map(({ instances, definition }) => {
                const cardsWithAvailability = instances.map((instance) => ({
                  instance,
                  availability:
                    player === undefined
                      ? { canPlay: false, reason: 'No active player.' }
                      : getProgressCardPlayAvailability(state, player.id, instance.instanceId),
                }));
                const representative =
                  cardsWithAvailability.find((card) => card.availability.canPlay) ??
                  cardsWithAvailability[0];
                if (representative === undefined) return null;
                const { instance, availability } = representative;
                const boughtThisTurn = instance.purchasedTurn === state.turn.turnNumber;
                const passive = definition.effect === 'VICTORY_POINT';
                const status = passive
                  ? `${definition.victoryPoints} point${definition.victoryPoints === 1 ? '' : 's'}`
                  : boughtThisTurn
                    ? 'Next turn'
                    : availability.canPlay
                      ? 'Ready'
                      : 'Unavailable';
                const tone: ProgressCardTooltipTone = passive
                  ? 'PASSIVE'
                  : boughtThisTurn
                    ? 'WAITING'
                    : availability.canPlay
                      ? 'READY'
                      : 'UNAVAILABLE';
                const statusDetail = passive
                  ? 'Scores automatically and is never played.'
                  : boughtThisTurn
                    ? 'Playable from your next turn.'
                    : availability.canPlay
                      ? 'Ready to play during this action phase.'
                      : (availability.reason ?? 'This card is not currently playable.');
                const tooltipId = `progress-card-tooltip-${instance.instanceId}`;
                const tooltipOpen = openTooltip?.instanceId === instance.instanceId;
                const confirming = progressCardPlayIntentId === instance.instanceId;
                const usesInlineConfirmation =
                  definition.effect === 'MOVE_ROBBER' || definition.effect === 'PLACE_TWO_ROADS';
                const tooltipCard = {
                  instanceId: instance.instanceId,
                  definition,
                  status,
                  statusDetail,
                  tone,
                };
                const disabled = passive || !availability.canPlay;
                const visibleStackLayers = Math.min(instances.length - 1, 5);
                const stackSpread = 0.38;
                const showFromMouse = (event: MouseEvent<HTMLSpanElement>) => {
                  const card =
                    event.currentTarget.querySelector<HTMLElement>('.progress-hand-card');
                  openCardTooltip(card ?? event.currentTarget, tooltipCard);
                };
                const showFromFocus = (event: FocusEvent<HTMLSpanElement>) => {
                  if (tooltipNeedsFocusExitRef.current) return;
                  tooltipNeedsPointerExitRef.current = false;
                  const card =
                    event.currentTarget.querySelector<HTMLElement>('.progress-hand-card');
                  openCardTooltip(card ?? event.currentTarget, tooltipCard, true);
                };
                return (
                  <span
                    key={definition.id}
                    className="progress-hand-card-anchor progress-hand-card-stack"
                    data-progress-card-anchor={definition.id}
                    style={
                      {
                        '--progress-stack-width': `${4.8 + visibleStackLayers * stackSpread}rem`,
                      } as CSSProperties
                    }
                    role={disabled ? 'group' : undefined}
                    tabIndex={disabled ? 0 : undefined}
                    aria-label={
                      disabled
                        ? `${definition.displayName}. ${instances.length} owned. ${status}.`
                        : undefined
                    }
                    aria-describedby={disabled && tooltipOpen ? tooltipId : undefined}
                    onMouseEnter={showFromMouse}
                    onMouseLeave={() => {
                      tooltipNeedsPointerExitRef.current = false;
                      if (pinnedProgressCardIdRef.current !== instance.instanceId) {
                        closeCardTooltip(instance.instanceId);
                      }
                    }}
                    onFocus={showFromFocus}
                    onBlur={(event) => {
                      if (
                        pinnedProgressCardIdRef.current !== instance.instanceId &&
                        !event.currentTarget.contains(event.relatedTarget)
                      ) {
                        tooltipNeedsFocusExitRef.current = false;
                        closeCardTooltip(instance.instanceId);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') return;
                      if (confirming) {
                        event.preventDefault();
                        pinnedProgressCardIdRef.current = null;
                        onCancelProgressCardPlay?.();
                      }
                      closeCardTooltip(instance.instanceId);
                    }}
                  >
                    {Array.from({ length: visibleStackLayers }, (_, index) => (
                      <span
                        key={index}
                        className="progress-hand-card-stack__layer"
                        style={
                          {
                            '--progress-stack-offset': `${(index + 1) * stackSpread}rem`,
                            '--progress-stack-drop': `${(visibleStackLayers - index) * 0.055}rem`,
                          } as CSSProperties
                        }
                        aria-hidden="true"
                      />
                    ))}
                    <button
                      type="button"
                      className={`progress-hand-card ${boughtThisTurn ? 'progress-hand-card--new' : ''}`}
                      aria-label={
                        passive
                          ? `${definition.displayName}, passive victory point`
                          : `Play ${definition.displayName}`
                      }
                      aria-describedby={!disabled && tooltipOpen ? tooltipId : undefined}
                      disabled={disabled}
                      onClick={(event) => {
                        if (confirming) {
                          pinnedProgressCardIdRef.current = null;
                          onCancelProgressCardPlay?.();
                          return;
                        }
                        pinnedProgressCardIdRef.current = usesInlineConfirmation
                          ? instance.instanceId
                          : null;
                        if (usesInlineConfirmation) {
                          openCardTooltip(event.currentTarget, tooltipCard, true);
                        } else {
                          setOpenTooltip(null);
                        }
                        onPlayProgressCard(instance.instanceId);
                      }}
                    >
                      <ProgressCardArtwork definition={definition} />
                      <small>{status}</small>
                    </button>
                    {instances.length > 1 ? (
                      <strong
                        className="progress-hand-card-stack__count"
                        aria-label={`${instances.length} copies`}
                      >
                        {instances.length}
                      </strong>
                    ) : null}
                  </span>
                );
              })}
              {ownedKNCardGroups.map(({ instances, definition }) => {
                const instance = instances[0];
                if (instance === undefined) return null;
                const isAlchemist = definition.effect === 'ALCHEMIST';
                const selectingForReturn = onSelectKNProgressCard !== undefined;
                const isActiveBoardCard = pendingBoardCardId === instance.instanceId;
                const canCancelActiveBoardCard =
                  isActiveBoardCard && pendingBoardCard?.canCancel === true;
                const craneAvailable =
                  definition.effect !== 'CRANE' ||
                  (player !== undefined && canUseCraneProgressCard(state, player.id));
                const canPlay =
                  selectingForReturn ||
                  canCancelActiveBoardCard ||
                  (player !== undefined &&
                    state.turn.activePlayerId === player.id &&
                    state.pendingInteraction === null &&
                    craneAvailable &&
                    (isAlchemist
                      ? state.turn.phase === 'WAITING_FOR_ROLL'
                      : state.turn.phase === 'ACTION_PHASE'));
                const status = selectingForReturn
                  ? 'Select'
                  : isActiveBoardCard
                    ? canCancelActiveBoardCard
                      ? 'Cancel'
                      : 'Resolving'
                    : canPlay
                      ? 'Ready'
                      : definition.effect === 'CRANE' && !craneAvailable
                        ? 'Unavailable'
                        : isAlchemist
                          ? 'Before roll'
                          : 'After roll';
                const visibleStackLayers = Math.min(instances.length - 1, 5);
                const tooltipId = `kn-progress-card-tooltip-${instance.instanceId}`;
                const tooltipOpen = openKNTooltip?.instanceId === instance.instanceId;
                const confirming = knProgressCardPlayIntentId === instance.instanceId;
                const playsDirectlyOnTheBoard = [
                  'MEDICINE',
                  'SMITH',
                  'INVENTOR',
                  'RECLAMATION',
                  'WAR_DRUMS',
                ].includes(definition.effect);
                const showTooltip = (element: HTMLElement, ignorePointerLatch = false) => {
                  if (!ignorePointerLatch && tooltipNeedsPointerExitRef.current) return;
                  if (
                    pinnedProgressCardIdRef.current !== null ||
                    (pinnedKNProgressCardIdRef.current !== null &&
                      pinnedKNProgressCardIdRef.current !== instance.instanceId)
                  ) {
                    return;
                  }
                  const bounds = element.getBoundingClientRect();
                  setOpenKNTooltip({
                    instanceId: instance.instanceId,
                    definition,
                    anchor: { left: bounds.left, top: bounds.top, width: bounds.width },
                  });
                };
                return (
                  <span
                    key={definition.id}
                    className={`progress-hand-card-anchor progress-hand-card-stack kn-progress-hand-card-stack kn-progress-hand-card-stack--${definition.family.toLocaleLowerCase()}`}
                    style={
                      {
                        '--progress-stack-width': `${4.8 + visibleStackLayers * 0.38}rem`,
                      } as CSSProperties
                    }
                    onMouseEnter={(event) => showTooltip(event.currentTarget)}
                    onMouseLeave={() => {
                      tooltipNeedsPointerExitRef.current = false;
                      if (pinnedKNProgressCardIdRef.current !== instance.instanceId) {
                        setOpenKNTooltip((current) =>
                          current?.instanceId === instance.instanceId ? null : current,
                        );
                      }
                    }}
                    onFocus={(event) => {
                      if (tooltipNeedsFocusExitRef.current) return;
                      tooltipNeedsPointerExitRef.current = false;
                      showTooltip(event.currentTarget, true);
                    }}
                    onBlur={() => {
                      tooltipNeedsFocusExitRef.current = false;
                      if (pinnedKNProgressCardIdRef.current !== instance.instanceId) {
                        setOpenKNTooltip((current) =>
                          current?.instanceId === instance.instanceId ? null : current,
                        );
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape' || !confirming) return;
                      event.preventDefault();
                      pinnedKNProgressCardIdRef.current = null;
                      setOpenKNTooltip(null);
                      onCancelKNProgressCardPlay?.();
                    }}
                  >
                    {Array.from({ length: visibleStackLayers }, (_, index) => (
                      <span
                        key={index}
                        className="progress-hand-card-stack__layer"
                        style={
                          {
                            '--progress-stack-offset': `${(index + 1) * 0.38}rem`,
                            '--progress-stack-drop': `${(visibleStackLayers - index) * 0.055}rem`,
                          } as CSSProperties
                        }
                        aria-hidden="true"
                      />
                    ))}
                    <button
                      type="button"
                      className="progress-hand-card kn-progress-hand-card"
                      disabled={!canPlay}
                      aria-describedby={tooltipOpen ? tooltipId : undefined}
                      aria-label={
                        selectingForReturn
                          ? `Select ${definition.displayName} for return`
                          : canCancelActiveBoardCard
                            ? `Cancel ${definition.displayName}`
                            : isActiveBoardCard
                              ? `Resolving ${definition.displayName}`
                              : `Play ${definition.displayName}`
                      }
                      onClick={(event) => {
                        if (selectingForReturn) {
                          setOpenKNTooltip(null);
                          onSelectKNProgressCard?.(instance.instanceId);
                        } else if (confirming) {
                          pinnedKNProgressCardIdRef.current = null;
                          onCancelKNProgressCardPlay?.();
                        } else {
                          pinnedKNProgressCardIdRef.current = playsDirectlyOnTheBoard
                            ? null
                            : instance.instanceId;
                          if (playsDirectlyOnTheBoard) {
                            setOpenKNTooltip(null);
                          } else {
                            showTooltip(event.currentTarget, true);
                          }
                          onPlayKNProgressCard(instance.instanceId);
                        }
                      }}
                    >
                      <KNProgressCardArtwork definition={definition} />
                      <small>{status}</small>
                    </button>
                    {instances.length > 1 ? (
                      <strong
                        className="progress-hand-card-stack__count"
                        aria-label={`${instances.length} copies`}
                      >
                        {instances.length}
                      </strong>
                    ) : null}
                  </span>
                );
              })}
            </>
          )}
        </div>
      </section>
      {visibleOpenTooltip === null ? null : (
        <ProgressCardTooltip
          id={`progress-card-tooltip-${visibleOpenTooltip.instanceId}`}
          definition={visibleOpenTooltip.definition}
          status={
            progressCardPlayIntentId === visibleOpenTooltip.instanceId
              ? 'Confirm play'
              : visibleOpenTooltip.status
          }
          statusDetail={
            progressCardPlayIntentId === visibleOpenTooltip.instanceId
              ? 'Review the card, then confirm or cancel from the controls on the right.'
              : visibleOpenTooltip.statusDetail
          }
          tone={visibleOpenTooltip.tone}
          anchor={visibleOpenTooltip.anchor}
          {...(progressCardPlayIntentId !== visibleOpenTooltip.instanceId ||
          onConfirmProgressCardPlay === undefined ||
          onCancelProgressCardPlay === undefined
            ? {}
            : {
                confirmation: {
                  confirmLabel: `Use ${visibleOpenTooltip.definition.displayName}`,
                  errorMessage: progressCardPlayErrorMessage,
                  onConfirm: () => onConfirmProgressCardPlay(visibleOpenTooltip.instanceId),
                  onCancel: () => {
                    pinnedProgressCardIdRef.current = null;
                    setOpenTooltip(null);
                    onCancelProgressCardPlay();
                  },
                },
              })}
        />
      )}
      {visibleOpenKNTooltip === null ? null : (
        <KNProgressCardTooltip
          id={`kn-progress-card-tooltip-${visibleOpenKNTooltip.instanceId}`}
          definition={visibleOpenKNTooltip.definition}
          status={
            knProgressCardPlayIntentId === visibleOpenKNTooltip.instanceId
              ? 'Confirm play'
              : 'K+N Progress Card'
          }
          statusDetail={
            knProgressCardPlayIntentId === visibleOpenKNTooltip.instanceId
              ? 'Review the card, then confirm or cancel from the controls on the right.'
              : onSelectKNProgressCard !== undefined
                ? 'Select this card to move it into the return shelf.'
                : visibleOpenKNTooltip.definition.effect === 'CRANE' &&
                    player !== undefined &&
                    !canUseCraneProgressCard(state, player.id)
                  ? 'Crane needs a City and a legally affordable discounted Improvement right now.'
                  : pendingBoardCardId === visibleOpenKNTooltip.instanceId
                    ? pendingBoardCard?.canCancel === true
                      ? `Choose a glowing board target, or click ${visibleOpenKNTooltip.definition.displayName} again to cancel.`
                      : 'Choose another glowing board target to finish resolving this card.'
                    : visibleOpenKNTooltip.definition.effect === 'ALCHEMIST'
                      ? 'Play before rolling; choose both numeric dice.'
                      : 'Play during your action phase. K+N allows multiple Progress Cards per turn.'
          }
          anchor={visibleOpenKNTooltip.anchor}
          {...(knProgressCardPlayIntentId !== visibleOpenKNTooltip.instanceId ||
          onConfirmKNProgressCardPlay === undefined ||
          onCancelKNProgressCardPlay === undefined
            ? {}
            : {
                confirmation: {
                  confirmLabel: `Play ${visibleOpenKNTooltip.definition.displayName}`,
                  errorMessage: progressCardPlayErrorMessage,
                  onConfirm: () => onConfirmKNProgressCardPlay(visibleOpenKNTooltip.instanceId),
                  onCancel: () => {
                    pinnedKNProgressCardIdRef.current = null;
                    setOpenKNTooltip(null);
                    onCancelKNProgressCardPlay();
                  },
                },
              })}
        />
      )}
    </section>
  );
}
