import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

import { Server } from 'socket.io';

import {
  createRoomPayloadSchema,
  credentialsSchema,
  joinRoomPayloadSchema,
  normalizeRoomCode,
  parseGameAction,
  parseLobbySettings,
  type ClientToServerEvents,
  type InterServerEvents,
  type OnlineAck,
  type OnlineSessionCredentials,
  type ServerToClientEvents,
  type SocketSessionData,
} from '../src/multiplayer/protocol';
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
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
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

async function serveStatic(pathname: string): Promise<{
  readonly body: Buffer;
  readonly contentType: string;
} | null> {
  const decoded = decodeURIComponent(pathname);
  const requested = resolve(clientDist, `.${decoded}`);
  if (requested !== clientDist && !requested.startsWith(`${clientDist}${sep}`)) return null;
  const requestedExists = await regularFile(requested);
  if (!requestedExists && extname(decoded) !== '') return null;
  const file = requestedExists ? requested : resolve(clientDist, 'index.html');
  if (!(await regularFile(file))) return null;
  return {
    body: await readFile(file),
    contentType: contentTypes[extname(file)] ?? 'application/octet-stream',
  };
}

const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: 'territory-multiplayer' }));
    return;
  }
  if (serveClient && (request.method === 'GET' || request.method === 'HEAD')) {
    const pathname = new URL(request.url ?? '/', 'http://territory.local').pathname;
    void serveStatic(pathname)
      .then((asset) => {
        if (asset === null) {
          response.writeHead(404, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'Not found' }));
          return;
        }
        response.writeHead(200, {
          'content-type': asset.contentType,
          'cache-control': pathname === '/' ? 'no-cache' : 'public, max-age=3600',
        });
        response.end(request.method === 'HEAD' ? undefined : asset.body);
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
});

function broadcast(roomCode: string): void {
  for (const target of manager.connectedViews(roomCode)) {
    io.to(target.socketId).emit('room:snapshot', target.view);
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
    const result = manager.create(parsed.data.displayName, socket.id);
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
    const code = normalizeRoomCode(parsed.data.roomCode);
    const result = manager.join(code, parsed.data.displayName, socket.id);
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
    const result = manager.resume(credentials, socket.id);
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

  socket.on('room:start', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    acknowledge(credentials === null ? invalidPayload() : manager.start(credentials));
  });

  socket.on('room:rematch', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    acknowledge(credentials === null ? invalidPayload() : manager.rematch(credentials));
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
    acknowledge(credentials === null ? invalidPayload() : manager.leave(credentials));
  });

  socket.on('game:set-debug-mode', (payload, acknowledge) => {
    const credentials = parsedCredentials(payload?.credentials);
    acknowledge(
      credentials === null || typeof payload?.enabled !== 'boolean'
        ? invalidPayload()
        : manager.setDebugMode(credentials, payload.enabled),
    );
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
    manager.disconnect(socket.id);
    for (const key of rateWindows.keys()) {
      if (key.startsWith(`${socket.id}:`)) rateWindows.delete(key);
    }
  });
});

httpServer.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Territory multiplayer server listening on http://localhost:${port}\n`);
});
