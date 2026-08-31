import type { OnlinePatchOperation, OnlineRoomPatch, OnlineRoomView } from './protocol';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function equalJson(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (Array.isArray(first) && Array.isArray(second)) {
    return (
      first.length === second.length &&
      first.every((value, index) => equalJson(value, second[index]))
    );
  }
  if (!isObject(first) || !isObject(second)) return false;
  const firstKeys = Object.keys(first).filter((key) => first[key] !== undefined);
  const secondKeys = Object.keys(second).filter((key) => second[key] !== undefined);
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every((key) => Object.hasOwn(second, key) && equalJson(first[key], second[key]))
  );
}

function overlappingTail(first: readonly unknown[], second: readonly unknown[]): number {
  const maximum = Math.min(first.length, second.length);
  for (let retained = maximum; retained > 0; retained -= 1) {
    const firstOffset = first.length - retained;
    let matches = true;
    for (let index = 0; index < retained; index += 1) {
      if (!equalJson(first[firstOffset + index], second[index])) {
        matches = false;
        break;
      }
    }
    if (matches) return retained;
  }
  return 0;
}

function collectOperations(
  previous: unknown,
  next: unknown,
  path: readonly string[],
  operations: OnlinePatchOperation[],
): void {
  if (equalJson(previous, next)) return;
  if (next === undefined) {
    operations.push({ type: 'REMOVE', path });
    return;
  }
  if (Array.isArray(previous) && Array.isArray(next)) {
    const retainTail = overlappingTail(previous, next);
    const tailOperation: OnlinePatchOperation = {
      type: 'ARRAY_TAIL',
      path,
      retainTail,
      append: next.slice(retainTail),
    };
    const setOperation: OnlinePatchOperation = { type: 'SET', path, value: next };
    operations.push(
      JSON.stringify(tailOperation).length < JSON.stringify(setOperation).length
        ? tailOperation
        : setOperation,
    );
    return;
  }
  if (isObject(previous) && isObject(next)) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const key of keys) {
      collectOperations(previous[key], next[key], [...path, key], operations);
    }
    return;
  }
  operations.push({ type: 'SET', path, value: next });
}

export function createOnlineRoomPatch(
  previous: OnlineRoomView,
  next: OnlineRoomView,
  baseVersion: number,
): OnlineRoomPatch {
  const operations: OnlinePatchOperation[] = [];
  const previousValue: JsonObject = { ...previous };
  const nextValue: JsonObject = { ...next };
  delete previousValue.syncVersion;
  delete nextValue.syncVersion;
  collectOperations(previousValue, nextValue, [], operations);
  return {
    roomCode: next.code,
    baseVersion,
    version: baseVersion + 1,
    operations,
  };
}

function safePath(path: readonly string[]): boolean {
  return !path.some(
    (part) => part === '__proto__' || part === 'prototype' || part === 'constructor',
  );
}

function applyAtPath(
  current: unknown,
  path: readonly string[],
  operation: OnlinePatchOperation,
  depth = 0,
): unknown {
  if (depth === path.length) {
    switch (operation.type) {
      case 'SET':
        return operation.value;
      case 'REMOVE':
        return undefined;
      case 'ARRAY_TAIL': {
        if (!Array.isArray(current) || operation.retainTail > current.length) {
          throw new Error('Room patch array base does not match the current snapshot.');
        }
        const currentArray = current as unknown[];
        return currentArray
          .slice(currentArray.length - operation.retainTail)
          .concat(operation.append);
      }
    }
  }

  if (!isObject(current) && !Array.isArray(current)) {
    throw new Error('Room patch path does not match the current snapshot.');
  }
  const key = path[depth]!;
  const clone: JsonObject | unknown[] = Array.isArray(current)
    ? Array.from(current as unknown[])
    : { ...current };
  const previousChild = (current as JsonObject)[key];
  const nextChild = applyAtPath(previousChild, path, operation, depth + 1);
  if (nextChild === undefined && operation.type === 'REMOVE') {
    if (Array.isArray(clone)) throw new Error('Room patches cannot remove array indexes.');
    delete clone[key];
  } else {
    (clone as JsonObject)[key] = nextChild;
  }
  return clone;
}

export function applyOnlineRoomPatch(
  current: OnlineRoomView,
  patch: OnlineRoomPatch,
): OnlineRoomView | null {
  if (
    current.code !== patch.roomCode ||
    (current.syncVersion ?? 0) !== patch.baseVersion ||
    patch.version !== patch.baseVersion + 1
  ) {
    return null;
  }
  let next: unknown = current;
  try {
    for (const operation of patch.operations) {
      if (!safePath(operation.path)) return null;
      next = applyAtPath(next, operation.path, operation);
    }
  } catch {
    return null;
  }
  if (!isObject(next)) return null;
  return { ...(next as unknown as OnlineRoomView), syncVersion: patch.version };
}
