import { useEffect, useMemo, useRef } from 'react';

import { HAND_GOODS } from '../engine/content/commodities';
import { getKNProgressCardDefinition } from '../engine/content/kn-progress-cards';
import { PROGRESS_CARDS } from '../engine/content/progress-cards';
import type { BoardState, GameState, KNState } from '../engine/core/game-state';
import type { HexId, ResourceId, VertexId } from '../engine/core/ids';
import type {
  BoardTarget,
  BoardViewportPoint,
  ProgressCardFlyover,
  ResourceFlyover,
} from './render-model';
import type { TerritoryBoard, TerritoryBoardOptions } from './TerritoryBoard';
import type { BoardFrameRateLimit, BoardGraphicsQuality } from './performance';
import { boardVisualKey } from './board-visual-key';
import { Button } from '../ui/components/Button';
import { resourceGlyph } from '../ui/game/game-icons';

export interface BoardViewportProps {
  readonly board: BoardState;
  readonly players?: GameState['players'];
  readonly knState?: KNState | null;
  readonly showDebugIds: boolean;
  readonly selectableTargets: readonly BoardTarget[];
  readonly highlightedHexIds: readonly HexId[];
  readonly emphasizedVertexIds?: readonly VertexId[];
  readonly inventorSelectionActive?: boolean;
  readonly inventorSelectedHexId?: HexId | null;
  readonly inventorPendingHexId?: HexId | null;
  readonly numberTokenSwap?: readonly [HexId, HexId] | null;
  readonly madnessHighlightedHexIds?: readonly HexId[];
  readonly terrainChange?: {
    readonly hexId: HexId;
    readonly fromResourceId: ResourceId;
  } | null;
  readonly merchantPlacementActive?: boolean;
  readonly animatedTarget: BoardTarget | null;
  readonly robberMove: {
    readonly fromHexId: HexId;
    readonly toHexId: HexId;
  } | null;
  readonly playerColors: Readonly<Record<string, string>>;
  readonly reducedMotion?: boolean;
  readonly graphicsQuality?: BoardGraphicsQuality;
  readonly frameRateLimit?: BoardFrameRateLimit;
  readonly showTargetPulses?: boolean;
  readonly showRobberAttention?: boolean;
  readonly resourceFlyovers?: readonly ResourceFlyover[];
  readonly progressCardFlyovers?: readonly ProgressCardFlyover[];
  readonly showKeyboardTargetControls?: boolean;
  readonly onReady?: () => void;
  readonly onInspect: (target: BoardTarget | null) => void;
  readonly onSelect: (target: BoardTarget, position?: BoardViewportPoint) => void;
}

