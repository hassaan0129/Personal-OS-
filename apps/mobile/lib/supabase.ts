import 'react-native-url-polyfill/auto';

import { createSupabaseClient } from '@personal-os/api-client';
import { parseMobileEnvironment, requireSupabasePublicConfiguration } from '@personal-os/config';
import * as SecureStore from 'expo-secure-store';

import { generateMobileUuid } from './uuid';

const sessionStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

let client: ReturnType<typeof createSupabaseClient> | null = null;

export function getSupabaseClient() {
  if (client !== null) return client;
  const configuration = requireSupabasePublicConfiguration(
    parseMobileEnvironment({
      EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    }),
  );
  client = createSupabaseClient(configuration.url, configuration.publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storage: sessionStorage,
    },
  });
  return client;
}

export async function getDeviceId(): Promise<string> {
  const key = 'personal-os-device-id';
  const existing = await SecureStore.getItemAsync(key);
  if (existing !== null) return existing;
  const value = generateMobileUuid();
  await SecureStore.setItemAsync(key, value);
  return value;
}
