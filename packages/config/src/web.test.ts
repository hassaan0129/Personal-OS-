import { describe, expect, it } from 'vitest';

import { parseWebEnvironment } from './web';

describe('web environment validation', () => {
  it('uses safe local defaults before Supabase is configured', () => {
    expect(parseWebEnvironment({})).toMatchObject({
      appEnvironment: 'development',
      appUrl: 'http://localhost:3000',
    });
  });

  it('rejects a partial Supabase public configuration', () => {
    expect(() =>
      parseWebEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }),
    ).toThrow();
  });
});