function playResourceFlyover(
  renderer: TerritoryBoard,
  host: HTMLElement,
  flyover: ResourceFlyover,
  activeElements: Set<HTMLElement>,
): void {
  const hexSource =
    flyover.source.kind === 'HEX' ? renderer.getHexScreenPosition(flyover.source.hexId) : null;
  const sourceHand =
    flyover.source.kind === 'PLAYER'
      ? document.querySelector<HTMLElement>(
          `.hand-tray[data-hand-player="${flyover.source.playerId}"]`,
        )
      : null;
  const domSource =
    flyover.source.kind === 'BANK'
      ? document.querySelector<HTMLElement>(`[data-bank-card="${flyover.resourceId}"]`)
      : flyover.source.kind === 'PLAYER'
        ? (sourceHand?.querySelector<HTMLElement>(`[data-resource-card="${flyover.resourceId}"]`) ??
          sourceHand?.querySelector<HTMLElement>('.resource-hand') ??
          document.querySelector<HTMLElement>(`[data-player-panel="${flyover.source.playerId}"]`))
        : null;
  const visibleHand = document.querySelector<HTMLElement>('.hand-tray');
  const explicitTargetPlayerId =
    flyover.target?.kind === 'PLAYER' ? flyover.target.playerId : flyover.targetPlayerId;
  const matchingHand =
    explicitTargetPlayerId === undefined ||
    visibleHand?.dataset.handPlayer === explicitTargetPlayerId
      ? visibleHand
      : null;
  const inventoryTarget =
    flyover.target?.kind === 'BANK'
      ? document.querySelector<HTMLElement>(`[data-bank-card="${flyover.resourceId}"]`)
      : (matchingHand?.querySelector<HTMLElement>(`[data-resource-card="${flyover.resourceId}"]`) ??
        matchingHand?.querySelector<HTMLElement>('.resource-hand') ??
        (explicitTargetPlayerId === undefined
          ? document.querySelector<HTMLElement>('.hand-tray .resource-hand')
          : document.querySelector<HTMLElement>(
              `[data-player-panel="${explicitTargetPlayerId}"]`,
            )));
  if ((hexSource === null && domSource === null) || inventoryTarget === null) return;

  const hostBounds = host.getBoundingClientRect();
  const targetBounds = inventoryTarget.getBoundingClientRect();
  const sourceBounds = domSource?.getBoundingClientRect();
  const definition = HAND_GOODS.find((resource) => resource.id === flyover.resourceId);
  const card = document.createElement('span');
  card.className = `resource-flyover-card resource-flyover-card--${definition?.iconKey ?? 'unknown'}`;
  card.setAttribute('aria-hidden', 'true');
  card.style.setProperty('--flyover-color', definition?.color ?? '#56645f');
  const art = document.createElement('strong');
  art.textContent = resourceGlyph(flyover.resourceId);
  const label = document.createElement('small');
  label.textContent = definition?.displayName ?? 'Card';
  card.append(art, label);
  document.body.append(card);
  activeElements.add(card);

  const sourceX =
    hexSource === null
      ? (sourceBounds?.left ?? hostBounds.left) + (sourceBounds?.width ?? 0) / 2 - 22
      : hostBounds.left + hexSource.x - 22;
  const sourceY =
    hexSource === null
      ? (sourceBounds?.top ?? hostBounds.top) + (sourceBounds?.height ?? 0) / 2 - 30
      : hostBounds.top + hexSource.y - 30;
  const destinationX = targetBounds.left + targetBounds.width / 2 - 22;
  const destinationY = targetBounds.top + targetBounds.height / 2 - 30;
  const midpointX = sourceX + (destinationX - sourceX) * 0.52;
  const midpointY = sourceY + (destinationY - sourceY) * 0.52 - 84;

  if (typeof card.animate !== 'function') {
    activeElements.delete(card);
    card.remove();
    return;
  }

  const animation = card.animate(
    [
      { opacity: 0, transform: `translate3d(${sourceX}px, ${sourceY}px, 0) scale(.78)` },
      {
        opacity: 1,
        offset: 0.14,
        transform: `translate3d(${sourceX}px, ${sourceY}px, 0) scale(1)`,
      },
      {
        opacity: 1,
        offset: 0.58,
        transform: `translate3d(${midpointX}px, ${midpointY}px, 0) scale(1.13) rotate(4deg)`,
      },
      {
        opacity: 0,
        transform: `translate3d(${destinationX}px, ${destinationY}px, 0) scale(.62) rotate(-3deg)`,
      },
    ],
    {
      delay: flyover.delayMs,
      duration: 1750,
      easing: 'cubic-bezier(.42, 0, .2, 1)',
      fill: 'both',
    },
  );
  void animation.finished
    .catch(() => undefined)
    .finally(() => {
      activeElements.delete(card);
      card.remove();
    });
}

