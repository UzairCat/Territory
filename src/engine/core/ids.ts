declare const idBrand: unique symbol;

type Id<Kind extends string> = string & { readonly [idBrand]: Kind };

export type ActionId = Id<'ActionId'>;
export type CardDefinitionId = Id<'CardDefinitionId'>;
export type CardInstanceId = Id<'CardInstanceId'>;
export type ColorId = Id<'ColorId'>;
export type EdgeId = Id<'EdgeId'>;
export type GameId = Id<'GameId'>;
export type HexId = Id<'HexId'>;
export type MapId = Id<'MapId'>;
export type ModeId = Id<'ModeId'>;
export type PlayerId = Id<'PlayerId'>;
export type PortId = Id<'PortId'>;
export type ResourceId = Id<'ResourceId'>;
export type TerrainId = Id<'TerrainId'>;
export type TradeId = Id<'TradeId'>;
export type VertexId = Id<'VertexId'>;

function createId<Kind extends string>(kind: Kind, value: string): Id<Kind> {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${kind} cannot be empty.`);
  }

  return normalized as Id<Kind>;
}

export const actionId = (value: string): ActionId => createId('ActionId', value);
export const cardDefinitionId = (value: string): CardDefinitionId =>
  createId('CardDefinitionId', value);
export const cardInstanceId = (value: string): CardInstanceId => createId('CardInstanceId', value);
export const colorId = (value: string): ColorId => createId('ColorId', value);
export const edgeId = (value: string): EdgeId => createId('EdgeId', value);
export const gameId = (value: string): GameId => createId('GameId', value);
export const hexId = (value: string): HexId => createId('HexId', value);
export const mapId = (value: string): MapId => createId('MapId', value);
export const modeId = (value: string): ModeId => createId('ModeId', value);
export const playerId = (value: string): PlayerId => createId('PlayerId', value);
export const portId = (value: string): PortId => createId('PortId', value);
export const resourceId = (value: string): ResourceId => createId('ResourceId', value);
export const terrainId = (value: string): TerrainId => createId('TerrainId', value);
export const tradeId = (value: string): TradeId => createId('TradeId', value);
export const vertexId = (value: string): VertexId => createId('VertexId', value);
