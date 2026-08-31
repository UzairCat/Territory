import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { PLAYER_COLORS } from '../src/engine/content/colors';
import {
  isPlayerAvatarId,
  randomAvailablePlayerAvatarId,
  type PlayerAvatarId,
} from '../src/engine/content/avatars';
import { createGame } from '../src/engine/core/create-game';
import { dispatch } from '../src/engine/core/game-engine';
import type { GameAction } from '../src/engine/core/actions';
import type { GameEvent } from '../src/engine/core/events';
import type { GameState } from '../src/engine/core/game-state';
import { actionId, gameId, playerId, tradeId } from '../src/engine/core/ids';
import type { ColorId, PlayerId } from '../src/engine/core/ids';
import {
  grantDeveloperLoadout,
  grantDeveloperProgressCards,
} from '../src/engine/debug/developer-tools';
import { hasAdminDisplayName } from '../src/multiplayer/admin-access';
import {
  buildGameConfig,
  createDefaultLobby,
  validateLobby,
  type LobbyConfig,
  type LocalLobbyPlayer,
} from '../src/app/lobby/lobby-model';
import { createOnlineGameView } from '../src/multiplayer/projection';
import {
  ONLINE_PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  type ActionAck,
  type OnlineAck,
  type OnlineError,
  type OnlineLobbySettings,
  type OnlineRoomPhase,
  type OnlineRoomView,
  type OnlineSessionCredentials,
  type SessionAck,
} from '../src/multiplayer/protocol';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EVENT_HISTORY_LIMIT = 300;
const PROCESSED_ACTION_LIMIT = 2_000;
export const DEFAULT_INACTIVE_ROOM_TTL_MS = 30 * 60_000;

interface RoomMember {
  readonly id: PlayerId;
  readonly resumeTokenHash: string;
  readonly createdAt: number;
  name: string;
  colorId: ColorId;
  avatarId: PlayerAvatarId;
  socketIds: Set<string>;
  disconnectedAt: number | null;
  removalTimer: ReturnType<typeof setTimeout> | null;
}

interface RoomRecord {
  readonly code: string;
  readonly createdAt: number;
  readonly members: Map<PlayerId, RoomMember>;
  readonly processedActions: Map<string, number>;
  readonly debugPlayerIds: Set<PlayerId>;
  hostPlayerId: PlayerId;
  settings: OnlineLobbySettings;
  previousSeed: string | null;
  phase: OnlineRoomPhase;
  state: GameState | null;
  revision: number;
  recentEvents: readonly GameEvent[];
  eventHistory: readonly GameEvent[];
  paused: boolean;
  timerKey: string | null;
  deadlineAt: number | null;
  pausedRemainingMs: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  timerGeneration: number;
  tradeTimerKey: string | null;
  tradeDeadlineAt: number | null;
  tradePausedRemainingMs: number | null;
  tradeTimer: ReturnType<typeof setTimeout> | null;
  tradeTimerGeneration: number;
  inactivityTimer: ReturnType<typeof setTimeout> | null;
}

interface TimedStep {
  readonly key: string;
  readonly durationMs: number;
  readonly actorId: PlayerId;
  readonly kind: 'AUTO_TIMEOUT' | 'EXPIRE_TRADE';
  readonly tradeId?: string;
}

export interface AuthenticatedSession {
  readonly room: RoomRecord;
  readonly member: RoomMember;
}

export interface RoomManagerHooks {
  readonly onRoomChanged: (roomCode: string) => void;
  readonly inactiveRoomTtlMs?: number;
}

function error(code: string, message: string, retryable = false): OnlineError {
  return { code, message, ...(retryable ? { retryable: true } : {}) };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function secureToken(): string {
  return randomBytes(32).toString('base64url');
}

function roomCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join('');
}

function randomSeed(): string {
  return `online-${randomUUID()}`;
}

function randomAvatarId(room: RoomRecord | null): PlayerAvatarId {
  return randomAvailablePlayerAvatarId(
    room === null ? [] : [...room.members.values()].map((member) => member.avatarId),
    randomBytes(4).readUInt32BE(0) / 4_294_967_296,
  );
}

function canUseDeveloperControls(member: RoomMember): boolean {
  return process.env.NODE_ENV !== 'production' || hasAdminDisplayName(member.name);
}

function toSettings(lobby: LobbyConfig): OnlineLobbySettings {
  return {
    mapId: lobby.mapId,
    modeId: lobby.modeId,
    size: lobby.size,
    seed: lobby.seed,
    turnTimeSeconds: lobby.turnTimeSeconds,
    victoryTarget: lobby.victoryTarget,
    discardThreshold: lobby.discardThreshold,
    hideBankCards: lobby.hideBankCards,
    friendlyRobber: lobby.friendlyRobber,
    balancedDice: lobby.balancedDice,
    inventorsMadness: lobby.inventorsMadness,
  };
}