function playProgressCardFlyover(
  flyover: ProgressCardFlyover,
  activeElements: Set<HTMLElement>,
): void {
  const visibleHand = document.querySelector<HTMLElement>('.hand-tray');
  const source =
    flyover.source.kind === 'PLAYER'
      ? visibleHand?.dataset.handPlayer === flyover.source.playerId
        ? (visibleHand.querySelector<HTMLElement>('.progress-tray__cards') ?? visibleHand)
        : document.querySelector<HTMLElement>(`[data-player-panel="${flyover.source.playerId}"]`)
      : (document.querySelector<HTMLElement>(
          flyover.source.family === undefined
            ? '[data-progress-deck="BASE"]'
            : `[data-progress-deck="${flyover.source.family}"]`,
        ) ?? document.querySelector<HTMLElement>('.bank-panel'));
  const target =
    visibleHand?.dataset.handPlayer === flyover.targetPlayerId
      ? visibleHand.querySelector<HTMLElement>('.progress-tray__cards')
      : document.querySelector<HTMLElement>(`[data-player-panel="${flyover.targetPlayerId}"]`);
  const knDefinition = getKNProgressCardDefinition(flyover.cardDefinitionId);
  const baseDefinition = PROGRESS_CARDS.find(
    (definition) => definition.id === flyover.cardDefinitionId,
  );
  if (source === null || target === null) return;

  const sourceBounds = source.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const card = document.createElement('span');
  card.className = `progress-flyover-card${knDefinition === undefined ? '' : ` progress-flyover-card--${knDefinition.family.toLocaleLowerCase()}`}`;
  card.setAttribute('aria-hidden', 'true');
  const art = document.createElement('strong');
  art.textContent =
    knDefinition?.family === 'SCIENCE'
      ? '⚗'
      : knDefinition?.family === 'TRADE'
        ? '⚖'
        : knDefinition?.family === 'POLITICS'
          ? '♜'
          : '🧭';
  const label = document.createElement('small');
  label.textContent = knDefinition?.displayName ?? baseDefinition?.displayName ?? 'Progress Card';
  card.append(art, label);
  document.body.append(card);
  activeElements.add(card);

  const sourceX = sourceBounds.left + sourceBounds.width / 2 - 25;
  const sourceY = sourceBounds.top + sourceBounds.height / 2 - 32;
  const destinationX = targetBounds.left + targetBounds.width / 2 - 25;
  const destinationY = targetBounds.top + targetBounds.height / 2 - 32;
  const midpointX = sourceX + (destinationX - sourceX) * 0.5;
  const midpointY = sourceY + (destinationY - sourceY) * 0.5 - 90;

  if (typeof card.animate !== 'function') {
    activeElements.delete(card);
    card.remove();
    return;
  }
  const animation = card.animate(
    [
      {
        opacity: 0,
        transform: `translate3d(${sourceX}px, ${sourceY}px, 0) scale(.72) rotate(-5deg)`,
      },
      {
        opacity: 1,
        offset: 0.16,
        transform: `translate3d(${sourceX}px, ${sourceY}px, 0) scale(1)`,
      },
      {
        opacity: 1,
        offset: 0.6,
        transform: `translate3d(${midpointX}px, ${midpointY}px, 0) scale(1.15) rotate(4deg)`,
      },
      {
        opacity: 0,
        transform: `translate3d(${destinationX}px, ${destinationY}px, 0) scale(.58) rotate(-2deg)`,
      },
    ],
    {
      delay: flyover.delayMs,
      duration: 1_750,
      easing: 'cubic-bezier(.42, 0, .2, 1)',
      fill: 'both',
    },
  );
  void animation.finished
    .catch(() => undefined)
    .finally(() => {
      activeElements.delete(card);
      card.remove();
    });
}

function useStableByKey<T>(value: T, key: string): T {
  // Object identity is deliberately reduced to the visual fields encoded by key. Hand counts,
  // deck state, and freshly allocated-but-equivalent arrays must not rebuild the Pixi renderer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, [key]);
}

const PLAYED_FLYOVER_HISTORY_LIMIT = 256;

function rememberPlayedFlyover(history: Set<string>, id: string): void {
  history.add(id);
  while (history.size > PLAYED_FLYOVER_HISTORY_LIMIT) {
    const oldestId = history.values().next().value;
    if (oldestId === undefined) return;
    history.delete(oldestId);
  }
}

