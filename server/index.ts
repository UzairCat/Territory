import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

import { Server } from 'socket.io';

import {
  createRoomPayloadSchema,
  credentialsSchema,
  joinRoomPayloadSchema,
  normalizeRoomCode,
  parseGameAction,
  parseLobbySettings,
  parsePlayerProfile,
  type ClientToServerEvents,
  type InterServerEvents,
  type OnlineAck,
  type OnlineRoomView,
  type OnlineSessionCredentials,
  type SessionAck,
  type ServerToClientEvents,
  type SocketSessionData,
} from '../src/multiplayer/protocol';
import { createOnlineRoomPatch } from '../src/multiplayer/view-patch';
import { RoomManager } from './room-manager';

const port = Number(process.env.PORT ?? process.env.TERRITORY_SERVER_PORT ?? 3001);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT or TERRITORY_SERVER_PORT must be a valid TCP port.');
}
const configuredOrigins = process.env.TERRITORY_CLIENT_ORIGINS?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const clientDist = resolve(process.cwd(), 'dist');
const serveClient =
  process.env.TERRITORY_SERVE_CLIENT === 'true' || process.env.NODE_ENV === 'production';
const allowedOrigins =
  configuredOrigins ?? (serveClient ? true : ['http://localhost:5173', 'http://127.0.0.1:5173']);
const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const rateWindows = new Map<string, { startedAt: number; count: number }>();

function rateLimit(socketId: string, scope: string, maximum: number, windowMs: number): boolean {
  const key = `${socketId}:${scope}`;
  const now = Date.now();
  const current = rateWindows.get(key);
  if (current === undefined || now - current.startedAt >= windowMs) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= maximum;
}

function rateLimitError<T = undefined>(): OnlineAck<T> {
  return {
    ok: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many multiplayer requests. Wait a moment and try again.',
      retryable: true,
    },
  };
}

async function regularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

interface StaticAsset {
  readonly file: string;
  readonly size: number;
  readonly cacheControl: string;
  readonly contentEncoding: 'br' | 'gzip' | null;
  readonly contentType: string;
}

function acceptedEncoding(header: string | undefined): readonly ('br' | 'gzip')[] {
  if (header === undefined) return [];
  const accepted = header
    .split(',')
    .map((entry) => {
      const [name, ...parameters] = entry.trim().split(';');
      const quality = parameters
        .map((parameter) => parameter.trim().match(/^q=(\d*(?:\.\d+)?)$/i)?.[1])
        .find((value) => value !== undefined);
      return {
        name: name?.toLocaleLowerCase(),
        quality: quality === undefined ? 1 : Number(quality),
      };
    })
    .filter((entry) => Number.isFinite(entry.quality) && entry.quality >= 0 && entry.quality <= 1);
  return (['br', 'gzip'] as const)
    .map((encoding, preference) => ({
      encoding,
      preference,
      quality:
        accepted.find((entry) => entry.name === encoding)?.quality ??
        accepted.find((entry) => entry.name === '*')?.quality ??
        0,
    }))
    .filter((entry) => entry.quality > 0)
    .sort((first, second) => second.quality - first.quality || first.preference - second.preference)
    .map((entry) => entry.encoding);
}

async function resolveStaticAsset(
  pathname: string,
  acceptEncoding: string | undefined,
): Promise<StaticAsset | null> {
  const decoded = decodeURIComponent(pathname);
  const requested = resolve(clientDist, `.${decoded}`);
  if (requested !== clientDist && !requested.startsWith(`${clientDist}${sep}`)) return null;
  const requestedExists = await regularFile(requested);
  if (!requestedExists && extname(decoded) !== '') return null;
  const file = requestedExists ? requested : resolve(clientDist, 'index.html');
  if (!(await regularFile(file))) return null;
  const originalExtension = extname(file);
  for (const encoding of acceptedEncoding(acceptEncoding)) {
    const encodedFile = `${file}.${encoding === 'gzip' ? 'gz' : 'br'}`;
    if (!(await regularFile(encodedFile))) continue;
    const metadata = await stat(encodedFile);
    return {
      file: encodedFile,
      size: metadata.size,
      cacheControl:
        originalExtension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
      contentEncoding: encoding,
      contentType: contentTypes[originalExtension] ?? 'application/octet-stream',
    };
  }
  const metadata = await stat(file);
  return {
    file,
    size: metadata.size,
    cacheControl:
      originalExtension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    contentEncoding: null,
    contentType: contentTypes[originalExtension] ?? 'application/octet-stream',
  };
}

function byteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (match === undefined || match === null || (match[1] === '' && match[2] === '')) return null;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] === '' ? size - 1 : Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0) return null;
  if (start >= size || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
}

