import type { CSSProperties } from 'react';

import { PLAYER_COLORS } from '../../engine/content/colors';
import type { LocalLobbyPlayer } from '../../app/lobby/lobby-model';
import { Button } from '../components/Button';
import { PlayerAvatar } from '../components/PlayerAvatar';

interface PlayerSlotProps {
  readonly index: number;
  readonly player: LocalLobbyPlayer | null;
  readonly canAdd: boolean;
  readonly onAdd: () => void;
  readonly onEdit: (player: LocalLobbyPlayer) => void;
  readonly onOpenProfile: (player: LocalLobbyPlayer) => void;
  readonly onRemove: (player: LocalLobbyPlayer) => void;
}

export function PlayerSlot({
  index,
  player,
  canAdd,
  onAdd,
  onEdit,
  onOpenProfile,
  onRemove,
}: PlayerSlotProps) {
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
    <li
      className="player-slot"
      style={{ '--seat-color': color?.hex ?? '#ffffff' } as CSSProperties}
    >
      <span className="player-slot__number">{index + 1}</span>
      <PlayerAvatar
        className="lobby-slot-avatar"
        playerName={player.name}
        avatarId={player.avatarId}
        editable
        onOpenGallery={() => onOpenProfile(player)}
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