function timedStep(state: GameState): TimedStep | null {
  if (state.turn.phase === 'GAME_OVER' || state.turn.activePlayerId === null) return null;
  if (state.turn.phase === 'SETUP_PLACE_HOUSE') {
    return {
      key: `setup-house-${state.turn.setupPlacementIndex ?? 0}`,
      durationMs: 180_000,
      actorId: state.turn.activePlayerId,
      kind: 'AUTO_TIMEOUT',
    };
  }
  if (state.turn.phase === 'SETUP_PLACE_ROAD') {
    return {
      key: `setup-road-${state.turn.setupPlacementIndex ?? 0}`,
      durationMs: 60_000,
      actorId: state.turn.activePlayerId,
      kind: 'AUTO_TIMEOUT',
    };
  }
  if (state.turn.phase === 'DISCARD_RESOURCES') {
    const actorId =
      state.pendingInteraction?.type === 'DISCARD_RESOURCES'
        ? state.pendingInteraction.queue[0]
        : undefined;
    return actorId === undefined
      ? null
      : {
          key: `discard-${state.turn.turnNumber}-simultaneous`,
          durationMs: 30_000,
          actorId,
          kind: 'AUTO_TIMEOUT',
        };
  }
  if (state.turn.phase === 'MOVE_ROBBER' || state.turn.phase === 'CHOOSE_STEAL_TARGET') {
    return {
      key: `robber-${state.turn.turnNumber}-${state.turn.phase}`,
      durationMs: 20_000,
      actorId: state.turn.activePlayerId,
      kind: 'AUTO_TIMEOUT',
    };
  }
  if (state.turn.phase === 'WAITING_FOR_ROLL') {
    return {
      key: `roll-${state.turn.turnNumber}`,
      durationMs: 10_000,
      actorId: state.turn.activePlayerId,
      kind: 'AUTO_TIMEOUT',
    };
  }
  if (state.turn.phase === 'ACTION_PHASE') {
    return {
      key: `actions-${state.turn.turnNumber}`,
      durationMs: (state.config.turnTimeSeconds ?? 60) * 1_000,
      actorId: state.turn.activePlayerId,
      kind: 'AUTO_TIMEOUT',
    };
  }
  if (state.turn.phase === 'CARD_RESOLUTION') {
    const interaction = state.pendingInteraction;
    if (interaction?.type === 'KN_SELECTION') {
      const uncommittedPreview =
        interaction.sourceCardId !== undefined &&
        interaction.canCancel &&
        interaction.context.committed !== true;
      const simultaneousChoice = interaction.simultaneous === true;
      return {
        key: uncommittedPreview
          ? `actions-${state.turn.turnNumber}`
          : simultaneousChoice
            ? `choice-${state.turn.turnNumber}-${interaction.purpose}-simultaneous`
            : `choice-${state.actionHistory.length}-${interaction.purpose}-${interaction.playerId}`,
        durationMs: uncommittedPreview
          ? (state.config.turnTimeSeconds ?? 60) * 1_000
          : interaction.purpose === 'DEFENDER_TIE_DECK'
            ? 15_000
            : 30_000,
        actorId: uncommittedPreview ? state.turn.activePlayerId : interaction.playerId,
        kind: 'AUTO_TIMEOUT',
      };
    }
  }
  return null;
}

function tradeTimedStep(state: GameState): TimedStep | null {
  if (state.pendingInteraction?.type !== 'TRADE_RESPONSES') return null;
  const trade = state.tradeOffers[state.pendingInteraction.tradeId];
  if (trade === undefined || trade.status !== 'OPEN') return null;
  return {
    key: `trade-${trade.id}`,
    durationMs: 15_000,
    actorId: trade.fromPlayerId,
    kind: 'EXPIRE_TRADE',
    tradeId: trade.id,
  };
}

function hasTimerBoost(events: readonly GameEvent[]): boolean {
  const types = new Set([
    'BUILDING_PLACED',
    'BUILDING_UPGRADED',
    'ROAD_BUILT',
    'TRADE_COMPLETED',
    'COMMERCIAL_HARBOR_EXCHANGED',
    'PROGRESS_CARD_BOUGHT',
    'PROGRESS_CARD_PLAYED',
    'KNIGHT_BUILT',
    'KNIGHT_ACTIVATED',
    'KNIGHT_UPGRADED',
    'KNIGHT_MOVED',
    'KNIGHT_DISPLACED',
    'WALL_BUILT',
    'IMPROVEMENT_BOUGHT',
    'KN_PROGRESS_CARD_RESOLVED',
    'MERCHANT_MOVED',
    'METROPOLIS_CHANGED',
  ]);
  return events.some((event) => types.has(event.type));
}

export class RoomManager {
  readonly rooms = new Map<string, RoomRecord>();
  private readonly inactiveRoomTtlMs: number;

