import { z } from 'zod';

import { isPlayerAvatarId, type PlayerAvatarId } from '../engine/content/avatars';
import { PLAYER_COLORS } from '../engine/content/colors';
import type { LobbyConfig } from '../app/lobby/lobby-model';
import type { KNProgressFamily } from '../engine/content/types';
import type { GameAction } from '../engine/core/actions';
import type { GameEvent } from '../engine/core/events';
import type { GameState } from '../engine/core/game-state';
import type { ColorId, PlayerId } from '../engine/core/ids';

export const ONLINE_PROTOCOL_VERSION = 1;
export const ROOM_CODE_LENGTH = 6;
export const RECONNECT_GRACE_MS = 90_000;
export const MATCH_DISCONNECT_GRACE_MS = 3 * 60_000;
export const PLAYER_TRADE_OFFER_DURATION_MS = 25_000;

export type OnlineRoomPhase = 'LOBBY' | 'PLAYING' | 'FINISHED';
export type OnlineConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';

export interface OnlineSessionCredentials {
  readonly roomCode: string;
  readonly playerId: PlayerId;
  readonly resumeToken: string;
}

export interface OnlineRoomPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly colorId: ColorId;
  readonly avatarId?: PlayerAvatarId;
  readonly connected: boolean;
  readonly ready: boolean;
  /** Authoritative server deadline for an absent match seat. Null while connected or in lobby. */
  readonly disconnectDeadlineAt?: number | null;
  readonly host: boolean;
}

export interface PublicPlayerCardInfo {
  readonly resourceCards: number;
  readonly commodityCards: number;
  readonly progressCards: number;
  readonly progressFamilies: Readonly<Record<KNProgressFamily, number>>;
}

export interface OnlineGameView {
  readonly revision: number;
  readonly state: GameState;
  readonly recentEvents: readonly GameEvent[];
  readonly eventHistory: readonly GameEvent[];
  readonly paused: boolean;
  readonly debugMode: boolean;
  readonly deadlineAt: number | null;
  readonly tradeDeadlineAt: number | null;
  /** Server wall-clock sample used to render authoritative deadlines without client clock skew. */
  readonly serverTimeMs?: number;
  readonly playerCards: Readonly<Record<string, PublicPlayerCardInfo>>;
}

export type OnlineLobbySettings = Omit<LobbyConfig, 'players'>;

export interface OnlineRoomView {
  readonly protocolVersion: typeof ONLINE_PROTOCOL_VERSION;
  readonly code: string;
  readonly phase: OnlineRoomPhase;
  readonly viewerPlayerId: PlayerId;
  readonly hostPlayerId: PlayerId;
  readonly players: readonly OnlineRoomPlayer[];
  readonly settings: OnlineLobbySettings;
  readonly previousSeed?: string | null;
  readonly game: OnlineGameView | null;
  /** Per-connection ordering token used to apply compact room patches exactly once. */
  readonly syncVersion?: number;
}

export type OnlinePatchOperation =
  | {
      readonly type: 'SET';
      readonly path: readonly string[];
      readonly value: unknown;
    }
  | {
      readonly type: 'REMOVE';
      readonly path: readonly string[];
    }
  | {
      /** Reuses the overlapping tail of an array, then appends only its new entries. */
      readonly type: 'ARRAY_TAIL';
      readonly path: readonly string[];
      readonly retainTail: number;
      readonly append: readonly unknown[];
    };

export interface OnlineRoomPatch {
  readonly roomCode: string;
  readonly baseVersion: number;
  readonly version: number;
  readonly operations: readonly OnlinePatchOperation[];
}

export interface OnlineError {
  readonly code: string;
  readonly message: string;
  readonly retryable?: boolean;
}

export type OnlineAck<T = undefined> =
  | ({ readonly ok: true } & (T extends undefined ? object : T))
  | { readonly ok: false; readonly error: OnlineError };

export interface CreateRoomPayload {
  readonly displayName: string;
  readonly supportsRoomPatches?: boolean;
}

export interface JoinRoomPayload {
  readonly roomCode: string;
  readonly displayName: string;
  readonly supportsRoomPatches?: boolean;
}

export interface ResumeSessionPayload {
  readonly credentials: OnlineSessionCredentials;
  readonly supportsRoomPatches?: boolean;
}

export interface UpdateRoomSettingsPayload {
  readonly credentials: OnlineSessionCredentials;
  readonly settings: OnlineLobbySettings;
}

export interface PlayerProfileSelection {
  readonly avatarId: PlayerAvatarId;
  readonly colorId: ColorId;
}

export interface UpdatePlayerProfilePayload extends RoomCommandPayload {
  readonly profile: PlayerProfileSelection;
}

export interface SetPlayerReadyPayload extends RoomCommandPayload {
  readonly ready: boolean;
}

export interface RoomCommandPayload {
  readonly credentials: OnlineSessionCredentials;
}

export interface DebugModePayload extends RoomCommandPayload {
  readonly enabled: boolean;
}

