import type { GameState, KNBarbarianAttackSummary } from '../../engine/core/game-state';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface BarbarianAttackModalProps {
  readonly state: GameState;
  readonly summary: KNBarbarianAttackSummary;
  readonly onContinue: () => void;
}

export function BarbarianAttackModal({ state, summary, onContinue }: BarbarianAttackModalProps) {
  const margin = summary.defenderStrength - summary.barbarianStrength;
  return (
    <Modal
      open
      title={summary.defended ? 'The island is defended!' : 'The barbarians broke through'}
      description="The Event die attack resolves before the numeric dice."
      dismissible={false}
      onClose={() => undefined}
      className={`barbarian-attack-modal ${summary.defended ? 'barbarian-attack-modal--defended' : 'barbarian-attack-modal--defeated'}`}
    >
      <div className="barbarian-showdown" aria-label="Barbarian attack comparison">
        <section>
          <span className="barbarian-showdown__icon" aria-hidden="true">
            ⛵
          </span>
          <small>Barbarian strength</small>
          <strong>{summary.barbarianStrength}</strong>
          <div className="barbarian-showdown__meter">
            <i style={{ width: `${Math.min(100, summary.barbarianStrength * 12.5)}%` }} />
          </div>
        </section>
        <b aria-hidden="true">VS</b>
        <section>
          <span className="barbarian-showdown__icon" aria-hidden="true">
            ♞
          </span>
          <small>Active Knight strength</small>
          <strong>{summary.defenderStrength}</strong>
          <div className="barbarian-showdown__meter">
            <i style={{ width: `${Math.min(100, summary.defenderStrength * 12.5)}%` }} />
          </div>
        </section>
      </div>

      <div className="barbarian-contributions">
        <h3>Defense contributions</h3>
        <div>
          {state.config.players
            .slice()
            .sort((first, second) => first.order - second.order)
            .map((config) => {
              const player = state.players[config.id];
              const contribution = summary.contributions[config.id] ?? 0;
              const awarded = summary.defenderAwardPlayerId === config.id;
              const affected = summary.affectedPlayerIds.includes(config.id);
              return (
                <article
                  key={config.id}
                  className={`${awarded ? 'is-awarded' : ''} ${affected ? 'is-affected' : ''}`}
                >
                  <span aria-hidden="true">♞</span>
                  <div>
                    <strong>{player?.name ?? 'Player'}</strong>
                    <small>
                      {awarded
                        ? '+1 Defender point'
                        : affected
                          ? 'Must lose a vulnerable City'
                          : 'Defense contribution'}
                    </small>
                  </div>
                  <b>{contribution}</b>
                </article>
              );
            })}
        </div>
      </div>

      <p className="barbarian-result-copy">
        {summary.barbarianStrength === 0
          ? 'There were no vulnerable Cities to attack. All Knights still deactivate and the tracker resets.'
          : summary.defended
            ? margin === 0
              ? 'The Knights matched the barbarian strength exactly. Every Knight now deactivates.'
              : `The Knights won by ${margin}. Every Knight now deactivates.`
            : `The island fell short by ${Math.abs(margin)}. The lowest eligible defenders must downgrade a City.`}
      </p>
      <footer className="modal__actions">
        <Button data-modal-autofocus variant="primary" onClick={onContinue}>
          Continue resolution
        </Button>
      </footer>
    </Modal>
  );
}
