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

  it('adds fifteen seconds per action to short and long timers', () => {
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
    expect(screen.getByText('00:30')).toBeInTheDocument();

    void act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText('00:29')).toBeInTheDocument();
    rerender(<TurnTimer {...common} boostSignal="action-2" />);
    expect(screen.getByText('00:44')).toBeInTheDocument();

    const longer = render(
      <TurnTimer {...common} durationSeconds={30} prompt="Other Timer" boostSignal="long-0" />,
    );
    void act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByLabelText('Other Timer: 25 seconds remaining')).toBeInTheDocument();
    longer.rerender(
      <TurnTimer {...common} durationSeconds={30} prompt="Other Timer" boostSignal="long-1" />,
    );
    expect(screen.getByLabelText('Other Timer: 40 seconds remaining')).toBeInTheDocument();
  });

  it('does not add a second bonus to an authoritative online deadline', () => {
    const props = {
      durationSeconds: 60,
      prompt: 'Online turn',
      onExpire: vi.fn(),
      onUrgentTick: vi.fn(),
    };
    const deadline = Date.now() + 40_000;
    const view = render(<TurnTimer {...props} boostSignal="before" deadlineAt={deadline} />);
    view.rerender(<TurnTimer {...props} boostSignal="after" deadlineAt={deadline + 15_000} />);
    void act(() => vi.advanceTimersByTime(250));
    expect(screen.getByLabelText('Online turn: 55 seconds remaining')).toBeInTheDocument();
    view.rerender(<TurnTimer {...props} boostSignal="after" deadlineAt={deadline + 15_000} />);
    expect(screen.getByLabelText('Online turn: 55 seconds remaining')).toBeInTheDocument();
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

  it('uses the server clock sample so a skewed browser reaches zero with the server', () => {
    vi.setSystemTime(new Date('2026-08-29T12:00:00.000Z'));
    const browserNow = Date.now();
    const serverClockOffsetMs = 5_000;
    const onExpire = vi.fn();

    render(
      <TurnTimer
        durationSeconds={60}
        prompt="Server Turn"
        boostSignal="none"
        deadlineAt={browserNow + serverClockOffsetMs + 10_000}
        clockOffsetMs={serverClockOffsetMs}
        onExpire={onExpire}
        onUrgentTick={vi.fn()}
      />,
    );

    expect(screen.getByText('00:10')).toBeInTheDocument();
    void act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('00:05')).toBeInTheDocument();
    expect(onExpire).not.toHaveBeenCalled();
    void act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
