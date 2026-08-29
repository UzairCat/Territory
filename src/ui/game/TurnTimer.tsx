import { useEffect, useRef, useState } from 'react';

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function remainingFor(
  deadlineAt: number | null,
  durationSeconds: number,
  clockOffsetMs: number,
): number {
  return deadlineAt === null
    ? durationSeconds
    : Math.max(0, Math.ceil((deadlineAt - (Date.now() + clockOffsetMs)) / 1_000));
}

interface TurnTimerProps {
  readonly durationSeconds: number;
  readonly prompt: string;
  readonly boostSignal: string;
  readonly paused?: boolean;
  readonly deadlineAt?: number | null;
  readonly clockOffsetMs?: number;
  readonly onExpire: () => void;
  readonly onUrgentTick: () => void;
}

export function TurnTimer({
  durationSeconds,
  prompt,
  boostSignal,
  paused = false,
  deadlineAt = null,
  clockOffsetMs = 0,
  onExpire,
  onUrgentTick,
}: TurnTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    remainingFor(deadlineAt, durationSeconds, clockOffsetMs),
  );
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  const onUrgentTickRef = useRef(onUrgentTick);
  const previousBoostRef = useRef(boostSignal);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    onUrgentTickRef.current = onUrgentTick;
  }, [onUrgentTick]);

  useEffect(() => {
    if (paused) return undefined;
    const interval = globalThis.setInterval(
      () => {
        setRemainingSeconds((current) =>
          deadlineAt === null
            ? Math.max(0, current - 1)
            : remainingFor(deadlineAt, durationSeconds, clockOffsetMs),
        );
      },
      deadlineAt === null ? 1_000 : 250,
    );
    return () => globalThis.clearInterval(interval);
  }, [clockOffsetMs, deadlineAt, durationSeconds, paused]);

  useEffect(() => {
    if (previousBoostRef.current === boostSignal) return;
    previousBoostRef.current = boostSignal;
    setRemainingSeconds((current) => (current > 0 && current < 20 ? 20 : current));
  }, [boostSignal]);

  useEffect(() => {
    if (remainingSeconds === 0) {
      if (!expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
      return;
    }
    expiredRef.current = false;
    if (remainingSeconds <= 10) onUrgentTickRef.current();
  }, [remainingSeconds]);

  const urgent = remainingSeconds > 0 && remainingSeconds <= 10;

  return (
    <div
      className={`turn-timer-wrap ${urgent ? 'turn-timer-wrap--urgent' : ''}`}
      aria-live="polite"
    >
      <strong className="turn-timer-prompt">{prompt}</strong>
      <time className="turn-timer" aria-label={`${prompt}: ${remainingSeconds} seconds remaining`}>
        {formatRemaining(remainingSeconds)}
      </time>
    </div>
  );
}