  constructor(private readonly hooks: RoomManagerHooks) {
    this.inactiveRoomTtlMs = Math.max(1, hooks.inactiveRoomTtlMs ?? DEFAULT_INACTIVE_ROOM_TTL_MS);
  }

  create(displayName: string, socketId: string): OnlineAck<SessionAck> {
    let code = roomCode();
    while (this.rooms.has(code)) code = roomCode();
    const id = playerId(`online-player-${randomUUID()}`);
    const token = secureToken();
    const defaults = createDefaultLobby(randomSeed());
    const member: RoomMember = {
      id,
      name: displayName.trim(),
      colorId: PLAYER_COLORS[0]!.id,
      avatarId: randomAvatarId(null),
      resumeTokenHash: hashToken(token),
      createdAt: Date.now(),
      socketIds: new Set([socketId]),
      disconnectedAt: null,
      removalTimer: null,
    };
    const room: RoomRecord = {
      code,
      createdAt: Date.now(),
      members: new Map([[id, member]]),
      processedActions: new Map(),
      debugPlayerIds: new Set(),
      hostPlayerId: id,
      settings: toSettings(defaults),
      previousSeed: null,
      phase: 'LOBBY',
      state: null,
      revision: 0,
      recentEvents: [],
      eventHistory: [],
      paused: false,
      timerKey: null,
      deadlineAt: null,
      pausedRemainingMs: null,
      timer: null,
      timerGeneration: 0,
      tradeTimerKey: null,
      tradeDeadlineAt: null,
      tradePausedRemainingMs: null,
      tradeTimer: null,
      tradeTimerGeneration: 0,
      inactivityTimer: null,
    };
    this.rooms.set(code, room);
    const credentials = { roomCode: code, playerId: id, resumeToken: token };
    return { ok: true, credentials, room: this.view(room, id) };
  }

  join(code: string, displayName: string, socketId: string): OnlineAck<SessionAck> {
    const room = this.rooms.get(code);
    if (room === undefined) {
      return { ok: false, error: error('ROOM_NOT_FOUND', 'That room code does not exist.') };
    }
    if (room.phase !== 'LOBBY') {
      return {
        ok: false,
        error: error('MATCH_ALREADY_STARTED', 'This match has already started.'),
      };
    }
    if (room.members.size >= room.settings.size) {
      return { ok: false, error: error('ROOM_FULL', 'This room is already full.') };
    }
    const normalizedName = displayName.trim().toLocaleLowerCase();
    if (
      [...room.members.values()].some(
        (member) => member.name.toLocaleLowerCase() === normalizedName,
      )
    ) {
      return { ok: false, error: error('NAME_TAKEN', 'Choose a different name for this room.') };
    }
    const color = PLAYER_COLORS.find(
      (candidate) => ![...room.members.values()].some((member) => member.colorId === candidate.id),
    );
    if (color === undefined) {
      return { ok: false, error: error('NO_COLOR_AVAILABLE', 'No player color is available.') };
    }
    const id = playerId(`online-player-${randomUUID()}`);
    const token = secureToken();
    room.members.set(id, {
      id,
      name: displayName.trim(),
      colorId: color.id,
      avatarId: randomAvatarId(room),
      resumeTokenHash: hashToken(token),
      createdAt: Date.now(),
      socketIds: new Set([socketId]),
      disconnectedAt: null,
      removalTimer: null,
    });
    this.clearInactivityTimer(room);
    const credentials = { roomCode: code, playerId: id, resumeToken: token };
    this.hooks.onRoomChanged(code);
    return { ok: true, credentials, room: this.view(room, id) };
  }

  authenticate(credentials: OnlineSessionCredentials): AuthenticatedSession | null {
    const room = this.rooms.get(credentials.roomCode);
    const member = room?.members.get(credentials.playerId);
    if (
      room === undefined ||
      member === undefined ||
      member.resumeTokenHash !== hashToken(credentials.resumeToken)
    ) {
      return null;
    }
    return { room, member };
  }

  resume(credentials: OnlineSessionCredentials, socketId: string): OnlineAck<SessionAck> {
    const authenticated = this.authenticate(credentials);
    if (authenticated === null) {
      return {
        ok: false,
        error: error('SESSION_EXPIRED', 'This room session is no longer available.'),
      };
    }
    const { room, member } = authenticated;
    const roomWasInactive = ![...room.members.values()].some(
      (candidate) => candidate.socketIds.size > 0,
    );
    if (member.removalTimer !== null) clearTimeout(member.removalTimer);
    member.removalTimer = null;
    member.socketIds.add(socketId);
    member.disconnectedAt = null;
    this.clearInactivityTimer(room);
    if (roomWasInactive) this.refreshTimers(room, [], true);
    this.hooks.onRoomChanged(room.code);
    return { ok: true, credentials, room: this.view(room, member.id) };
  }

