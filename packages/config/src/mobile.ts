import { z } from 'zod';

import { optionalSupabaseEnvironmentSchema, publicAppEnvironmentSchema } from './shared';

const mobileEnvironmentSchema = z
  .object({
    appEnvironment: publicAppEnvironmentSchema.default('development'),
  })
  .and(optionalSupabaseEnvironmentSchema);

export type MobileEnvironment = z.output<typeof mobileEnvironmentSchema>;

export function parseMobileEnvironment(
  environment: Record<string, string | undefined>,
): MobileEnvironment {
  return mobileEnvironmentSchema.parse({
    appEnvironment: environment.EXPO_PUBLIC_APP_ENV,
    url: environment.EXPO_PUBLIC_SUPABASE_URL || undefined,
    publishableKey: environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined,
  });
}
