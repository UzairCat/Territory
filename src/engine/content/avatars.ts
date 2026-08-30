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
  { id: 'gmcaleb', displayName: 'GM Caleb' },
  { id: 'goofymussel', displayName: 'Goofy Mussel' },
  { id: 'kevin', displayName: 'Kevin' },
  { id: 'uzair', displayName: 'Uzair' },
] as const;

export type PlayerAvatarId = (typeof PLAYER_AVATARS)[number]['id'];

export const DEFAULT_PLAYER_AVATAR_ID: PlayerAvatarId = 'cartographer';

export function randomAvailablePlayerAvatarId(
  usedAvatarIds: readonly (PlayerAvatarId | undefined)[],
  randomValue: number,
): PlayerAvatarId {
  const used = new Set(usedAvatarIds.filter((avatarId) => avatarId !== undefined));
  const available = PLAYER_AVATARS.filter((avatar) => !used.has(avatar.id));
  const pool = available.length > 0 ? available : PLAYER_AVATARS;
  const normalizedRandom = Number.isFinite(randomValue) ? ((randomValue % 1) + 1) % 1 : 0;
  return pool[Math.floor(normalizedRandom * pool.length)]!.id;
}

export function isPlayerAvatarId(value: string): value is PlayerAvatarId {
  return PLAYER_AVATARS.some((avatar) => avatar.id === value);
}

export function getPlayerAvatar(avatarId: PlayerAvatarId | undefined) {
  return (
    PLAYER_AVATARS.find((avatar) => avatar.id === avatarId) ??
    PLAYER_AVATARS.find((avatar) => avatar.id === DEFAULT_PLAYER_AVATAR_ID)!
  );
}