export interface SubmitActionPayload extends RoomCommandPayload {
  readonly expectedRevision: number;
  readonly action: GameAction;
}

export interface SessionAck {
  readonly credentials: OnlineSessionCredentials;
  readonly room: OnlineRoomView;
}

export interface ActionAck {
  readonly revision: number;
  readonly duplicate?: boolean;
}

export interface ServerToClientEvents {
  'session:accepted': (session: SessionAck) => void;
  'room:snapshot': (room: OnlineRoomView) => void;
  'room:patch': (patch: OnlineRoomPatch) => void;
  'room:error': (error: OnlineError) => void;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: CreateRoomPayload,
    acknowledge: (ack: OnlineAck<SessionAck>) => void,
  ) => void;
  'room:join': (
    payload: JoinRoomPayload,
    acknowledge: (ack: OnlineAck<SessionAck>) => void,
  ) => void;
  'session:resume': (
    payload: ResumeSessionPayload,
    acknowledge: (ack: OnlineAck<SessionAck>) => void,
  ) => void;
  'room:update-settings': (
    payload: UpdateRoomSettingsPayload,
    acknowledge: (ack: OnlineAck) => void,
  ) => void;
  'room:update-profile': (
    payload: UpdatePlayerProfilePayload,
    acknowledge: (ack: OnlineAck) => void,
  ) => void;
  'room:set-ready': (payload: SetPlayerReadyPayload, acknowledge: (ack: OnlineAck) => void) => void;
  'room:start': (payload: RoomCommandPayload, acknowledge: (ack: OnlineAck) => void) => void;
  'room:rematch': (payload: RoomCommandPayload, acknowledge: (ack: OnlineAck) => void) => void;
  'room:return-to-lobby': (
    payload: RoomCommandPayload,
    acknowledge: (ack: OnlineAck) => void,
  ) => void;
  'room:pause': (payload: RoomCommandPayload, acknowledge: (ack: OnlineAck) => void) => void;
  'room:unpause': (payload: RoomCommandPayload, acknowledge: (ack: OnlineAck) => void) => void;
  'room:leave': (payload: RoomCommandPayload, acknowledge: (ack: OnlineAck) => void) => void;
  'game:set-debug-mode': (payload: DebugModePayload, acknowledge: (ack: OnlineAck) => void) => void;
  'game:grant-progress-cards': (
    payload: RoomCommandPayload,
    acknowledge: (ack: OnlineAck) => void,
  ) => void;
  'game:action': (
    payload: SubmitActionPayload,
    acknowledge: (ack: OnlineAck<ActionAck>) => void,
  ) => void;
}

export type InterServerEvents = Record<never, never>;

export interface SocketSessionData {
  roomCode?: string;
  playerId?: PlayerId;
  supportsRoomPatches?: boolean;
}

