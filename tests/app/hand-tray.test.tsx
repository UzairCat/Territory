// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { PROGRESS_CARD_IDS } from '../../src/engine/content/progress-cards';
import { resourceBundle } from '../../src/engine/content/types';
import { cardInstanceId } from '../../src/engine/core/ids';
import { HandTray } from '../../src/ui/game/HandTray';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

describe('active player hand', () => {
  afterEach(cleanup);

  it('shows every copy in a five-card stack', () => {
    const original = createTestGameState('ACTION_PHASE');
    const originalPlayer = original.players[TEST_PLAYER_IDS[0]]!;
    const player = {
      ...originalPlayer,
      resources: resourceBundle([[RESOURCE_IDS.livestock, 5]]),
    };
    const state = {
      ...original,
      players: { ...original.players, [player.id]: player },
    };

    render(
      <HandTray
        state={state}
        player={player}
        animateResources={false}
        onPlayProgressCard={vi.fn()}
      />,
    );

    const stack = screen.getByLabelText('Livestock: 5 cards');
    expect(stack.querySelectorAll('.resource-card-stack__layer')).toHaveLength(4);
    expect(Number.parseFloat(stack.style.getPropertyValue('--stack-width'))).toBeGreaterThan(4.8);
  });

  it('warns when the visible hand exceeds its configured safe limit', () => {
    const original = createTestGameState('ACTION_PHASE');
    const originalPlayer = original.players[TEST_PLAYER_IDS[0]]!;
    const player = {
      ...originalPlayer,
      resources: resourceBundle([[RESOURCE_IDS.wood, 8]]),
    };
    const state = {
      ...original,
      players: { ...original.players, [player.id]: player },
    };

    const view = render(
      <HandTray
        state={state}
        player={player}
        animateResources={false}
        onPlayProgressCard={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Unsafe 8/7');
    expect(screen.getByLabelText('Active player resource hand')).toHaveClass('hand-tray--unsafe');

    const safeState = {
      ...state,
      config: {
        ...state.config,
        rules: { ...state.config.rules, discardThreshold: 8 },
      },
    };
    view.rerender(
      <HandTray
        state={safeState}
        player={player}
        animateResources={false}
        onPlayProgressCard={vi.fn()}
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Active player resource hand')).not.toHaveClass(
      'hand-tray--unsafe',
    );
  });

  it('explains a disabled progress card on hover', () => {
    const cardId = cardInstanceId('hover-road-building');
    const original = createTestGameState('ACTION_PHASE');
    const originalPlayer = original.players[TEST_PLAYER_IDS[0]]!;
    const player = { ...originalPlayer, progressCardIds: [cardId] };
    const state = {
      ...original,
      turn: { ...original.turn, turnNumber: 3 },
      players: { ...original.players, [player.id]: player },
      progressCards: {
        [cardId]: {
          instanceId: cardId,
          definitionId: PROGRESS_CARD_IDS.roadBuilding,
          ownerId: player.id,
          purchasedTurn: 3,
          playedTurn: null,
        },
      },
    };

    render(
      <HandTray
        state={state}
        player={player}
        animateResources={false}
        onPlayProgressCard={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Play Road Building' });
    expect(button).toBeDisabled();
    const anchor = button.closest<HTMLElement>('[data-progress-card-anchor]');
    if (anchor === null) throw new Error('Progress card did not render its hover anchor.');

    fireEvent.mouseEnter(anchor);
    const tooltip = screen.getByRole('tooltip');
    expect(within(tooltip).getByText('Road Building')).toBeInTheDocument();
    expect(tooltip).toHaveTextContent('Place up to two legal connected Roads');
    expect(tooltip).toHaveTextContent('Playable from your next turn.');

    fireEvent.mouseLeave(anchor);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps a resolved Year of Plenty tooltip closed until the pointer leaves its card', () => {
    const cardId = cardInstanceId('resolved-year-of-plenty');
    const original = createTestGameState('ACTION_PHASE');
    const originalPlayer = original.players[TEST_PLAYER_IDS[0]]!;
    const player = { ...originalPlayer, progressCardIds: [cardId] };
    const state = {
      ...original,
      turn: { ...original.turn, turnNumber: 3 },
      players: { ...original.players, [player.id]: player },
      progressCards: {
        [cardId]: {
          instanceId: cardId,
          definitionId: PROGRESS_CARD_IDS.yearOfPlenty,
          ownerId: player.id,
          purchasedTurn: 2,
          playedTurn: null,
        },
      },
    };
    const view = render(
      <HandTray
        state={state}
        player={player}
        animateResources={false}
        tooltipResetSignal="before-resolution"
        onPlayProgressCard={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: 'Play Year of Plenty' });
    const anchor = button.closest<HTMLElement>('[data-progress-card-anchor]');
    if (anchor === null) throw new Error('Year of Plenty did not render its hover anchor.');

    fireEvent.mouseEnter(anchor);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year of Plenty');

    view.rerender(
      <HandTray
        state={state}
        player={player}
        animateResources={false}
        tooltipResetSignal="after-resolution"
        onPlayProgressCard={vi.fn()}
      />,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.mouseEnter(anchor);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(anchor);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.blur(anchor);
    fireEvent.focus(anchor);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year of Plenty');
    fireEvent.blur(anchor);

    fireEvent.mouseLeave(anchor);
    fireEvent.mouseEnter(anchor);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year of Plenty');
  });

  it('stacks matching progress cards while keeping a playable copy available', () => {
    const cardIds = [
      cardInstanceId('stacked-monopoly-one'),
      cardInstanceId('stacked-monopoly-two'),
      cardInstanceId('stacked-monopoly-three'),
    ] as const;
    const original = createTestGameState('ACTION_PHASE');
    const originalPlayer = original.players[TEST_PLAYER_IDS[0]]!;
    const player = { ...originalPlayer, progressCardIds: cardIds };
    const state = {
      ...original,
      turn: { ...original.turn, turnNumber: 3 },
      players: { ...original.players, [player.id]: player },
      progressCards: Object.fromEntries(
        cardIds.map((instanceId, index) => [
          instanceId,
          {
            instanceId,
            definitionId: PROGRESS_CARD_IDS.monopoly,
            ownerId: player.id,
            purchasedTurn: index === 2 ? 3 : 2,
            playedTurn: null,
          },
        ]),
      ),
    };
    const onPlayProgressCard = vi.fn();

    render(
      <HandTray
        state={state}
        player={player}
        animateResources={false}
        onPlayProgressCard={onPlayProgressCard}
      />,
    );

    const playButtons = screen.getAllByRole('button', { name: 'Play Monopoly' });
    expect(playButtons).toHaveLength(1);
    const stack = playButtons[0]?.closest('.progress-hand-card-stack');
    expect(stack?.querySelectorAll('.progress-hand-card-stack__layer')).toHaveLength(2);
    expect(within(stack as HTMLElement).getByLabelText('3 copies')).toHaveTextContent('3');
    fireEvent.click(playButtons[0]!);
    expect(onPlayProgressCard).toHaveBeenCalledWith(cardIds[0]);
  });
});
