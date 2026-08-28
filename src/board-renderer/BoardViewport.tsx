import { useEffect, useRef } from 'react';

import { HAND_GOODS } from '../engine/content/commodities';
import { getKNProgressCardDefinition } from '../engine/content/kn-progress-cards';
import type { BoardState, GameState, KNState } from '../engine/core/game-state';
import type { HexId, VertexId } from '../engine/core/ids';
import type {
  BoardTarget,
  BoardViewportPoint,
  ProgressCardFlyover,
  ResourceFlyover,
} from './render-model';
import type { TerritoryBoard } from './TerritoryBoard';
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
  readonly merchantPlacementActive?: boolean;
  readonly animatedTarget: BoardTarget | null;
  readonly robberMove: {
    readonly fromHexId: HexId;
    readonly toHexId: HexId;
  } | null;
  readonly playerColors: Readonly<Record<string, string>>;
  readonly reducedMotion?: boolean;
  readonly showTargetPulses?: boolean;
  readonly showRobberAttention?: boolean;
  readonly resourceFlyovers?: readonly ResourceFlyover[];
  readonly progressCardFlyovers?: readonly ProgressCardFlyover[];
  readonly showKeyboardTargetControls?: boolean;
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
  const domSource =
    flyover.source.kind === 'BANK'
      ? document.querySelector<HTMLElement>(`[data-bank-card="${flyover.resourceId}"]`)
      : flyover.source.kind === 'PLAYER'
        ? document.querySelector<HTMLElement>(`[data-player-panel="${flyover.source.playerId}"]`)
        : null;
  const visibleHand = document.querySelector<HTMLElement>('.hand-tray');
  const matchingHand =
    flyover.targetPlayerId === undefined ||
    visibleHand?.dataset.handPlayer === flyover.targetPlayerId
      ? visibleHand
      : null;
  const inventoryTarget =
    matchingHand?.querySelector<HTMLElement>(`[data-resource-card="${flyover.resourceId}"]`) ??
    matchingHand?.querySelector<HTMLElement>('.resource-hand') ??
    (flyover.targetPlayerId === undefined
      ? document.querySelector<HTMLElement>('.hand-tray .resource-hand')
      : document.querySelector<HTMLElement>(`[data-player-panel="${flyover.targetPlayerId}"]`));
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
  const source = document.querySelector<HTMLElement>(
    `[data-player-panel="${flyover.sourcePlayerId}"]`,
  );
  const target = document.querySelector<HTMLElement>('.hand-tray .progress-tray__cards');
  const definition = getKNProgressCardDefinition(flyover.cardDefinitionId);
  if (source === null || target === null || definition === undefined) return;

  const sourceBounds = source.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const card = document.createElement('span');
  card.className = `progress-flyover-card progress-flyover-card--${definition.family.toLocaleLowerCase()}`;
  card.setAttribute('aria-hidden', 'true');
  const art = document.createElement('strong');
  art.textContent =
    definition.family === 'SCIENCE' ? '⚗' : definition.family === 'TRADE' ? '⚖' : '♜';
  const label = document.createElement('small');
  label.textContent = definition.displayName;
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
  merchantPlacementActive = false,
  animatedTarget,
  robberMove,
  playerColors,
  reducedMotion = false,
  showTargetPulses = true,
  showRobberAttention = false,
  resourceFlyovers = [],
  progressCardFlyovers = [],
  onInspect,
  onSelect,
}: BoardViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TerritoryBoard | null>(null);
  const inspectRef = useRef(onInspect);
  const selectRef = useRef(onSelect);
  const debugRef = useRef(showDebugIds);
  const playedFlyoverIdsRef = useRef(new Set<string>());
  const activeFlyoverElementsRef = useRef(new Set<HTMLElement>());

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
    const host = hostRef.current;
    if (host === null) return undefined;
    let cancelled = false;
    const pendingResourceFlyovers = resourceFlyovers.filter(
      (flyover) => !playedFlyoverIdsRef.current.has(flyover.id),
    );
    const pendingProgressCardFlyovers = progressCardFlyovers.filter(
      (flyover) => !playedFlyoverIdsRef.current.has(flyover.id),
    );

    void import('./TerritoryBoard')
      .then(async ({ TerritoryBoard: Renderer }) => {
        if (cancelled) return;
        const renderer = new Renderer(host, board, {
          onInspect: (target) => inspectRef.current(target),
          onSelect: (target, point) => {
            const bounds = host.getBoundingClientRect();
            selectRef.current(target, { x: bounds.left + point.x, y: bounds.top + point.y });
          },
          selectableTargets,
          highlightedHexIds,
          emphasizedVertexIds,
          inventorSelectionActive,
          inventorSelectedHexId,
          inventorPendingHexId,
          numberTokenSwap,
          merchantPlacementActive,
          animatedTarget,
          robberMove,
          playerColors,
          reducedMotion,
          showTargetPulses,
          showRobberAttention,
          knights: Object.values(players).flatMap((player) => player.knights),
          merchant: knState?.merchant ?? null,
        });
        rendererRef.current = renderer;
        renderer.setDebugIdsVisible(debugRef.current);
        await renderer.mount();
        if (!cancelled) {
          for (const flyover of pendingResourceFlyovers) {
            playedFlyoverIdsRef.current.add(flyover.id);
            if (
              !reducedMotion &&
              !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ) {
              playResourceFlyover(renderer, host, flyover, activeFlyoverElementsRef.current);
            }
          }
          for (const flyover of pendingProgressCardFlyovers) {
            playedFlyoverIdsRef.current.add(flyover.id);
            if (
              !reducedMotion &&
              !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ) {
              playProgressCardFlyover(flyover, activeFlyoverElementsRef.current);
            }
          }
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        host.textContent =
          error instanceof Error ? error.message : 'Unable to initialize the board renderer.';
        host.classList.add('board-viewport--error');
      });

    return () => {
      cancelled = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [
    animatedTarget,
    board,
    knState,
    players,
    highlightedHexIds,
    emphasizedVertexIds,
    inventorSelectionActive,
    inventorSelectedHexId,
    inventorPendingHexId,
    numberTokenSwap,
    merchantPlacementActive,
    playerColors,
    progressCardFlyovers,
    reducedMotion,
    resourceFlyovers,
    robberMove,
    selectableTargets,
    showTargetPulses,
    showRobberAttention,
  ]);

  useEffect(() => {
    debugRef.current = showDebugIds;
    rendererRef.current?.setDebugIdsVisible(showDebugIds);
  }, [showDebugIds]);

  return (
    <section className="board-shell" aria-label="Territory board">
      <div ref={hostRef} className="board-viewport" />
      <div className="board-controls">
        <Button
          variant="ghost"
          aria-label="Fit screen"
          onClick={() => rendererRef.current?.fitBoard()}
        >
          Fit screen
        </Button>
      </div>
    </section>
  );
}
