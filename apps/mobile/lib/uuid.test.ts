import { describe, expect, it, vi } from 'vitest';

const expoCrypto = vi.hoisted(() => ({
  randomUUID: vi.fn(),
}));

vi.mock('expo-crypto', () => expoCrypto);

import { generateMobileUuid } from './uuid';

describe('generateMobileUuid', () => {
  it('uses Expo Crypto rather than the browser Web Crypto global', () => {
    expoCrypto.randomUUID.mockReturnValueOnce('11111111-1111-4111-8111-111111111111');
    expoCrypto.randomUUID.mockReturnValueOnce('22222222-2222-4222-8222-222222222222');

    expect(generateMobileUuid()).toBe('11111111-1111-4111-8111-111111111111');
    expect(generateMobileUuid()).toBe('22222222-2222-4222-8222-222222222222');
    expect(expoCrypto.randomUUID).toHaveBeenCalledTimes(2);
  });
});
