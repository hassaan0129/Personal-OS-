import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getWebSupabaseClient } from './supabase';

const configuration = {
  url: 'http://127.0.0.1:54321',
  publishableKey: 'sb_publishable_test_key',
};

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

beforeEach(() => {
  Reflect.deleteProperty(globalThis, '__personalOsWebSupabaseClient');
  Reflect.deleteProperty(globalThis, '__personalOsWebSupabaseConfiguration');
  Reflect.defineProperty(globalThis, 'window', { configurable: true, value: {} });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, '__personalOsWebSupabaseClient');
  Reflect.deleteProperty(globalThis, '__personalOsWebSupabaseConfiguration');
  if (windowDescriptor === undefined) Reflect.deleteProperty(globalThis, 'window');
  else Reflect.defineProperty(globalThis, 'window', windowDescriptor);
});

describe('web Supabase client', () => {
  it('returns the same browser client for repeated access', () => {
    const first = getWebSupabaseClient(configuration);
    const second = getWebSupabaseClient(configuration);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });
});
