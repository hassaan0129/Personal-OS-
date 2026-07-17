import { z } from 'zod';

import { optionalSupabaseEnvironmentSchema, publicAppEnvironmentSchema } from './shared';

const webEnvironmentSchema = z
  .object({
    appEnvironment: publicAppEnvironmentSchema.default('development'),
    appUrl: z.url().default('http://localhost:3000'),
  })
  .and(optionalSupabaseEnvironmentSchema);

export type WebEnvironment = z.output<typeof webEnvironmentSchema>;

export function parseWebEnvironment(
  environment: Record<string, string | undefined>,
): WebEnvironment {
  return webEnvironmentSchema.parse({
    appEnvironment: environment.NEXT_PUBLIC_APP_ENV,
    appUrl: environment.NEXT_PUBLIC_APP_URL,
    url: environment.NEXT_PUBLIC_SUPABASE_URL || undefined,
    publishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined,
  });
}