  updateSettings(credentials: OnlineSessionCredentials, settings: OnlineLobbySettings): OnlineAck {
    const authenticated = this.authenticate(credentials);
    if (authenticated === null)
      return { ok: false, error: error('UNAUTHORIZED', 'Session expired.') };
    const { room, member } = authenticated;
    if (room.hostPlayerId !== member.id) {
      return { ok: false, error: error('HOST_ONLY', 'Only the host can change room settings.') };
    }
    if (room.phase !== 'LOBBY') {
      return {
        ok: false,
        error: error('MATCH_ALREADY_STARTED', 'Settings are locked after start.'),
      };
    }
    if (settings.size < room.members.size) {
      return {
        ok: false,
        error: error('ROOM_SIZE_TOO_SMALL', 'That size would remove a joined player.'),
      };
    }
    const lobby = this.lobby(room, settings);
    const issues = validateLobby(lobby).filter((issue) => issue.code !== 'PLAYER_COUNT_INCOMPLETE');
    if (issues.length > 0) {
      return { ok: false, error: error('INVALID_SETTINGS', issues[0]!.message) };
    }
    room.settings = settings;
    this.hooks.onRoomChanged(room.code);
    return { ok: true };
  }

  updateProfile(
    credentials: OnlineSessionCredentials,
    avatarId: PlayerAvatarId,
    colorId: ColorId,
  ): OnlineAck {
    const authenticated = this.authenticate(credentials);
    if (authenticated === null) {
      return { ok: false, error: error('UNAUTHORIZED', 'Session expired.') };
    }
    const { room, member } = authenticated;
    if (room.phase !== 'LOBBY') {
      return {
        ok: false,
        error: error('MATCH_ALREADY_STARTED', 'Profiles are locked after the match starts.'),
      };
    }
    if (!isPlayerAvatarId(avatarId)) {
      return { ok: false, error: error('INVALID_AVATAR', 'That preset avatar is unavailable.') };
    }
    if (!PLAYER_COLORS.some((color) => color.id === colorId)) {
      return { ok: false, error: error('INVALID_COLOR', 'That player color is unavailable.') };
    }
    if (
      [...room.members.values()].some(
        (candidate) => candidate.id !== member.id && candidate.colorId === colorId,
      )
    ) {
      return { ok: false, error: error('COLOR_TAKEN', 'Another player is using that color.') };
    }
    member.avatarId = avatarId;
    member.colorId = colorId;
    this.hooks.onRoomChanged(room.code);
    return { ok: true };
  }

  start(credentials: OnlineSessionCredentials): OnlineAck {
    const authenticated = this.authenticate(credentials);
    if (authenticated === null)
      return { ok: false, error: error('UNAUTHORIZED', 'Session expired.') };
    const { room, member } = authenticated;
    if (member.id !== room.hostPlayerId) {
      return { ok: false, error: error('HOST_ONLY', 'Only the host can start the match.') };
    }
    if (room.phase !== 'LOBBY') {
      return { ok: false, error: error('MATCH_ALREADY_STARTED', 'The match has already started.') };
    }
    if ([...room.members.values()].some((candidate) => candidate.socketIds.size === 0)) {
      return {
        ok: false,
        error: error('PLAYERS_DISCONNECTED', 'Wait for every player to reconnect before starting.'),
      };
    }
    const lobby = this.lobby(room);
    const config = buildGameConfig(lobby, gameId(`online-game-${randomUUID()}`));
    if (!config.ok) {
      return {
        ok: false,
        error: error('LOBBY_NOT_READY', config.issues[0]?.message ?? 'Room is not ready.'),
      };
    }
    const created = createGame(config.config);
    if (!created.ok) {
      return {
        ok: false,
        error: error(
          'MATCH_CREATION_FAILED',
          created.issues[0]?.message ?? 'Match creation failed.',
        ),
      };
    }
    room.state = created.state;
    room.phase = 'PLAYING';
    room.revision = 1;
    room.recentEvents = [];
    room.eventHistory = [];
    room.debugPlayerIds.clear();
    this.refreshTimers(room, [], true);
    this.hooks.onRoomChanged(room.code);
    return { ok: true };
  }

