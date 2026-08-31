import { useMemo, useState } from 'react';

import {
  DEFAULT_PLAYER_AVATAR_ID,
  PLAYER_AVATARS,
  type PlayerAvatarId,
} from '../../engine/content/avatars';
import { PLAYER_COLORS } from '../../engine/content/colors';
import type { ColorId } from '../../engine/core/ids';
import { Modal } from '../components/Modal';
import { getPlayerAvatarImageSrc } from '../components/player-avatar-assets';

interface ProfileGalleryModalProps {
  readonly open: boolean;
  readonly playerName: string;
  readonly avatarId?: PlayerAvatarId | undefined;
  readonly colorId: ColorId;
  readonly unavailableColorIds?: readonly ColorId[];
  readonly errorMessage?: string | null | undefined;
  readonly onClose: () => void;
  readonly onChange: (avatarId: PlayerAvatarId, colorId: ColorId) => void;
}

export function ProfileGalleryModal({
  open,
  playerName,
  avatarId,
  colorId,
  unavailableColorIds = [],
  errorMessage = null,
  onClose,
  onChange,
}: ProfileGalleryModalProps) {
  if (!open) return null;
  return (
    <ProfileGalleryForm
      playerName={playerName}
      avatarId={avatarId ?? DEFAULT_PLAYER_AVATAR_ID}
      colorId={colorId}
      unavailableColorIds={unavailableColorIds}
      errorMessage={errorMessage}
      onClose={onClose}
      onChange={onChange}
    />
  );
}

type ProfileGalleryFormProps = Omit<ProfileGalleryModalProps, 'open' | 'avatarId'> & {
  readonly avatarId: PlayerAvatarId;
};

function ProfileGalleryForm({
  playerName,
  avatarId,
  colorId,
  unavailableColorIds,
  errorMessage,
  onClose,
  onChange,
}: ProfileGalleryFormProps) {
  const [selectedAvatarId, setSelectedAvatarId] = useState(avatarId);
  const [selectedColorId, setSelectedColorId] = useState(colorId);
  const unavailableColors = useMemo(() => new Set(unavailableColorIds), [unavailableColorIds]);

  return (
    <Modal
      open
      className="modal--wide profile-gallery-modal"
      title={`${playerName}’s profile`}
      description="Choose a preset portrait and player color. Changes apply immediately."
      closeLabel="Close profile gallery"
      onClose={onClose}
    >
      <section className="profile-gallery" aria-labelledby="profile-gallery-portraits">
        <header>
          <div>
            <strong id="profile-gallery-portraits">Preset portraits</strong>
            <small>Selected portraits appear in the lobby and throughout the match.</small>
          </div>
          <span>{PLAYER_AVATARS.length} available</span>
        </header>
        <div className="profile-gallery__portraits">
          {PLAYER_AVATARS.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              className={selectedAvatarId === avatar.id ? 'is-selected' : ''}
              aria-label={`Choose ${avatar.displayName} profile picture`}
              aria-pressed={selectedAvatarId === avatar.id}
              data-modal-autofocus={selectedAvatarId === avatar.id ? true : undefined}
              onClick={() => {
                if (avatar.id === selectedAvatarId) return;
                setSelectedAvatarId(avatar.id);
                onChange(avatar.id, selectedColorId);
              }}
            >
              <img
                src={getPlayerAvatarImageSrc(avatar.id)}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span>
                <strong>{avatar.displayName}</strong>
              </span>
              <i aria-hidden="true">✓</i>
            </button>
          ))}
        </div>
      </section>

      <fieldset className="profile-gallery__colors">
        <legend>Player color</legend>
        <div>
          {PLAYER_COLORS.map((color) => {
            const unavailable = unavailableColors.has(color.id);
            return (
              <button
                key={color.id}
                type="button"
                aria-label={`Choose ${color.displayName}`}
                aria-pressed={selectedColorId === color.id}
                disabled={unavailable}
                title={unavailable ? `${color.displayName} is already taken` : color.displayName}
                onClick={() => {
                  if (color.id === selectedColorId) return;
                  setSelectedColorId(color.id);
                  onChange(selectedAvatarId, color.id);
                }}
              >
                <span style={{ backgroundColor: color.hex }} />
                <small>{color.displayName}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      {errorMessage === null ? null : (
        <p className="profile-gallery__error" role="alert">
          {errorMessage}
        </p>
      )}
    </Modal>
  );
}
