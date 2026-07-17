import { z } from 'zod';

export const publicAppEnvironmentSchema = z.enum(['development', 'test', 'production']);

export const optionalSupabaseEnvironmentSchema = z
  .object({
    url: z.url().optional(),
    publishableKey: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.url) !== Boolean(value.publishableKey)) {
      context.addIssue({
        code: 'custom',
        message: 'Supabase URL and publishable key must be supplied together.',
      });
    }
  });

export interface SupabasePublicConfiguration {
  readonly url: string;
  readonly publishableKey: string;
}

export function requireSupabasePublicConfiguration(configuration: {
  readonly url?: string | undefined;
  readonly publishableKey?: string | undefined;
}): SupabasePublicConfiguration {
  if (configuration.url === undefined || configuration.publishableKey === undefined) {
    throw new Error('Local Supabase public URL and publishable key are required.');
  }

  return { url: configuration.url, publishableKey: configuration.publishableKey };
}