const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: 'territory-multiplayer' }));
    return;
  }
  if (serveClient && (request.method === 'GET' || request.method === 'HEAD')) {
    const pathname = new URL(request.url ?? '/', 'http://territory.local').pathname;
    void resolveStaticAsset(pathname, request.headers['accept-encoding'])
      .then((asset) => {
        if (asset === null) {
          response.writeHead(404, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'Not found' }));
          return;
        }
        const range =
          asset.contentEncoding === null ? byteRange(request.headers.range, asset.size) : null;
        if (
          request.headers.range !== undefined &&
          range === null &&
          asset.contentEncoding === null
        ) {
          response.writeHead(416, {
            'content-range': `bytes */${asset.size}`,
            'cache-control': asset.cacheControl,
          });
          response.end();
          return;
        }
        const status = range === null ? 200 : 206;
        const contentLength = range === null ? asset.size : range.end - range.start + 1;
        response.writeHead(status, {
          'content-type': asset.contentType,
          'cache-control': asset.cacheControl,
          'content-length': contentLength,
          'accept-ranges': asset.contentEncoding === null ? 'bytes' : 'none',
          vary: 'Accept-Encoding',
          ...(asset.contentEncoding === null ? {} : { 'content-encoding': asset.contentEncoding }),
          ...(range === null
            ? {}
            : { 'content-range': `bytes ${range.start}-${range.end}/${asset.size}` }),
        });
        if (request.method === 'HEAD') {
          response.end();
          return;
        }
        const stream = createReadStream(asset.file, range ?? undefined);
        stream.on('error', () => response.destroy());
        stream.pipe(response);
      })
      .catch(() => {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: 'Failed to read client asset' }));
      });
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketSessionData
>(httpServer, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 100_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 90_000,
    skipMiddlewares: false,
  },
  perMessageDeflate: {
    threshold: 1_024,
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    concurrencyLimit: 10,
    zlibDeflateOptions: { level: 1 },
  },
});

interface SentSocketView {
  readonly view: OnlineRoomView;
  readonly version: number;
}

const sentSocketViews = new Map<string, SentSocketView>();

function synchronizedSession(
  socketId: string,
  result: OnlineAck<SessionAck>,
): OnlineAck<SessionAck> {
  if (!result.ok) return result;
  const room = { ...result.room, syncVersion: 0 };
  sentSocketViews.set(socketId, { view: room, version: 0 });
  return { ...result, room };
}

function broadcast(roomCode: string): void {
  for (const target of manager.connectedViews(roomCode)) {
    const supportsRoomPatches =
      io.sockets.sockets.get(target.socketId)?.data.supportsRoomPatches === true;
    if (!supportsRoomPatches) {
      const view = { ...target.view, syncVersion: 0 };
      sentSocketViews.set(target.socketId, { view, version: 0 });
      io.to(target.socketId).emit('room:snapshot', view);
      continue;
    }
    const previous = sentSocketViews.get(target.socketId);
    if (previous === undefined || previous.view.code !== target.view.code) {
      const view = { ...target.view, syncVersion: 0 };
      sentSocketViews.set(target.socketId, { view, version: 0 });
      io.to(target.socketId).emit('room:snapshot', view);
      continue;
    }
    const patch = createOnlineRoomPatch(previous.view, target.view, previous.version);
    const version = patch.version;
    const view = { ...target.view, syncVersion: version };
    sentSocketViews.set(target.socketId, { view, version });
    if (JSON.stringify(patch).length < JSON.stringify(view).length * 0.82) {
      io.to(target.socketId).emit('room:patch', patch);
    } else {
      io.to(target.socketId).emit('room:snapshot', view);
    }
  }
}

const manager = new RoomManager({ onRoomChanged: broadcast });

function parsedCredentials(value: unknown): OnlineSessionCredentials | null {
  const result = credentialsSchema.safeParse(value);
  return result.success ? (result.data as OnlineSessionCredentials) : null;
}

function invalidPayload<T = undefined>(): OnlineAck<T> {
  return {
    ok: false,
    error: { code: 'INVALID_PAYLOAD', message: 'The request payload was invalid.' },
  };
}

