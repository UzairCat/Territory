// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TurnTimer } from '../../src/ui/game/TurnTimer';

describe('turn timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('counts down, flashes and ticks for the final ten seconds, then expires once', () => {
    const onExpire = vi.fn();
    const onUrgentTick = vi.fn();

    render(
      <TurnTimer
        durationSeconds={12}
        prompt="Roll Dice"
        boostSignal="initial"
        onExpire={onExpire}
        onUrgentTick={onUrgentTick}
      />,
    );

    expect(screen.getByText('00:12')).toBeInTheDocument();
    void act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByText('00:10')).toBeInTheDocument();
    expect(screen.getByText('00:10').closest('.turn-timer-wrap')).toHaveClass(
      'turn-timer-wrap--urgent',
    );
    expect(onUrgentTick).toHaveBeenCalledTimes(1);

    for (let second = 0; second < 10; second += 1) {
      void act(() => vi.advanceTimersByTime(1_000));
    }
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(onUrgentTick).toHaveBeenCalledTimes(10);
    expect(onExpire).toHaveBeenCalledTimes(1);

    void act(() => vi.advanceTimersByTime(5_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('boosts a running timer below twenty seconds without extending a longer timer', () => {
    const common = {
      durationSeconds: 30,
      prompt: 'Your Turn',
      onExpire: vi.fn(),
      onUrgentTick: vi.fn(),
    };
    const { rerender } = render(<TurnTimer {...common} boostSignal="action-0" />);

    void act(() => vi.advanceTimersByTime(15_000));
    expect(screen.getByText('00:15')).toBeInTheDocument();
    rerender(<TurnTimer {...common} boostSignal="action-1" />);
    expect(screen.getByText('00:20')).toBeInTheDocument();

    void act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText('00:19')).toBeInTheDocument();
    rerender(<TurnTimer {...common} boostSignal="action-2" />);
    expect(screen.getByText('00:20')).toBeInTheDocument();

    const longer = render(
      <TurnTimer {...common} durationSeconds={30} prompt="Other Timer" boostSignal="long-0" />,
    );
    void act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByLabelText('Other Timer: 25 seconds remaining')).toBeInTheDocument();
    longer.rerender(
      <TurnTimer {...common} durationSeconds={30} prompt="Other Timer" boostSignal="long-1" />,
    );
    expect(screen.getByLabelText('Other Timer: 25 seconds remaining')).toBeInTheDocument();
  });

  it('freezes its remaining time while the match is paused and resumes from the same second', () => {
    const common = {
      durationSeconds: 12,
      prompt: 'Your Turn',
      boostSignal: 'none',
      onExpire: vi.fn(),
      onUrgentTick: vi.fn(),
    };
    const { rerender } = render(<TurnTimer {...common} paused={false} />);

    void act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByText('00:10')).toBeInTheDocument();
    rerender(<TurnTimer {...common} paused />);
    void act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByText('00:10')).toBeInTheDocument();
    expect(common.onExpire).not.toHaveBeenCalled();

    rerender(<TurnTimer {...common} paused={false} />);
    void act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText('00:09')).toBeInTheDocument();
  });
});
