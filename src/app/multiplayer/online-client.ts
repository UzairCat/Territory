import { io, type Socket } from 'socket.io-client';

import type { ClientToServerEvents, ServerToClientEvents } from '../../multiplayer/protocol';

export type TerritorySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TerritorySocket | null = null;

export function getOnlineSocket(): TerritorySocket {
  const configuredUrl: unknown = import.meta.env.VITE_MULTIPLAYER_URL;
  const serverUrl =
    typeof configuredUrl === 'string' && configuredUrl.length > 0 ? configuredUrl : undefined;
  socket ??= io(serverUrl, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4_000,
    timeout: 8_000,
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectOnlineSocket(): void {
  socket?.disconnect();
}