  rematch(credentials: OnlineSessionCredentials): OnlineAck {
    const authenticated = this.authenticate(credentials);
    if (authenticated === null)
      return { ok: false, error: error('UNAUTHORIZED', 'Session expired.') };
    const { room, member } = authenticated;
    if (member.id !== room.hostPlayerId) {
      return { ok: false, error: error('HOST_ONLY', 'Only the host can start a rematch.') };
    }
    if (room.phase !== 'FINISHED') {
      return { ok: false, error: error('MATCH_NOT_FINISHED', 'Finish this match first.') };
    }
    if ([...room.members.values()].some((candidate) => candidate.socketIds.size === 0)) {
      return {
        ok: false,
        error: error(
          'PLAYERS_DISCONNECTED',
          'Wait for every player to reconnect before the rematch.',
        ),
      };
    }
    room.settings = { ...room.settings, seed: randomSeed() };
    const config = buildGameConfig(this.lobby(room), gameId(`online-game-${randomUUID()}`));
    if (!config.ok) {
      return {
        ok: false,
        error: error('LOBBY_NOT_READY', config.issues[0]?.message ?? 'Room is not ready.'),
      };
    }
    const created = createGame(config.config);
    if (!created.ok) {
      return {
        ok: false,
        error: error(
          'MATCH_CREATION_FAILED',
          created.issues[0]?.message ?? 'Rematch creation failed.',
        ),
      };
    }
    room.state = created.state;
    room.phase = 'PLAYING';
    room.revision += 1;
    room.recentEvents = [];
    room.eventHistory = [];
    room.processedActions.clear();
    room.debugPlayerIds.clear();
    room.paused = false;
    room.pausedRemainingMs = null;
    room.tradePausedRemainingMs = null;
    this.refreshTimers(room, [], true);
    this.hooks.onRoomChanged(room.code);
    return { ok: true };
  }

  returnToLobby(credentials: OnlineSessionCredentials): OnlineAck {
    const authenticated = this.authenticate(credentials);
    if (authenticated === null) {
      return { ok: false, error: error('UNAUTHORIZED', 'Session expired.') };
    }
    const { room, member } = authenticated;
    if (room.phase === 'PLAYING' && member.id !== room.hostPlayerId) {
      return {
        ok: false,
        error: error('HOST_ONLY', 'Only the host can return an active match to the lobby.'),
      };
    }
    if (room.phase === 'LOBBY') return { ok: true };

    this.clearTimer(room);
    this.clearTradeTimer(room);
    room.previousSeed = room.settings.seed;
    room.settings = { ...room.settings, seed: randomSeed() };
    room.phase = 'LOBBY';
    room.state = null;
    room.revision += 1;
    room.recentEvents = [];
    room.eventHistory = [];
    room.processedActions.clear();
    room.debugPlayerIds.clear();
    room.paused = false;
    room.timerKey = null;
    room.deadlineAt = null;
    room.pausedRemainingMs = null;
    room.tradeTimerKey = null;
    room.tradeDeadlineAt = null;
    room.tradePausedRemainingMs = null;
    this.hooks.onRoomChanged(room.code);
    return { ok: true };
  }

  submit(
    credentials: OnlineSessionCredentials,
    expectedRevision: number,
    action: GameAction,
  ): OnlineAck<ActionAck> {
    const authenticated = this.authenticate(credentials);
    if (authenticated === null)
      return { ok: false, error: error('UNAUTHORIZED', 'Session expired.') };
    const { room, member } = authenticated;
    if (room.state === null || room.phase !== 'PLAYING') {
      return { ok: false, error: error('MATCH_NOT_ACTIVE', 'The match is not active.') };
    }
    if (room.paused)
      return { ok: false, error: error('MATCH_PAUSED', 'The host paused the match.') };
    if (action.actorId !== member.id) {
      return {
        ok: false,
        error: error('WRONG_ACTOR', 'You can only submit actions for your own seat.'),
      };
    }
    if (action.type === 'AUTO_TIMEOUT' || action.type === 'EXPIRE_TRADE') {
      return {
        ok: false,
        error: error('SERVER_ACTION_ONLY', 'That action is controlled by the server.'),
      };
    }
    const duplicateRevision = room.processedActions.get(action.id);
    if (duplicateRevision !== undefined) {
      return { ok: true, revision: duplicateRevision, duplicate: true };
    }
    const remainsEligibleForConcurrentResolution =
      expectedRevision < room.revision &&
      ((action.type === 'RESOLVE_PROGRESS_SELECTION' &&
        room.state.pendingInteraction?.type === 'KN_SELECTION' &&
        room.state.pendingInteraction.simultaneous === true &&
        room.state.pendingInteraction.queue.includes(member.id)) ||
        (action.type === 'DISCARD_RESOURCES' &&
          room.state.pendingInteraction?.type === 'DISCARD_RESOURCES' &&
          room.state.pendingInteraction.queue.includes(member.id)));
    if (expectedRevision !== room.revision && !remainsEligibleForConcurrentResolution) {
      return {
        ok: false,
        error: error(
          'STALE_REVISION',
          'The match changed before this action arrived. Your view has been refreshed.',
          true,
        ),
      };
    }
    const developerMode = room.debugPlayerIds.has(member.id);
    const result = dispatch(room.state, action, {
      skipSevenDiscards: developerMode,
      ignoreRobber: developerMode,
      discardExemptPlayerIds: [...room.debugPlayerIds],
    });
    if (!result.ok) {
      return { ok: false, error: error(result.error.code, result.error.message) };
    }
    this.commit(room, result.state, result.events, action.id);
    return { ok: true, revision: room.revision };
  }

