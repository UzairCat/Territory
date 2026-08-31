import cartographerImage from '../../assets/avatars/cartographer.webp';
import courierImage from '../../assets/avatars/courier.webp';
import gmCalebImage from '../../assets/avatars/gmcaleb.webp';
import goofyMusselImage from '../../assets/avatars/goofymussel.webp';
import herbalistImage from '../../assets/avatars/herbalist.webp';
import kevinImage from '../../assets/avatars/kevin.webp';
import merchantImage from '../../assets/avatars/merchant.webp';
import navigatorImage from '../../assets/avatars/navigator.webp';
import rangerImage from '../../assets/avatars/ranger.webp';
import scholarImage from '../../assets/avatars/scholar.webp';
import smithImage from '../../assets/avatars/smith.webp';
import uzairImage from '../../assets/avatars/uzair.webp';
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
  gmcaleb: gmCalebImage,
  goofymussel: goofyMusselImage,
  kevin: kevinImage,
  uzair: uzairImage,
} satisfies Record<PlayerAvatarId, string>;

export function getPlayerAvatarImageSrc(avatarId: PlayerAvatarId | undefined): string {
  return PLAYER_AVATAR_IMAGES[avatarId ?? DEFAULT_PLAYER_AVATAR_ID];
}
