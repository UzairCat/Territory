// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardViewport, type BoardViewportProps } from '../../src/board-renderer/BoardViewport';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import type { BoardState, KnightState } from '../../src/engine/core/game-state';
import { edgeId, hexId, knightId, vertexId } from '../../src/engine/core/ids';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

const rendererProbe = vi.hoisted(() => ({
  constructed: 0,
  mounted: 0,
  updated: 0,
  destroyed: 0,
  fitCalls: 0,
  zoomFactors: [] as number[],
  updatedBoards: [] as unknown[],
  updatedOptions: [] as unknown[],
}));

vi.mock('../../src/board-renderer/TerritoryBoard', () => ({
  TerritoryBoard: class {
    constructor(..._arguments: unknown[]) {
      rendererProbe.constructed += 1;
    }

    setDebugIdsVisible(): void {}

    mount(): Promise<void> {
      rendererProbe.mounted += 1;
      return Promise.resolve();
    }

    update(board: unknown, options: unknown): void {
      rendererProbe.updated += 1;
      rendererProbe.updatedBoards.push(board);
      rendererProbe.updatedOptions.push(options);
    }

    destroy(): void {
      rendererProbe.destroyed += 1;
    }

    fitBoard(): void {
      rendererProbe.fitCalls += 1;
    }

    zoomBy(factor: number): void {
      rendererProbe.zoomFactors.push(factor);
    }

    getHexScreenPosition(): null {
      return null;
    }
  },
}));