  pause(credentials: OnlineSessionCredentials, paused: boolean): OnlineAck {
    const authenticated = this.authenticate(credentials);
    if (authenticated === null)
      return { ok: false, error: error('UNAUTHORIZED', 'Session expired.') };
    const { room, member } = authenticated;
    if (room.hostPlayerId !== member.id) {
      return {
        ok: false,
        error: error('HOST_ONLY', 'Only the host can pause or resume the match.'),
      };
    }
    if (room.phase !== 'PLAYING') {
      return { ok: false, error: error('MATCH_NOT_ACTIVE', 'The match is not active.') };
    }
    if (room.paused === paused) return { ok: true };
    room.paused = paused;
    if (paused) {
      room.pausedRemainingMs =
        room.deadlineAt === null ? null : Math.max(0, room.deadlineAt - Date.now());
      room.tradePausedRemainingMs =
        room.tradeDeadlineAt === null ? null : Math.max(0, room.tradeDeadlineAt - Date.now());
      room.deadlineAt = null;
      room.tradeDeadlineAt = null;
      this.clearTimer(room);
      this.clearTradeTimer(room);
    } else {
      const step = room.state === null ? null : timedStep(room.state);
      if (step !== null) {
        room.timerKey = step.key;
        room.deadlineAt = Date.now() + (room.pausedRemainingMs ?? step.durationMs);
        room.pausedRemainingMs = null;
        this.scheduleTimer(room, step);
      }
      const tradeStep = room.state === null ? null : tradeTimedStep(room.state);
      if (tradeStep !== null) {
        room.tradeTimerKey = tradeStep.key;
        room.tradeDeadlineAt = Date.now() + (room.tradePausedRemainingMs ?? tradeStep.durationMs);
        room.tradePausedRemainingMs = null;
        this.scheduleTradeTimer(room, tradeStep);
      }
    }
    this.hooks.onRoomChanged(room.code);
    return { ok: true };
  }

  setDebugMode(credentials: OnlineSessionCredentials, enabled: boolean): OnlineAck {
    const authenticated = this.authenticate(credentials);
    if (authenticated === null) {
      return { ok: false, error: error('UNAUTHORIZED', 'Session expired.') };
    }
    const { room, member } = authenticated;
    if (!canUseDeveloperControls(member)) {
      return { ok: false, error: error('DEBUG_DISABLED', 'Developer controls are disabled.') };
    }
    if (room.state === null || room.phase !== 'PLAYING') {
      return { ok: false, error: error('MATCH_NOT_ACTIVE', 'The match is not active.') };
    }
    const alreadyEnabled = room.debugPlayerIds.has(member.id);
    if (enabled === alreadyEnabled) return { ok: true };
    if (enabled) {
      room.debugPlayerIds.add(member.id);
      room.state = grantDeveloperLoadout(room.state, member.id, randomUUID());
      room.revision += 1;
      room.recentEvents = [];
      this.refreshTimers(room, [], false);
    } else {
      room.debugPlayerIds.delete(member.id);
    }
    this.hooks.onRoomChanged(room.code);
    return { ok: true };
  }

  grantProgressCards(credentials: OnlineSessionCredentials): OnlineAck {
    const authenticated = this.authenticate(credentials);
    if (authenticated === null) {
      return { ok: false, error: error('UNAUTHORIZED', 'Session expired.') };
    }
    const { room, member } = authenticated;
    if (!canUseDeveloperControls(member)) {
      return { ok: false, error: error('DEBUG_DISABLED', 'Developer controls are disabled.') };
    }
    if (room.state === null || room.phase !== 'PLAYING') {
      return { ok: false, error: error('MATCH_NOT_ACTIVE', 'The match is not active.') };
    }
    room.state = grantDeveloperProgressCards(room.state, member.id, randomUUID());
    room.revision += 1;
    room.recentEvents = [];
    this.refreshTimers(room, [], false);
    this.hooks.onRoomChanged(room.code);
    return { ok: true };
  }

  leave(credentials: OnlineSessionCredentials): OnlineAck {
    const authenticated = this.authenticate(credentials);
    if (authenticated === null) return { ok: true };
    const { room, member } = authenticated;
    if (room.phase !== 'LOBBY') {
      member.socketIds.clear();
      member.disconnectedAt = Date.now();
      this.scheduleInactivityCleanup(room);
      this.hooks.onRoomChanged(room.code);
      return { ok: true };
    }
    this.removeMember(room, member.id);
    return { ok: true };
  }

  disconnect(socketId: string): void {
    for (const room of this.rooms.values()) {
      let roomChanged = false;
      for (const member of room.members.values()) {
        if (!member.socketIds.delete(socketId) || member.socketIds.size > 0) continue;
        roomChanged = true;
        member.disconnectedAt = Date.now();
        if (room.phase === 'LOBBY') {
          member.removalTimer = setTimeout(
            () => this.removeMember(room, member.id),
            RECONNECT_GRACE_MS,
          );
        }
      }
      if (!roomChanged) continue;
      this.scheduleInactivityCleanup(room);
      this.hooks.onRoomChanged(room.code);
    }
  }

