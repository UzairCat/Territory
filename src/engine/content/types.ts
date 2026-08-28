import type { CardDefinitionId, ColorId, MapId, ModeId, ResourceId, TerrainId } from '../core/ids';

export type PlayerCount = 2 | 3 | 4;
export type BuildingType = 'ROAD' | 'HOUSE' | 'MANSION';
export type ResourceBundle = Readonly<Partial<Record<ResourceId, number>>>;
export type GameModeKind = 'CLASSIC' | 'K_N';
export type KNProgressFamily = 'SCIENCE' | 'TRADE' | 'POLITICS';

export interface ResourceDefinition {
  readonly id: ResourceId;
  readonly displayName: string;
  readonly color: string;
  readonly iconKey: string;
}

export interface TerrainDefinition {
  readonly id: TerrainId;
  readonly displayName: string;
  readonly resourceId: ResourceId | null;
  readonly color: string;
}

export interface BuildingDefinition {
  readonly type: BuildingType;
  readonly displayName: string;
  readonly cost: ResourceBundle;
  readonly initialSupply: number;
  readonly victoryPoints: number;
  readonly productionMultiplier: number;
}

export type ProgressCardEffect =
  'MOVE_ROBBER' | 'PLACE_TWO_ROADS' | 'TAKE_TWO_RESOURCES' | 'MONOPOLY' | 'VICTORY_POINT';

export type ProgressCardArtworkId =
  | 'KNIGHT'
  | 'ROAD_BUILDING'
  | 'YEAR_OF_PLENTY'
  | 'MONOPOLY'
  | 'CHAPEL'
  | 'LIBRARY'
  | 'MARKET'
  | 'PALACE'
  | 'UNIVERSITY';

export interface ProgressCardDefinition {
  readonly id: CardDefinitionId;
  readonly displayName: string;
  readonly description: string;
  readonly count: number;
  readonly effect: ProgressCardEffect;
  readonly artwork: ProgressCardArtworkId;
  readonly countsTowardForce: boolean;
  readonly victoryPoints: number;
}

export interface PlayerColorDefinition {
  readonly id: ColorId;
  readonly displayName: string;
  readonly hex: string;
  readonly marker: 'CIRCLE' | 'DIAMOND' | 'SQUARE' | 'TRIANGLE';
}

export interface AxialCoordinate {
  readonly q: number;
  readonly r: number;
}

export interface PortPoolEntry {
  readonly tradeRatio: 2 | 3;
  readonly resourceId: ResourceId | null;
}

export interface MapDefinition {
  readonly id: MapId;
  readonly displayName: string;
  readonly supportedPlayerCounts: readonly PlayerCount[];
  readonly supportedModeIds: readonly ModeId[];
  readonly coordinates: readonly AxialCoordinate[];
  readonly terrainPool: readonly TerrainId[];
  readonly numberTokenPool: readonly number[];
  readonly portPool: readonly PortPoolEntry[];
  readonly separateHighProbabilityTokens: boolean;
}

export interface AwardRule {
  readonly minimum: number;
  readonly victoryPoints: number;
  readonly incumbentRetainsTie: boolean;
  readonly unheldTieAwardsNobody: boolean;
}

export interface ClassicRules {
  readonly playerCount: {
    readonly minimum: PlayerCount;
    readonly maximum: PlayerCount;
  };
  readonly victoryTarget: number;
  readonly dice: {
    readonly count: 2;
    readonly sides: 6;
    readonly robberTotal: 7;
  };
  readonly robberFlowEnabled: boolean;
  readonly discardThreshold: number;
  readonly bankCardsPerResource: number;
  readonly bankTradeRatio: 4;
  readonly cardPlayLimitPerTurn: 1;
  readonly canPlayCardOnPurchaseTurn: false;
  readonly productionShortageRule: 'CANCEL_RESOURCE_TYPE';
  readonly longestRoad: AwardRule;
  readonly largestForce: AwardRule;
  readonly buildingCosts: Readonly<Record<BuildingType, ResourceBundle>>;
  readonly progressCardCost: ResourceBundle;
}

export interface GameModeDefinition {
  readonly id: ModeId;
  readonly displayName: string;
  readonly description: string;
  readonly kind: GameModeKind;
  readonly rules: ClassicRules;
}

export function resourceBundle(
  entries: readonly (readonly [ResourceId, number])[],
): ResourceBundle {
  return Object.freeze(Object.fromEntries(entries));
}
