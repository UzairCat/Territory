type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

function isJsonValue(value: unknown, ancestors: Set<object>): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value !== 'object') {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }

  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isJsonValue(entry, ancestors))
    : Object.entries(value).every(
        ([, entry]) => entry !== undefined && isJsonValue(entry, ancestors),
      );
  ancestors.delete(value);

  return valid;
}

export function isJsonSerializable(value: unknown): value is JsonValue {
  return isJsonValue(value, new Set());
}