  view(room: RoomRecord, viewerPlayerId: PlayerId): OnlineRoomView {
    const orderedMembers = [...room.members.values()].sort(
      (first, second) => first.createdAt - second.createdAt,
    );
    return {
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      code: room.code,
      phase: room.phase,
      viewerPlayerId,
      hostPlayerId: room.hostPlayerId,
      players: orderedMembers.map((member) => ({
        id: member.id,
        name: member.name,
        colorId: member.colorId,
        avatarId: member.avatarId,
        connected: member.socketIds.size > 0,
        host: member.id === room.hostPlayerId,
      })),
      settings: room.settings,
      previousSeed: room.previousSeed,
      game:
        room.state === null
          ? null
          : createOnlineGameView(
              room.state,
              viewerPlayerId,
              room.revision,
              room.recentEvents,
              room.eventHistory,
              room.paused,
              room.debugPlayerIds.has(viewerPlayerId),
              room.deadlineAt,
              room.tradeDeadlineAt,
            ),
    };
  }

  connectedViews(roomCode: string): readonly {
    readonly socketId: string;
    readonly view: OnlineRoomView;
  }[] {
    const room = this.rooms.get(roomCode);
    if (room === undefined) return [];
    return [...room.members.values()].flatMap((member) =>
      [...member.socketIds].map((socketId) => ({
        socketId,
        view: this.view(room, member.id),
      })),
    );
  }

  shutdown(): void {
    for (const room of this.rooms.values()) {
      this.clearTimer(room);
      this.clearTradeTimer(room);
      this.clearInactivityTimer(room);
      for (const member of room.members.values()) {
        if (member.removalTimer !== null) clearTimeout(member.removalTimer);
      }
    }
    this.rooms.clear();
  }

  private lobby(room: RoomRecord, settings = room.settings): LobbyConfig {
    const players: readonly LocalLobbyPlayer[] = [...room.members.values()]
      .sort((first, second) => first.createdAt - second.createdAt)
      .map((member) => ({
        id: member.id,
        name: member.name,
        colorId: member.colorId,
        avatarId: member.avatarId,
      }));
    return { ...settings, players };
  }

  private commit(
    room: RoomRecord,
    state: GameState,
    events: readonly GameEvent[],
    processedActionId: string,
  ): void {
    room.state = state;
    room.revision += 1;
    room.recentEvents = events;
    room.eventHistory = [...room.eventHistory, ...events].slice(-EVENT_HISTORY_LIMIT);
    room.processedActions.set(processedActionId, room.revision);
    while (room.processedActions.size > PROCESSED_ACTION_LIMIT) {
      const oldest = room.processedActions.keys().next().value;
      if (oldest === undefined) break;
      room.processedActions.delete(oldest);
    }
    if (state.turn.phase === 'GAME_OVER') room.phase = 'FINISHED';
    this.refreshTimers(room, events, false);
    this.hooks.onRoomChanged(room.code);
  }

  private refreshTimers(room: RoomRecord, events: readonly GameEvent[], forceReset: boolean): void {
    if (room.state === null || room.paused) return;
    this.refreshTurnTimer(room, events, forceReset);
    this.refreshTradeTimer(room, forceReset);
  }

  private refreshTurnTimer(
    room: RoomRecord,
    events: readonly GameEvent[],
    forceReset: boolean,
  ): void {
    if (room.state === null) return;
    const step = timedStep(room.state);
    if (step === null) {
      room.timerKey = null;
      room.deadlineAt = null;
      this.clearTimer(room);
      return;
    }
    const now = Date.now();
    const timerKeyChanged = room.timerKey !== step.key;
    const returningToActionAfterTimedAction =
      !forceReset && timerKeyChanged && step.key.startsWith('actions-') && hasTimerBoost(events);
    if (returningToActionAfterTimedAction) {
      room.deadlineAt = now + 20_000;
    } else if (forceReset || timerKeyChanged || room.deadlineAt === null) {
      room.deadlineAt = now + step.durationMs;
    } else if (hasTimerBoost(events) && room.deadlineAt - now < 20_000) {
      room.deadlineAt = now + 20_000;
    }
    room.timerKey = step.key;
    this.scheduleTimer(room, step);
  }

  private refreshTradeTimer(room: RoomRecord, forceReset: boolean): void {
    if (room.state === null) return;
    const step = tradeTimedStep(room.state);
    if (step === null) {
      room.tradeTimerKey = null;
      room.tradeDeadlineAt = null;
      this.clearTradeTimer(room);
      return;
    }
    if (forceReset || room.tradeTimerKey !== step.key || room.tradeDeadlineAt === null) {
      room.tradeDeadlineAt = Date.now() + step.durationMs;
    }
    room.tradeTimerKey = step.key;
    this.scheduleTradeTimer(room, step);
  }