io.on('connection', (socket) => {
  socket.on('room:create', (payload, acknowledge) => {
    if (!rateLimit(socket.id, 'entry', 10, 60_000)) {
      acknowledge(rateLimitError());
      return;
    }
    const parsed = createRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(invalidPayload());
      return;
    }
    socket.data.supportsRoomPatches = parsed.data.supportsRoomPatches === true;
    const result = synchronizedSession(
      socket.id,
      manager.create(parsed.data.displayName, socket.id),
    );
    if (result.ok) {
      socket.data.roomCode = result.credentials.roomCode;
      socket.data.playerId = result.credentials.playerId;
      void socket.join(result.credentials.roomCode);
      socket.emit('session:accepted', { credentials: result.credentials, room: result.room });
    }
    acknowledge(result);
  });

  socket.on('room:join', (payload, acknowledge) => {
    if (!rateLimit(socket.id, 'entry', 10, 60_000)) {
      acknowledge(rateLimitError());
      return;
    }
    const parsed = joinRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(invalidPayload());
      return;
    }
    socket.data.supportsRoomPatches = parsed.data.supportsRoomPatches === true;
    const code = normalizeRoomCode(parsed.data.roomCode);
    const result = synchronizedSession(
      socket.id,
      manager.join(code, parsed.data.displayName, socket.id),
    );
    if (result.ok) {
      socket.data.roomCode = result.credentials.roomCode;
      socket.data.playerId = result.credentials.playerId;
      void socket.join(result.credentials.roomCode);
      socket.emit('session:accepted', { credentials: result.credentials, room: result.room });
    }
    acknowledge(result);
  });

  socket.on('session:resume', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    if (credentials === null) {
      acknowledge(invalidPayload());
      return;
    }
    socket.data.supportsRoomPatches = payload.supportsRoomPatches === true;
    const result = synchronizedSession(socket.id, manager.resume(credentials, socket.id));
    if (result.ok) {
      socket.data.roomCode = credentials.roomCode;
      socket.data.playerId = credentials.playerId;
      void socket.join(credentials.roomCode);
      socket.emit('session:accepted', { credentials: result.credentials, room: result.room });
    }
    acknowledge(result);
  });

  socket.on('room:update-settings', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    const settings = parseLobbySettings(payload?.settings);
    acknowledge(
      credentials === null || settings === null
        ? invalidPayload()
        : manager.updateSettings(credentials, settings),
    );
  });

  socket.on('room:update-profile', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    const profile = parsePlayerProfile(payload?.profile);
    acknowledge(
      credentials === null || profile === null
        ? invalidPayload()
        : manager.updateProfile(credentials, profile.avatarId, profile.colorId),
    );
  });

  socket.on('room:set-ready', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    acknowledge(
      credentials === null || typeof payload?.ready !== 'boolean'
        ? invalidPayload()
        : manager.setReady(credentials, payload.ready),
    );
  });

  socket.on('room:start', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    acknowledge(credentials === null ? invalidPayload() : manager.start(credentials));
  });

  socket.on('room:rematch', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    acknowledge(credentials === null ? invalidPayload() : manager.rematch(credentials));
  });

  socket.on('room:return-to-lobby', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    acknowledge(credentials === null ? invalidPayload() : manager.returnToLobby(credentials));
  });

  socket.on('room:pause', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    acknowledge(credentials === null ? invalidPayload() : manager.pause(credentials, true));
  });

  socket.on('room:unpause', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    acknowledge(credentials === null ? invalidPayload() : manager.pause(credentials, false));
  });

  socket.on('room:leave', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    const result = credentials === null ? invalidPayload() : manager.leave(credentials);
    if (result.ok) sentSocketViews.delete(socket.id);
    acknowledge(result);
  });

  socket.on('game:set-debug-mode', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    acknowledge(
      credentials === null || typeof payload?.enabled !== 'boolean'
        ? invalidPayload()
        : manager.setDebugMode(credentials, payload.enabled),
    );
  });

  socket.on('game:grant-progress-cards', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    acknowledge(credentials === null ? invalidPayload() : manager.grantProgressCards(credentials));
  });

  socket.on('game:action', (payload, acknowledge) => {
    if (!rateLimit(socket.id, 'actions', 80, 10_000)) {
      acknowledge(rateLimitError());
      return;
    }
    const credentials = parsedCredentials(payload?.credentials);
    const action = parseGameAction(payload?.action);
    if (
      credentials === null ||
      action === null ||
      !Number.isSafeInteger(payload?.expectedRevision) ||
      payload.expectedRevision < 0
    ) {
      acknowledge(invalidPayload());
      return;
    }
    acknowledge(manager.submit(credentials, payload.expectedRevision, action));
  });

  socket.on('disconnect', () => {
    sentSocketViews.delete(socket.id);
    manager.disconnect(socket.id);
    for (const key of rateWindows.keys()) {
      if (key.startsWith(`${socket.id}:`)) rateWindows.delete(key);
    }
  });
});

httpServer.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Territory multiplayer server listening on http://localhost:${port}\n`);
});
