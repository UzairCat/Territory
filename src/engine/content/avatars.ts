export const PLAYER_AVATARS = [
  {
    id: 'cartographer',
    displayName: 'Cartographer',
  },
  { id: 'navigator', displayName: 'Navigator' },
  { id: 'ranger', displayName: 'Ranger' },
  { id: 'merchant', displayName: 'Merchant' },
  { id: 'smith', displayName: 'Smith' },
  { id: 'scholar', displayName: 'Scholar' },
  { id: 'herbalist', displayName: 'Herbalist' },
  { id: 'courier', displayName: 'Courier' },
] as const;

export type PlayerAvatarId = (typeof PLAYER_AVATARS)[number]['id'];

export const DEFAULT_PLAYER_AVATAR_ID: PlayerAvatarId = 'cartographer';

export function isPlayerAvatarId(value: string): value is PlayerAvatarId {
  return PLAYER_AVATARS.some((avatar) => avatar.id === value);
}

export function getPlayerAvatar(avatarId: PlayerAvatarId | undefined) {
  return (
    PLAYER_AVATARS.find((avatar) => avatar.id === avatarId) ??
    PLAYER_AVATARS.find((avatar) => avatar.id === DEFAULT_PLAYER_AVATAR_ID)!
  );
}
