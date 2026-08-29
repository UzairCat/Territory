import { getPlayerAvatar, type PlayerAvatarId } from '../../engine/content/avatars';
import { getPlayerAvatarImageSrc } from './player-avatar-assets';

interface PlayerAvatarProps {
  readonly playerName: string;
  readonly avatarId?: PlayerAvatarId | undefined;
  readonly editable?: boolean;
  readonly className?: string;
  readonly onOpenGallery?: () => void;
}

export function PlayerAvatar({
  playerName,
  avatarId,
  editable = false,
  className = '',
  onOpenGallery,
}: PlayerAvatarProps) {
  const avatar = getPlayerAvatar(avatarId);
  return (
    <span
      className={['preset-player-avatar', editable ? 'is-editable' : '', className]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${playerName} profile picture: ${avatar.displayName}`}
    >
      <img src={getPlayerAvatarImageSrc(avatar.id)} alt="" decoding="async" />
      {!editable || onOpenGallery === undefined ? null : (
        <button
          type="button"
          className="preset-player-avatar__gallery"
          aria-label={`Open profile gallery for ${playerName}`}
          title="Choose profile picture"
          onClick={onOpenGallery}
        >
          <span aria-hidden="true">▦</span>
          <small>Gallery</small>
        </button>
      )}
    </span>
  );
}
