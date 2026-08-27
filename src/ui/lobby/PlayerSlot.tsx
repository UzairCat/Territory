import { PLAYER_COLORS } from '../../engine/content/colors';
import type { LocalLobbyPlayer } from '../../app/lobby/lobby-model';
import { Button } from '../components/Button';

interface PlayerSlotProps {
  readonly index: number;
  readonly player: LocalLobbyPlayer | null;
  readonly canAdd: boolean;
  readonly onAdd: () => void;
  readonly onEdit: (player: LocalLobbyPlayer) => void;
  readonly onRemove: (player: LocalLobbyPlayer) => void;
}

export function PlayerSlot({ index, player, canAdd, onAdd, onEdit, onRemove }: PlayerSlotProps) {
  if (player === null) {
    return (
      <li className="player-slot player-slot--empty">
        <span className="player-slot__number">{index + 1}</span>
        {canAdd ? (
          <Button className="player-slot__add" variant="ghost" onClick={onAdd}>
            + Add local player
          </Button>
        ) : (
          <span className="player-slot__waiting">Empty slot</span>
        )}
      </li>
    );
  }

  const color = PLAYER_COLORS.find((entry) => entry.id === player.colorId);

  return (
    <li className="player-slot">
      <span className="player-slot__number">{index + 1}</span>
      <span
        className={`player-marker player-marker--${color?.marker.toLocaleLowerCase() ?? 'circle'}`}
        style={{ backgroundColor: color?.hex ?? '#ffffff' }}
        aria-hidden="true"
      />
      <span className="player-slot__identity">
        <strong>{player.name}</strong>
        <small>{color?.displayName ?? 'Unknown color'}</small>
      </span>
      <span className="player-slot__controls">
        <Button variant="ghost" onClick={() => onEdit(player)}>
          Edit
        </Button>
        <Button variant="danger" onClick={() => onRemove(player)}>
          Remove
        </Button>
      </span>
    </li>
  );
}