describe('board viewport renderer lifecycle', () => {
  beforeEach(() => {
    rendererProbe.constructed = 0;
    rendererProbe.mounted = 0;
    rendererProbe.updated = 0;
    rendererProbe.destroyed = 0;
    rendererProbe.fitCalls = 0;
    rendererProbe.zoomFactors.length = 0;
    rendererProbe.updatedBoards.length = 0;
    rendererProbe.updatedOptions.length = 0;
  });

  afterEach(cleanup);

  it('keeps the Pixi renderer mounted through hand changes and flyover updates', async () => {
    const state = createTestGameState('ACTION_PHASE');
    const player = state.players[TEST_PLAYER_IDS[0]]!;
    const baseProps: BoardViewportProps = {
      board: state.board,
      players: state.players,
      knState: state.kn,
      showDebugIds: false,
      selectableTargets: [],
      highlightedHexIds: [],
      animatedTarget: null,
      robberMove: null,
      playerColors: { [TEST_PLAYER_IDS[0]]: '#2864c7' },
      onInspect: vi.fn(),
      onSelect: vi.fn(),
    };
    const view = render(<BoardViewport {...baseProps} />);

    await waitFor(() => expect(rendererProbe.mounted).toBe(1));

    view.rerender(
      <BoardViewport
        {...baseProps}
        players={{
          ...state.players,
          [player.id]: {
            ...player,
            resources: { ...player.resources, [RESOURCE_IDS.wood]: 2 },
          },
        }}
        playerColors={{ [TEST_PLAYER_IDS[0]]: '#2864c7' }}
        selectableTargets={[]}
        highlightedHexIds={[]}
        resourceFlyovers={[
          {
            id: 'ordinary-hand-update',
            source: { kind: 'BANK' },
            resourceId: RESOURCE_IDS.wood,
            delayMs: 0,
            targetPlayerId: TEST_PLAYER_IDS[0],
          },
        ]}
      />,
    );

    await waitFor(() => expect(rendererProbe.mounted).toBe(1));
    expect(rendererProbe.constructed).toBe(1);
    expect(rendererProbe.destroyed).toBe(0);

    view.rerender(<BoardViewport {...baseProps} board={{ ...state.board }} />);
    expect(rendererProbe.updated).toBe(0);

    view.rerender(
      <BoardViewport
        {...baseProps}
        board={{ ...state.board, robberHexId: hexId('visual-change') }}
      />,
    );
    await waitFor(() => expect(rendererProbe.updated).toBe(1));
    expect(rendererProbe.mounted).toBe(1);
    expect(rendererProbe.destroyed).toBe(0);
  });

  it('recreates the canvas only when renderer quality changes', async () => {
    const state = createTestGameState('ACTION_PHASE');
    const baseProps: BoardViewportProps = {
      board: state.board,
      players: state.players,
      knState: state.kn,
      showDebugIds: false,
      selectableTargets: [],
      highlightedHexIds: [],
      animatedTarget: null,
      robberMove: null,
      playerColors: { [TEST_PLAYER_IDS[0]]: '#2864c7' },
      onInspect: vi.fn(),
      onSelect: vi.fn(),
    };
    const view = render(<BoardViewport {...baseProps} graphicsQuality="HIGH" />);
    await waitFor(() => expect(rendererProbe.mounted).toBe(1));

    view.rerender(<BoardViewport {...baseProps} graphicsQuality="PERFORMANCE" />);
    await waitFor(() => expect(rendererProbe.mounted).toBe(2));

    expect(rendererProbe.constructed).toBe(2);
    expect(rendererProbe.destroyed).toBe(1);
  });

  it('updates only the renderer options when a hovered road chain is emphasized', async () => {
    const state = createTestGameState('ACTION_PHASE');
    const hoveredChain = [edgeId('chain-a'), edgeId('chain-b')];
    const baseProps: BoardViewportProps = {
      board: state.board,
      players: state.players,
      knState: state.kn,
      showDebugIds: false,
      selectableTargets: [],
      highlightedHexIds: [],
      animatedTarget: null,
      robberMove: null,
      playerColors: { [TEST_PLAYER_IDS[0]]: '#2864c7' },
      onInspect: vi.fn(),
      onSelect: vi.fn(),
    };
    const view = render(<BoardViewport {...baseProps} />);
    await waitFor(() => expect(rendererProbe.mounted).toBe(1));

    view.rerender(<BoardViewport {...baseProps} emphasizedEdgeIds={hoveredChain} />);

    await waitFor(() => expect(rendererProbe.updated).toBe(1));
    expect(rendererProbe.constructed).toBe(1);
    expect(rendererProbe.updatedBoards[0]).toBe(state.board);
    expect(rendererProbe.updatedOptions[0]).toMatchObject({ emphasizedEdgeIds: hoveredChain });
  });

  it('forwards a unique event key when the same number-token pair is swapped again', async () => {
    const state = createTestGameState('ACTION_PHASE');
    const swap = [hexId('swap-a'), hexId('swap-b')] as const;
    const baseProps: BoardViewportProps = {
      board: state.board,
      players: state.players,
      knState: state.kn,
      showDebugIds: false,
      selectableTargets: [],
      highlightedHexIds: [],
      animatedTarget: null,
      robberMove: null,
      playerColors: { [TEST_PLAYER_IDS[0]]: '#2864c7' },
      onInspect: vi.fn(),
      onSelect: vi.fn(),
    };
    const view = render(<BoardViewport {...baseProps} />);
    await waitFor(() => expect(rendererProbe.mounted).toBe(1));

    view.rerender(
      <BoardViewport {...baseProps} numberTokenSwap={swap} numberTokenSwapKey="swap-one" />,
    );
    await waitFor(() => expect(rendererProbe.updated).toBe(1));
    view.rerender(
      <BoardViewport {...baseProps} numberTokenSwap={swap} numberTokenSwapKey="swap-two" />,
    );
    await waitFor(() => expect(rendererProbe.updated).toBe(2));

    expect(rendererProbe.updatedOptions).toMatchObject([
      { numberTokenSwap: swap, numberTokenSwapKey: 'swap-one' },
      { numberTokenSwap: swap, numberTokenSwapKey: 'swap-two' },
    ]);
  });

  it('passes fresh vertex occupancy to the renderer when a Knight is placed', async () => {
    const state = createTestGameState('ACTION_PHASE');
    const player = state.players[TEST_PLAYER_IDS[0]]!;
    const targetVertexId = vertexId('visible-new-knight-vertex');
    const vertex: BoardState['vertices'][string] = {
      id: targetVertexId,
      adjacentHexIds: [],
      connectedEdgeIds: [],
      adjacentVertexIds: [],
      building: null,
      knightId: null,
      portId: null,
    };
    const board: BoardState = {
      ...state.board,
      vertices: { ...state.board.vertices, [targetVertexId]: vertex },
    };
    const placedKnight: KnightState = {
      id: knightId('visible-new-knight'),
      ownerId: player.id,
      vertexId: targetVertexId,
      level: 1,
      active: false,
      placedTurn: state.turn.turnNumber,
      activeSinceTurn: null,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    const baseProps: BoardViewportProps = {
      board,
      players: state.players,
      knState: state.kn,
      showDebugIds: false,
      selectableTargets: [],
      highlightedHexIds: [],
      animatedTarget: null,
      robberMove: null,
      playerColors: { [player.id]: '#2864c7' },
      onInspect: vi.fn(),
      onSelect: vi.fn(),
    };
    const view = render(<BoardViewport {...baseProps} />);
    await waitFor(() => expect(rendererProbe.mounted).toBe(1));

    view.rerender(
      <BoardViewport
        {...baseProps}
        board={{
          ...board,
          vertices: {
            ...board.vertices,
            [targetVertexId]: { ...vertex, knightId: placedKnight.id },
          },
        }}
        players={{
          ...state.players,
          [player.id]: { ...player, knights: [...player.knights, placedKnight] },
        }}
      />,
    );

    await waitFor(() => expect(rendererProbe.updated).toBe(1));
    const updatedBoard = rendererProbe.updatedBoards[0] as BoardState;
    expect(updatedBoard.vertices[targetVertexId]?.knightId).toBe(placedKnight.id);
  });

  it('announces readiness only after the renderer has mounted', async () => {
    const state = createTestGameState('ACTION_PHASE');
    const onReady = vi.fn();
    const view = render(
      <BoardViewport
        board={state.board}
        players={state.players}
        knState={state.kn}
        showDebugIds={false}
        selectableTargets={[]}
        highlightedHexIds={[]}
        animatedTarget={null}
        robberMove={null}
        playerColors={{ [TEST_PLAYER_IDS[0]]: '#2864c7' }}
        onReady={onReady}
        onInspect={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(onReady).not.toHaveBeenCalled();
    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    view.rerender(
      <BoardViewport
        board={state.board}
        players={state.players}
        knState={state.kn}
        showDebugIds={false}
        selectableTargets={[]}
        highlightedHexIds={[]}
        animatedTarget={null}
        robberMove={null}
        playerColors={{ [TEST_PLAYER_IDS[0]]: '#2864c7' }}
        onReady={onReady}
        onInspect={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('provides visible controls for zooming and refitting the board', async () => {
    const user = userEvent.setup();
    const state = createTestGameState('ACTION_PHASE');
    render(
      <BoardViewport
        board={state.board}
        players={state.players}
        knState={state.kn}
        showDebugIds={false}
        selectableTargets={[]}
        highlightedHexIds={[]}
        animatedTarget={null}
        robberMove={null}
        playerColors={{ [TEST_PLAYER_IDS[0]]: '#2864c7' }}
        onInspect={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => expect(rendererProbe.mounted).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Zoom board in' }));
    await user.click(screen.getByRole('button', { name: 'Zoom board out' }));
    await user.click(screen.getByRole('button', { name: 'Fit screen' }));

    expect(rendererProbe.zoomFactors).toEqual([1.22, 0.82]);
    expect(rendererProbe.fitCalls).toBe(1);
  });
});