export function BoardViewport({
  board,
  players = {},
  knState = null,
  showDebugIds,
  selectableTargets,
  highlightedHexIds,
  emphasizedVertexIds = [],
  inventorSelectionActive = false,
  inventorSelectedHexId = null,
  inventorPendingHexId = null,
  numberTokenSwap = null,
  madnessHighlightedHexIds = [],
  terrainChange = null,
  merchantPlacementActive = false,
  animatedTarget,
  robberMove,
  playerColors,
  reducedMotion = false,
  graphicsQuality = 'HIGH',
  frameRateLimit = 60,
  showTargetPulses = true,
  showRobberAttention = false,
  resourceFlyovers = [],
  progressCardFlyovers = [],
  onReady,
  onInspect,
  onSelect,
}: BoardViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TerritoryBoard | null>(null);
  const inspectRef = useRef(onInspect);
  const selectRef = useRef(onSelect);
  const readyCallbackRef = useRef(onReady);
  const debugRef = useRef(showDebugIds);
  const rendererReadyRef = useRef<Promise<void> | null>(null);
  const appliedRenderInputRef = useRef<{
    readonly board: BoardState;
    readonly options: TerritoryBoardOptions;
  } | null>(null);
  const playedFlyoverIdsRef = useRef(new Set<string>());
  const activeFlyoverElementsRef = useRef(new Set<HTMLElement>());
  const visualBoardKey = useMemo(() => boardVisualKey(board), [board]);
  const stableBoard = useStableByKey(board, visualBoardKey);
  const currentKnights = Object.values(players).flatMap((player) => player.knights);
  const stableKnights = useStableByKey(
    currentKnights,
    currentKnights
      .map(
        (knight) =>
          `${knight.id}:${knight.ownerId}:${knight.vertexId}:${knight.level}:${knight.active ? 1 : 0}`,
      )
      .join('|'),
  );
  const merchant = knState?.merchant ?? null;
  const stableMerchant = useStableByKey(
    merchant,
    merchant === null ? '' : `${merchant.ownerId}:${merchant.hexId}:${merchant.resourceId}`,
  );
  const stableSelectableTargets = useStableByKey(
    selectableTargets,
    selectableTargets.map((target) => `${target.kind}:${target.id}`).join('|'),
  );
  const stableHighlightedHexIds = useStableByKey(highlightedHexIds, highlightedHexIds.join('|'));
  const stableEmphasizedVertexIds = useStableByKey(
    emphasizedVertexIds,
    emphasizedVertexIds.join('|'),
  );
  const stableMadnessHighlightedHexIds = useStableByKey(
    madnessHighlightedHexIds,
    madnessHighlightedHexIds.join('|'),
  );
  const stableNumberTokenSwap = useStableByKey(numberTokenSwap, numberTokenSwap?.join('|') ?? '');
  const stableTerrainChange = useStableByKey(
    terrainChange,
    terrainChange === null ? '' : `${terrainChange.hexId}:${terrainChange.fromResourceId}`,
  );
  const stableAnimatedTarget = useStableByKey(
    animatedTarget,
    animatedTarget === null ? '' : `${animatedTarget.kind}:${animatedTarget.id}`,
  );
  const stableRobberMove = useStableByKey(
    robberMove,
    robberMove === null ? '' : `${robberMove.fromHexId}:${robberMove.toHexId}`,
  );
  const stablePlayerColors = useStableByKey(
    playerColors,
    Object.entries(playerColors)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([playerId, color]) => `${playerId}:${color}`)
      .join('|'),
  );
  const renderInput = useMemo(
    () => ({
      board: stableBoard,
      options: {
        onInspect: (target: BoardTarget | null) => inspectRef.current(target),
        onSelect: (target: BoardTarget, point: BoardViewportPoint) => {
          const host = hostRef.current;
          if (host === null) return;
          const bounds = host.getBoundingClientRect();
          selectRef.current(target, { x: bounds.left + point.x, y: bounds.top + point.y });
        },
        selectableTargets: stableSelectableTargets,
        highlightedHexIds: stableHighlightedHexIds,
        emphasizedVertexIds: stableEmphasizedVertexIds,
        inventorSelectionActive,
        inventorSelectedHexId,
        inventorPendingHexId,
        numberTokenSwap: stableNumberTokenSwap,
        madnessHighlightedHexIds: stableMadnessHighlightedHexIds,
        terrainChange: stableTerrainChange,
        merchantPlacementActive,
        animatedTarget: stableAnimatedTarget,
        robberMove: stableRobberMove,
        playerColors: stablePlayerColors,
        reducedMotion,
        graphicsQuality,
        frameRateLimit,
        showTargetPulses,
        showRobberAttention,
        knights: stableKnights,
        merchant: stableMerchant,
      } satisfies TerritoryBoardOptions,
    }),
    [
      frameRateLimit,
      graphicsQuality,
      inventorPendingHexId,
      inventorSelectedHexId,
      inventorSelectionActive,
      merchantPlacementActive,
      reducedMotion,
      showRobberAttention,
      showTargetPulses,
      stableEmphasizedVertexIds,
      stableHighlightedHexIds,
      stableKnights,
      stableMadnessHighlightedHexIds,
      stableMerchant,
      stableNumberTokenSwap,
      stablePlayerColors,
      stableRobberMove,
      stableSelectableTargets,
      stableTerrainChange,
      stableAnimatedTarget,
      stableBoard,
    ],
  );
  const renderInputRef = useRef(renderInput);

  useEffect(() => {
    renderInputRef.current = renderInput;
  }, [renderInput]);

  useEffect(
    () => () => {
      for (const element of activeFlyoverElementsRef.current) element.remove();
      activeFlyoverElementsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    inspectRef.current = onInspect;
  }, [onInspect]);

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    readyCallbackRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return undefined;
    let cancelled = false;
    let renderer: TerritoryBoard | null = null;

    const ready = import('./TerritoryBoard')
      .then(async ({ TerritoryBoard: Renderer }) => {
        if (cancelled) return;
        const initialInput = renderInputRef.current;
        renderer = new Renderer(host, initialInput.board, initialInput.options);
        rendererRef.current = renderer;
        renderer.setDebugIdsVisible(debugRef.current);
        await renderer.mount();
        if (!cancelled) {
          appliedRenderInputRef.current = initialInput;
          readyCallbackRef.current?.();
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        host.textContent =
          error instanceof Error ? error.message : 'Unable to initialize the board renderer.';
        host.classList.add('board-viewport--error');
      });
    rendererReadyRef.current = ready;

    return () => {
      cancelled = true;
      if (rendererReadyRef.current === ready) rendererReadyRef.current = null;
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (appliedRenderInputRef.current !== null) appliedRenderInputRef.current = null;
      renderer?.destroy();
    };
  }, [graphicsQuality]);

  useEffect(() => {
    const ready = rendererReadyRef.current;
    const nextInput = renderInput;
    if (ready === null) return undefined;
    let cancelled = false;
    void ready.then(() => {
      if (cancelled || appliedRenderInputRef.current === nextInput) return;
      rendererRef.current?.update(nextInput.board, nextInput.options);
      appliedRenderInputRef.current = nextInput;
    });
    return () => {
      cancelled = true;
    };
  }, [renderInput]);

  useEffect(() => {
    const host = hostRef.current;
    const ready = rendererReadyRef.current;
    if (host === null || ready === null) return undefined;
    let cancelled = false;
    const pendingResourceFlyovers = resourceFlyovers.filter(
      (flyover) => !playedFlyoverIdsRef.current.has(flyover.id),
    );
    const pendingProgressCardFlyovers = progressCardFlyovers.filter(
      (flyover) => !playedFlyoverIdsRef.current.has(flyover.id),
    );

    void ready.then(() => {
      if (cancelled) return;
      const renderer = rendererRef.current;
      if (renderer === null) return;
      const motionDisabled =
        reducedMotion || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      for (const flyover of pendingResourceFlyovers) {
        rememberPlayedFlyover(playedFlyoverIdsRef.current, flyover.id);
        if (!motionDisabled) {
          playResourceFlyover(renderer, host, flyover, activeFlyoverElementsRef.current);
        }
      }
      for (const flyover of pendingProgressCardFlyovers) {
        rememberPlayedFlyover(playedFlyoverIdsRef.current, flyover.id);
        if (!motionDisabled) {
          playProgressCardFlyover(flyover, activeFlyoverElementsRef.current);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [progressCardFlyovers, reducedMotion, resourceFlyovers]);

  useEffect(() => {
    debugRef.current = showDebugIds;
    rendererRef.current?.setDebugIdsVisible(showDebugIds);
  }, [showDebugIds]);

  return (
    <section className="board-shell" aria-label="Territory board">
      <div ref={hostRef} className="board-viewport" />
      <div className="board-controls" role="group" aria-label="Board zoom controls">
        <Button
          className="board-controls__zoom"
          variant="ghost"
          aria-label="Zoom board out"
          title="Zoom out"
          onClick={() => rendererRef.current?.zoomBy(0.82)}
        >
          <span aria-hidden="true">−</span>
        </Button>
        <Button
          className="board-controls__fit"
          variant="ghost"
          aria-label="Fit screen"
          title="Fit the entire board"
          onClick={() => rendererRef.current?.fitBoard()}
        >
          Fit
        </Button>
        <Button
          className="board-controls__zoom"
          variant="ghost"
          aria-label="Zoom board in"
          title="Zoom in"
          onClick={() => rendererRef.current?.zoomBy(1.22)}
        >
          <span aria-hidden="true">+</span>
        </Button>
      </div>
    </section>
  );
}
