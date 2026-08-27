import { useMemo, useState } from 'react';

import { firstAvailableColorId, suggestPlayerName } from '../../app/lobby/lobby-model';
import type { LocalLobbyPlayer } from '../../app/lobby/lobby-model';
import { PLAYER_COLORS } from '../../engine/content/colors';
import type { ColorId } from '../../engine/core/ids';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface PlayerEditorModalProps {
  readonly open: boolean;
  readonly player: LocalLobbyPlayer | null;
  readonly players: readonly LocalLobbyPlayer[];
  readonly onClose: () => void;
  readonly onSave: (name: string, colorId: ColorId) => void;
}

export function PlayerEditorModal({
  open,
  player,
  players,
  onClose,
  onSave,
}: PlayerEditorModalProps) {
  if (!open) {
    return null;
  }

  return (
    <PlayerEditorForm
      key={player?.id ?? `new-player-${players.length}`}
      player={player}
      players={players}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

type PlayerEditorFormProps = Omit<PlayerEditorModalProps, 'open'>;

function PlayerEditorForm({ player, players, onClose, onSave }: PlayerEditorFormProps) {
  const [name, setName] = useState(player?.name ?? suggestPlayerName(players));
  const [selectedColorId, setSelectedColorId] = useState<ColorId | null>(
    player?.colorId ?? firstAvailableColorId(players),
  );

  const unavailableColors = useMemo(
    () =>
      new Set(
        players
          .filter((candidate) => candidate.id !== player?.id)
          .map((candidate) => candidate.colorId),
      ),
    [player?.id, players],
  );
  const errors = useMemo(() => {
    const nextErrors: string[] = [];
    const normalizedName = name.trim().toLocaleLowerCase();

    if (name.trim().length < 1 || name.trim().length > 20) {
      nextErrors.push('Name must contain 1–20 characters.');
    } else if (
      players.some(
        (candidate) =>
          candidate.id !== player?.id &&
          candidate.name.trim().toLocaleLowerCase() === normalizedName,
      )
    ) {
      nextErrors.push('That name is already in the lobby.');
    }

    if (selectedColorId === null || unavailableColors.has(selectedColorId)) {
      nextErrors.push('Choose an available color.');
    }

    return nextErrors;
  }, [name, player?.id, players, selectedColorId, unavailableColors]);

  return (
    <Modal
      open
      title={player === null ? 'Add local player' : 'Edit local player'}
      description="Names and colors must be unique in this lobby."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (errors.length === 0 && selectedColorId !== null) {
            onSave(name.trim(), selectedColorId);
          }
        }}
      >
        <label className="field" htmlFor="player-name">
          <span>Display name</span>
          <input
            id="player-name"
            data-modal-autofocus
            value={name}
            maxLength={20}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
          <small>{name.trim().length}/20 characters</small>
        </label>

        <fieldset className="color-picker">
          <legend>Player color and marker</legend>
          <div className="color-picker__options">
            {PLAYER_COLORS.map((color) => {
              const unavailable = unavailableColors.has(color.id);
              return (
                <button
                  key={color.id}
                  className="color-option"
                  type="button"
                  aria-label={`${color.displayName}, ${color.marker.toLocaleLowerCase()} marker`}
                  aria-pressed={selectedColorId === color.id}
                  disabled={unavailable}
                  onClick={() => setSelectedColorId(color.id)}
                >
                  <span
                    className={`player-marker player-marker--${color.marker.toLocaleLowerCase()}`}
                    style={{ backgroundColor: color.hex }}
                  />
                  <span>{color.displayName}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {errors.length === 0 ? null : (
          <ul className="form-errors" aria-live="polite">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <footer className="modal__actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={errors.length > 0}>
            {player === null ? 'Add player' : 'Save changes'}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
