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
