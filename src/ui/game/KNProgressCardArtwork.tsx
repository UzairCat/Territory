import type {
  KNProgressCardDefinition,
  KNProgressEffect,
} from '../../engine/content/kn-progress-cards';

const EFFECT_MARKS: Readonly<Record<KNProgressEffect, string>> = {
  ALCHEMIST: '⚗',
  CRANE: '⌁',
  ENGINEER: '▥',
  INVENTOR: '↔',
  IRRIGATION: '≋',
  MEDICINE: '✚',
  MINING: '◆',
  PRINTER: '¶',
  ROAD_BUILDING: '═',
  SMITH: '⚒',
  COMMERCIAL_HARBOR: '⚓',
  MASTER_MERCHANT: '♜',
  MERCHANT_FLEET: '⛵',
  MERCHANT: '⚖',
  RESOURCE_MONOPOLY: '◎',
  COMMODITY_MONOPOLY: '◉',
  BISHOP: '♟',
  CONSTITUTION: '★',
  DESERTER: '↯',
  DIPLOMAT: '☞',
  INTRIGUE: '⇢',
  SABOTEUR: '✹',
  SPY: '◌',
  WARLORD: '♞',
  WEDDING: '◇',
};

interface KNProgressCardArtworkProps {
  readonly definition: KNProgressCardDefinition;
  readonly compact?: boolean;
}

export function KNProgressCardArtwork({ definition, compact = false }: KNProgressCardArtworkProps) {
  return (
    <span
      className={`kn-progress-art kn-progress-art--${definition.family.toLocaleLowerCase()} ${compact ? 'kn-progress-art--compact' : ''}`}
      aria-hidden="true"
    >
      <i className="kn-progress-art__frame" />
      <i className="kn-progress-art__gate">
        <i />
        <i />
        <i />
      </i>
      <strong>{EFFECT_MARKS[definition.effect]}</strong>
      {definition.revealedVictoryPoints > 0 ? <b>+1</b> : null}
    </span>
  );
}
