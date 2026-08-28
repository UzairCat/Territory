import { PLAYER_COLORS } from '../../engine/content/colors';
import type { GameState } from '../../engine/core/game-state';
import { calculateScoreBreakdown } from '../../engine/rules/scoring-rules';
import { orderedPlayerIds } from '../../engine/rules/setup-rules';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface VictoryModalProps {
  readonly state: GameState;
  readonly rematchError: string | null;
  readonly onRematch: () => void;
  readonly onLobby: () => void;
  readonly onMenu: () => void;
}

export function VictoryModal({
  state,
  rematchError,
  onRematch,
  onLobby,
  onMenu,
}: VictoryModalProps) {
  const winner = state.winnerId === null ? undefined : state.players[state.winnerId];
  const winnerColor = PLAYER_COLORS.find((color) => color.id === winner?.colorId);
  if (winner === undefined) return null;

  return (
    <Modal
      open
      title={`${winner.name} wins Territory!`}
      description={`First to ${state.config.victoryTarget} victory points.`}
      dismissible={false}
      onClose={() => undefined}
      backdropClassName="victory-backdrop"
      className="modal--wide"
    >
      <div className="victory-content">
        <div
          className="victory-emblem"
          style={{ borderColor: winnerColor?.hex }}
          aria-hidden="true"
        >
          ★
        </div>
        <div className="victory-scores">
          {orderedPlayerIds(state).map((playerId) => {
            const player = state.players[playerId];
            if (player === undefined) return null;
            const score = calculateScoreBreakdown(state, playerId);
            return (
              <article key={playerId} className={playerId === state.winnerId ? 'winner' : ''}>
                <header>
                  <strong>{player.name}</strong>
                  <span>{score.total} VP</span>
                </header>
                <small>
                  {state.kn === null ? (
                    <>
                      Buildings {score.buildings} · Longest road {score.longestRoad} · Largest force{' '}
                      {score.largestForce} · Victory cards {score.progressCards}
                    </>
                  ) : (
                    <>
                      Buildings {score.buildings} · Longest road {score.longestRoad} · Defender,
                      Merchant, Metropolis & revealed cards {score.progressCards}
                    </>
                  )}
                </small>
              </article>
            );
          })}
        </div>
        {rematchError === null ? null : (
          <p className="modal-error" role="alert">
            {rematchError}
          </p>
        )}
        <footer className="victory-actions">
          <Button data-modal-autofocus variant="primary" onClick={onRematch}>
            Rematch · new board
          </Button>
          <Button variant="secondary" onClick={onLobby}>
            Return to lobby
          </Button>
          <Button variant="ghost" onClick={onMenu}>
            Main menu
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
