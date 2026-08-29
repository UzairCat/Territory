import type { GamePhase, TurnState } from '../../engine/core/game-state';
import { COMMODITY_IDS } from '../../engine/content/commodities';
import { ResourceArtwork } from './ResourceArtwork';

const PIP_POSITIONS: Readonly<Record<number, readonly number[]>> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

interface DicePanelProps {
  readonly phase: GamePhase;
  readonly dice: readonly [number, number] | null;
  readonly onRoll: () => void;
  readonly knDice?: TurnState['knDice'];
  readonly kNMode?: boolean;
  readonly disabled?: boolean;
}

function DieFace({
  value,
  red = false,
}: {
  readonly value: number | null;
  readonly red?: boolean;
}) {
  if (value === null) {
    return <span className={`die-face die-face--unrolled ${red ? 'die-face--red' : ''}`}>?</span>;
  }

  const visiblePips = PIP_POSITIONS[value] ?? [];

  return (
    <span className={`die-face ${red ? 'die-face--red' : ''}`}>
      {Array.from({ length: 9 }, (_, position) => (
        <span
          className={`die-pip ${visiblePips.includes(position) ? 'die-pip--visible' : ''}`}
          key={position}
        />
      ))}
    </span>
  );
}

function EventDieFace({
  event,
}: {
  readonly event: NonNullable<TurnState['knDice']>['event'] | null;
}) {
  return (
    <span
      className={`die-face event-die event-die--${event?.toLocaleLowerCase() ?? 'unrolled'}`}
      title={event === null ? 'Event die not rolled' : `Event die: ${event.toLocaleLowerCase()}`}
    >
      {event === null ? (
        <strong>?</strong>
      ) : event === 'BARBARIAN' ? (
        <strong className="event-die__ship">⛵</strong>
      ) : (
        <span className="event-die__commodity" aria-hidden="true">
          <ResourceArtwork
            resourceId={
              event === 'SCIENCE'
                ? COMMODITY_IDS.paper
                : event === 'TRADE'
                  ? COMMODITY_IDS.cloth
                  : COMMODITY_IDS.coin
            }
          />
        </span>
      )}
      {event === null ? null : <small>{event}</small>}
    </span>
  );
}

export function DicePanel({
  phase,
  dice,
  onRoll,
  knDice = null,
  kNMode = false,
  disabled = false,
}: DicePanelProps) {
  const canRoll = phase === 'WAITING_FOR_ROLL' && !disabled;

  return (
    <button
      type="button"
      className={`dice-panel ${kNMode ? 'dice-panel--kn' : ''} ${canRoll ? 'dice-panel--ready' : ''}`}
      aria-label={
        canRoll
          ? 'Roll dice'
          : dice === null
            ? 'Dice are not ready to roll'
            : `Dice result: ${dice[0]} and ${dice[1]}${kNMode ? `, Event die ${knDice?.event ?? 'unrolled'}` : ''}`
      }
      disabled={!canRoll}
      onClick={onRoll}
    >
      <span className="dice-faces" key={dice?.join('-') ?? 'unrolled'} aria-hidden="true">
        <DieFace value={dice?.[0] ?? null} red={kNMode} />
        <DieFace value={dice?.[1] ?? null} />
        {kNMode ? <EventDieFace event={knDice?.event ?? null} /> : null}
      </span>
    </button>
  );
}
