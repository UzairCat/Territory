// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardViewport, type BoardViewportProps } from '../../src/board-renderer/BoardViewport';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { hexId } from '../../src/engine/core/ids';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

const rendererProbe = vi.hoisted(() => ({ constructed: 0, mounted: 0, updated: 0, destroyed: 0 }));

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

    update(): void {
      rendererProbe.updated += 1;
    }

    destroy(): void {
      rendererProbe.destroyed += 1;
    }

    fitBoard(): void {}

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
});
