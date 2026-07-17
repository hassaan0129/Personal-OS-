'use client';

import { createSupabaseClient } from '@personal-os/api-client';
import type { SupabasePublicConfiguration } from '@personal-os/config';

type WebSupabaseClient = ReturnType<typeof createSupabaseClient>;

declare global {
  var __personalOsWebSupabaseClient: WebSupabaseClient | undefined;
  var __personalOsWebSupabaseConfiguration: string | undefined;
}

function configurationIdentity(configuration: SupabasePublicConfiguration): string {
  return `${configuration.url}\u0000${configuration.publishableKey}`;
}

export function getWebSupabaseClient(
  configuration: SupabasePublicConfiguration,
): WebSupabaseClient | null {
  if (typeof window === 'undefined') return null;

  const identity = configurationIdentity(configuration);
  if (globalThis.__personalOsWebSupabaseClient === undefined) {
    globalThis.__personalOsWebSupabaseClient = createSupabaseClient(
      configuration.url,
      configuration.publishableKey,
    );
    globalThis.__personalOsWebSupabaseConfiguration = identity;
  } else if (globalThis.__personalOsWebSupabaseConfiguration !== identity) {
    throw new Error('The browser Supabase client is already configured for a different project.');
  }

  return globalThis.__personalOsWebSupabaseClient;
}