const boundedText = z.string().trim().min(1).max(200);
const playerNameSchema = z.string().trim().min(1).max(20);
const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[A-Z2-9]{${ROOM_CODE_LENGTH}}$`));

export const createRoomPayloadSchema = z
  .object({ displayName: playerNameSchema, supportsRoomPatches: z.boolean().optional() })
  .strict();
export const joinRoomPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    displayName: playerNameSchema,
    supportsRoomPatches: z.boolean().optional(),
  })
  .strict();
export const credentialsSchema = z
  .object({
    roomCode: roomCodeSchema,
    playerId: boundedText,
    resumeToken: z.string().min(24).max(200),
  })
  .strict();

const lobbySettingsSchema = z
  .object({
    mapId: boundedText,
    modeId: boundedText,
    size: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    seed: z.string().trim().min(1).max(200),
    turnTimeSeconds: z.number().int().min(20).max(600),
    victoryTarget: z.number().int().min(3).max(26),
    discardThreshold: z.number().int().min(5).max(20),
    hideBankCards: z.boolean(),
    friendlyRobber: z.boolean(),
    balancedDice: z.boolean(),
    inventorsMadness: z.boolean(),
  })
  .strict();

const playerProfileSchema = z
  .object({ avatarId: boundedText, colorId: boundedText })
  .strict()
  .refine(
    (profile) =>
      isPlayerAvatarId(profile.avatarId) &&
      PLAYER_COLORS.some((color) => color.id === profile.colorId),
    'The selected guest profile is unavailable.',
  );

const resourceBundleSchema = z
  .record(z.string().min(1).max(40), z.number().int().min(0).max(1_000))
  .refine((value) => Object.keys(value).length <= 16, 'A resource bundle has too many entries.');
const selectionsSchema = z.array(boundedText).max(200);

const actionBase = {
  id: boundedText,
  actorId: boundedText,
};
const simpleAction = (type: string) => z.object({ ...actionBase, type: z.literal(type) }).strict();
const targetAction = (type: string, field: string) =>
  z.object({ ...actionBase, type: z.literal(type), [field]: boundedText }).strict();

const gameActionSchema = z.discriminatedUnion('type', [
  targetAction('PLACE_SETUP_HOUSE', 'vertexId'),
  targetAction('PLACE_SETUP_ROAD', 'edgeId'),
  simpleAction('ROLL_DICE'),
  simpleAction('ROLL_KN_DICE'),
  z
    .object({
      ...actionBase,
      type: z.literal('PLAY_ALCHEMIST'),
      cardInstanceId: boundedText,
      redDie: z.number().int().min(1).max(6),
      regularDie: z.number().int().min(1).max(6),
    })
    .strict(),
  z
    .object({
      ...actionBase,
      type: z.literal('DISCARD_RESOURCES'),
      resources: resourceBundleSchema,
    })
    .strict(),
  targetAction('MOVE_ROBBER', 'hexId'),
  targetAction('STEAL_FROM_PLAYER', 'targetPlayerId'),
  targetAction('BUILD_ROAD', 'edgeId'),
  targetAction('BUILD_HOUSE', 'vertexId'),
  targetAction('UPGRADE_MANSION', 'vertexId'),
  targetAction('BUILD_KNIGHT', 'vertexId'),
  targetAction('ACTIVATE_KNIGHT', 'knightId'),
  targetAction('UPGRADE_KNIGHT', 'knightId'),
  z
    .object({
      ...actionBase,
      type: z.literal('MOVE_KNIGHT'),
      knightId: boundedText,
      vertexId: boundedText,
    })
    .strict(),
  z
    .object({
      ...actionBase,
      type: z.literal('DISPLACE_KNIGHT'),
      knightId: boundedText,
      targetKnightId: boundedText,
    })
    .strict(),
  targetAction('CHASE_ROBBER', 'knightId'),
  targetAction('BUILD_WALL', 'vertexId'),
  z
    .object({
      ...actionBase,
      type: z.literal('BUY_IMPROVEMENT'),
      track: z.enum(['SCIENCE', 'TRADE', 'POLITICS']),
    })
    .strict(),
  z
    .object({
      ...actionBase,
      type: z.literal('BANK_TRADE'),
      offered: resourceBundleSchema,
      requested: resourceBundleSchema,
    })
    .strict(),
  z
    .object({
      ...actionBase,
      type: z.literal('CREATE_TRADE'),
      tradeId: boundedText,
      recipientIds: z.array(boundedText).min(1).max(3),
      offered: resourceBundleSchema,
      requested: resourceBundleSchema,
    })
    .strict(),
  z
    .object({
      ...actionBase,
      type: z.literal('UPDATE_TRADE'),
      tradeId: boundedText,
      offered: resourceBundleSchema,
      requested: resourceBundleSchema,
    })
    .strict(),
  z
    .object({
      ...actionBase,
      type: z.literal('RESPOND_TO_TRADE'),
      tradeId: boundedText,
      accepted: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...actionBase,
      type: z.literal('CONFIRM_TRADE'),
      tradeId: boundedText,
      recipientId: boundedText,
    })
    .strict(),
  targetAction('CANCEL_TRADE', 'tradeId'),
  targetAction('EXPIRE_TRADE', 'tradeId'),
  simpleAction('BUY_PROGRESS_CARD'),
  targetAction('PLAY_PROGRESS_CARD', 'cardInstanceId'),
  targetAction('PLAY_KN_PROGRESS_CARD', 'cardInstanceId'),
  z
    .object({
      ...actionBase,
      type: z.literal('RESOLVE_PROGRESS_SELECTION'),
      selections: selectionsSchema,
      resources: resourceBundleSchema.optional(),
      redDie: z.number().int().min(1).max(6).optional(),
      regularDie: z.number().int().min(1).max(6).optional(),
      cancelled: z.boolean().optional(),
    })
    .strict(),
  targetAction('PLACE_OR_MOVE_MERCHANT', 'hexId'),
  z
    .object({
      ...actionBase,
      type: z.literal('SELECT_CARD_RESOURCES'),
      cardInstanceId: boundedText,
      resources: resourceBundleSchema,
    })
    .strict(),
  z
    .object({
      ...actionBase,
      type: z.literal('SELECT_CARD_RESOURCE_TYPE'),
      cardInstanceId: boundedText,
      resourceId: boundedText,
    })
    .strict(),
  simpleAction('END_TURN'),
  simpleAction('AUTO_TIMEOUT'),
]);

export function parseGameAction(value: unknown): GameAction | null {
  const result = gameActionSchema.safeParse(value);
  return result.success ? (result.data as GameAction) : null;
}

export function parseLobbySettings(value: unknown): OnlineLobbySettings | null {
  const result = lobbySettingsSchema.safeParse(value);
  return result.success ? (result.data as OnlineLobbySettings) : null;
}

export function parsePlayerProfile(value: unknown): PlayerProfileSelection | null {
  const result = playerProfileSchema.safeParse(value);
  return result.success ? (result.data as PlayerProfileSelection) : null;
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}
