// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetOnlineStoreForTests } from '../../src/app/stores/online-store';

describe('online session storage resilience', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetOnlineStoreForTests();
  });

  it('does not block the online flow when browser storage rejects access', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable.', 'SecurityError');
    });

    expect(() => resetOnlineStoreForTests()).not.toThrow();
  });
});
