import * as Crypto from 'expo-crypto';

/**
 * Generates UUIDs through Expo's native-compatible crypto module.
 *
 * Expo Go does not guarantee the browser Web Crypto API, so mobile runtime
 * code must not generate UUIDs outside this boundary.
 */
export function generateMobileUuid(): string {
  return Crypto.randomUUID();
}
