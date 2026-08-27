import { useEffect, useRef } from 'react';

import type { BoardState } from '../engine/core/game-state';
import type { HexId } from '../engine/core/ids';
import type { BoardTarget } from './render-model';
import type { TerritoryBoard } from './TerritoryBoard';
import { Button } from '../ui/components/Button';

export interface BoardViewportProps {
  readonly board: BoardState;
  readonly showDebugIds: boolean;
  readonly selectableTargets: readonly BoardTarget[];
  readonly highlightedHexIds: readonly HexId[];
  readonly animatedTarget: BoardTarget | null;
  readonly playerColors: Readonly<Record<string, string>>;
  readonly onInspect: (target: BoardTarget | null) => void;
  readonly onSelect: (target: BoardTarget) => void;
}

export function BoardViewport({
  board,
  showDebugIds,
  selectableTargets,
  highlightedHexIds,
  animatedTarget,
  playerColors,
  onInspect,
  onSelect,
}: BoardViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TerritoryBoard | null>(null);
  const inspectRef = useRef(onInspect);
  const selectRef = useRef(onSelect);
  const debugRef = useRef(showDebugIds);

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

    void import('./TerritoryBoard')
      .then(async ({ TerritoryBoard: Renderer }) => {
        if (cancelled) return;
        const renderer = new Renderer(host, board, {
          onInspect: (target) => inspectRef.current(target),
          onSelect: (target) => selectRef.current(target),
          selectableTargets,
          highlightedHexIds,
          animatedTarget,
          playerColors,
        });
        rendererRef.current = renderer;
        renderer.setDebugIdsVisible(debugRef.current);
        await renderer.mount();
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
  }, [animatedTarget, board, highlightedHexIds, playerColors, selectableTargets]);

  useEffect(() => {
    debugRef.current = showDebugIds;
    rendererRef.current?.setDebugIdsVisible(showDebugIds);
  }, [showDebugIds]);

  return (
    <section className="board-shell" aria-label="Territory board">
      <div ref={hostRef} className="board-viewport" />
      <div className="board-controls">
        <span>
          {selectableTargets.length > 0 ? (
            <>
              <i className="legal-target-swatch" aria-hidden="true" /> {selectableTargets.length}{' '}
              legal targets ·{' '}
            </>
          ) : null}
          Drag to pan · Scroll to zoom
        </span>
        <Button variant="ghost" onClick={() => rendererRef.current?.fitBoard()}>
          Fit board
        </Button>
      </div>
    </section>
  );
}