  private scheduleTimer(room: RoomRecord, step: TimedStep): void {
    this.clearTimer(room);
    if (room.deadlineAt === null || room.paused) return;
    const generation = room.timerGeneration;
    room.timer = setTimeout(
      () => {
        if (
          room.timerGeneration !== generation ||
          room.paused ||
          room.state === null ||
          room.timerKey !== step.key
        ) {
          return;
        }
        const automaticAction: GameAction =
          step.kind === 'EXPIRE_TRADE' && step.tradeId !== undefined
            ? {
                id: actionId(`server-expire-${randomUUID()}`),
                type: 'EXPIRE_TRADE',
                actorId: step.actorId,
                tradeId: tradeId(step.tradeId),
              }
            : {
                id: actionId(`server-timeout-${randomUUID()}`),
                type: 'AUTO_TIMEOUT',
                actorId: step.actorId,
              };
        const developerMode = room.debugPlayerIds.has(step.actorId);
        const result = dispatch(room.state, automaticAction, {
          skipSevenDiscards: developerMode,
          ignoreRobber: developerMode,
          discardExemptPlayerIds: [...room.debugPlayerIds],
        });
        if (result.ok) this.commit(room, result.state, result.events, automaticAction.id);
        else {
          room.deadlineAt = Date.now() + 1_000;
          this.scheduleTimer(room, step);
        }
      },
      Math.max(0, room.deadlineAt - Date.now()),
    );
  }

  private clearTimer(room: RoomRecord): void {
    room.timerGeneration += 1;
    if (room.timer !== null) clearTimeout(room.timer);
    room.timer = null;
  }

  private scheduleTradeTimer(room: RoomRecord, step: TimedStep): void {
    this.clearTradeTimer(room);
    if (room.tradeDeadlineAt === null || room.paused) return;
    const generation = room.tradeTimerGeneration;
    room.tradeTimer = setTimeout(
      () => {
        if (
          room.tradeTimerGeneration !== generation ||
          room.paused ||
          room.state === null ||
          room.tradeTimerKey !== step.key ||
          step.tradeId === undefined
        ) {
          return;
        }
        const automaticAction: GameAction = {
          id: actionId(`server-expire-${randomUUID()}`),
          type: 'EXPIRE_TRADE',
          actorId: step.actorId,
          tradeId: tradeId(step.tradeId),
        };
        const result = dispatch(room.state, automaticAction);
        if (result.ok) this.commit(room, result.state, result.events, automaticAction.id);
        else {
          room.tradeDeadlineAt = Date.now() + 1_000;
          this.scheduleTradeTimer(room, step);
        }
      },
      Math.max(0, room.tradeDeadlineAt - Date.now()),
    );
  }

  private clearTradeTimer(room: RoomRecord): void {
    room.tradeTimerGeneration += 1;
    if (room.tradeTimer !== null) clearTimeout(room.tradeTimer);
    room.tradeTimer = null;
  }

  private clearInactivityTimer(room: RoomRecord): void {
    if (room.inactivityTimer !== null) clearTimeout(room.inactivityTimer);
    room.inactivityTimer = null;
  }

  private scheduleInactivityCleanup(room: RoomRecord): void {
    this.clearInactivityTimer(room);
    if ([...room.members.values()].some((member) => member.socketIds.size > 0)) return;
    // A fully abandoned match should not keep auto-playing turns for the entire reconnect window.
    // Reconnection restarts the current decision with a fresh deadline.
    this.clearTimer(room);
    room.timerKey = null;
    room.deadlineAt = null;
    this.clearTradeTimer(room);
    room.tradeTimerKey = null;
    room.tradeDeadlineAt = null;
    room.inactivityTimer = setTimeout(() => {
      room.inactivityTimer = null;
      if (
        this.rooms.get(room.code) !== room ||
        [...room.members.values()].some((member) => member.socketIds.size > 0)
      ) {
        return;
      }
      this.clearTimer(room);
      this.clearTradeTimer(room);
      for (const member of room.members.values()) {
        if (member.removalTimer !== null) clearTimeout(member.removalTimer);
      }
      this.rooms.delete(room.code);
    }, this.inactiveRoomTtlMs);
  }

  private removeMember(room: RoomRecord, player: PlayerId): void {
    const member = room.members.get(player);
    if (member?.removalTimer !== null && member?.removalTimer !== undefined) {
      clearTimeout(member.removalTimer);
    }
    room.members.delete(player);
    room.debugPlayerIds.delete(player);
    if (room.members.size === 0) {
      this.clearTimer(room);
      this.clearTradeTimer(room);
      this.clearInactivityTimer(room);
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostPlayerId === player) {
      const nextHost = [...room.members.values()].sort(
        (first, second) => first.createdAt - second.createdAt,
      )[0];
      if (nextHost !== undefined) room.hostPlayerId = nextHost.id;
    }
    this.scheduleInactivityCleanup(room);
    this.hooks.onRoomChanged(room.code);
  }
}
