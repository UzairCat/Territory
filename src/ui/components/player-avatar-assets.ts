import cartographerImage from '../../assets/avatars/cartographer.png';
import courierImage from '../../assets/avatars/courier.png';
import herbalistImage from '../../assets/avatars/herbalist.png';
import merchantImage from '../../assets/avatars/merchant.png';
import navigatorImage from '../../assets/avatars/navigator.png';
import rangerImage from '../../assets/avatars/ranger.png';
import scholarImage from '../../assets/avatars/scholar.png';
import smithImage from '../../assets/avatars/smith.png';
import { DEFAULT_PLAYER_AVATAR_ID, type PlayerAvatarId } from '../../engine/content/avatars';

const PLAYER_AVATAR_IMAGES = {
  cartographer: cartographerImage,
  navigator: navigatorImage,
  ranger: rangerImage,
  merchant: merchantImage,
  smith: smithImage,
  scholar: scholarImage,
  herbalist: herbalistImage,
  courier: courierImage,
} satisfies Record<PlayerAvatarId, string>;

export function getPlayerAvatarImageSrc(avatarId: PlayerAvatarId | undefined): string {
  return PLAYER_AVATAR_IMAGES[avatarId ?? DEFAULT_PLAYER_AVATAR_ID];
}
