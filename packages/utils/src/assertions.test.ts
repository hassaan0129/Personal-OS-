import { describe, expect, it } from 'vitest';

import { isDefined } from './assertions';

describe('isDefined', () => {
  it('removes nullish values', () => {
    expect([1, null, undefined, 2].filter(isDefined)).toEqual([1, 2]);
  });
});
