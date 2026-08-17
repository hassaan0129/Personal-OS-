import type {
  CommandMetadata,
  CommandName,
  DeviceId,
  IanaTimeZone,
  LifeDayId,
  OperationId,
  Revision,
  TaskId,
  TaskPriority,
  UtcTimestamp,
  UserId,
} from '@personal-os/domain';
import { taskPriorities, taskReasonCodes, taskStatuses } from '@personal-os/domain';
import type {
  CurrentLifeDayRead,
  ProfileRow,
  TodaySnapshot,
  TodayTaskRead,
} from '@personal-os/database-contracts';
import type { CommandResult } from '@personal-os/sync-contracts';
import { z } from 'zod';

export const uuidSchema = z.uuid();

export const operationIdSchema = uuidSchema.transform((value) => value as OperationId);
export const deviceIdSchema = uuidSchema.transform((value) => value as DeviceId);
export const lifeDayIdSchema = uuidSchema.transform((value) => value as LifeDayId);
export const taskIdSchema = uuidSchema.transform((value) => value as TaskId);
export const userIdSchema = uuidSchema.transform((value) => value as UserId);

export const revisionSchema = z
  .number()
  .int()
  .positive()
  .transform((value) => value as Revision);

export const utcTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => value as UtcTimestamp);

export const ianaTimeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Expected a valid IANA time zone.' },
  )
  .transform((value) => value as IanaTimeZone);

export const commandNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)
  .transform((value) => value as CommandName);

export const commandMetadataSchema: z.ZodType<CommandMetadata> = z.object({
  operationId: operationIdSchema,
  deviceId: deviceIdSchema,
  schemaVersion: z.number().int().positive(),
  commandName: commandNameSchema,
  baseRevision: revisionSchema.nullable(),
  clientOccurredAt: utcTimestampSchema,
  clientTimezone: ianaTimeZoneSchema,
});

export const structuredReasonSchema = z
  .object({
    code: z.enum(taskReasonCodes),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.code === 'other' && value.note === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A note is required when reason code is other.',
        path: ['note'],
      });
    }
  });

const startLifeDayPayloadSchema = z.object({
  wokeAt: utcTimestampSchema,
  timezone: ianaTimeZoneSchema,
});

const closeLifeDayPayloadSchema = z.object({
  lifeDayId: lifeDayIdSchema,
  sleptAt: utcTimestampSchema,
  timezone: ianaTimeZoneSchema,
});

const repairLifeDayPayloadSchema = closeLifeDayPayloadSchema
  .extend({
    reason: z.object({
      code: z.enum(['forgot_to_record_sleep', 'correct_recording_error', 'other']),
      note: z.string().trim().min(1).max(500).optional(),
    }),
  })
  .superRefine((value, context) => {
    if (value.reason.code === 'other' && value.reason.note === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A note is required when repair reason code is other.',
        path: ['reason', 'note'],
      });
    }
  });

export const startLifeDayCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: startLifeDayPayloadSchema,
});

export const closeLifeDayCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: closeLifeDayPayloadSchema,
});

export const repairPreviousLifeDayCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: repairLifeDayPayloadSchema,
});

const taskPrioritySchema = z.enum(taskPriorities).transform((value) => value as TaskPriority);
const taskTitleSchema = z.string().trim().min(1).max(500);
const taskDescriptionSchema = z.string().trim().max(5000).nullable();
const estimatedMinutesSchema = z.number().int().min(1).max(1440).nullable();
const positionSchema = z.number().finite();

const taskScheduleSchema = z
  .object({
    scheduledAt: utcTimestampSchema.nullable(),
    scheduledTimezone: ianaTimeZoneSchema.nullable(),
  })
  .superRefine((value, context) => {
    if ((value.scheduledAt === null) !== (value.scheduledTimezone === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Scheduled timestamp and timezone must be supplied together.',
      });
    }
  });

export const createTaskCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: taskScheduleSchema.extend({
    lifeDayId: lifeDayIdSchema.nullable(),
    title: taskTitleSchema,
    description: taskDescriptionSchema,
    priority: taskPrioritySchema,
    estimatedMinutes: estimatedMinutesSchema,
    position: positionSchema,
  }),
});

export const updateTaskCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: taskScheduleSchema.extend({
    taskId: taskIdSchema,
    lifeDayId: lifeDayIdSchema.nullable(),
    title: taskTitleSchema,
    description: taskDescriptionSchema,
    priority: taskPrioritySchema,
    estimatedMinutes: estimatedMinutesSchema,
    position: positionSchema,
    status: z.enum(['planned', 'in_progress', 'overdue', 'archived']),
  }),
});

export const reorderTaskCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: z.object({
    taskId: taskIdSchema,
    position: positionSchema,
  }),
});

export const setTaskTopThreeCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: z.object({
    taskId: taskIdSchema,
    isTopThree: z.boolean(),
  }),
});

export const reopenTaskCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: z.object({
    taskId: taskIdSchema,
    lifeDayId: lifeDayIdSchema,
  }),
});

export const completeTaskCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: z.object({
    taskId: taskIdSchema,
    completedAt: utcTimestampSchema,
    lifeDayId: lifeDayIdSchema.nullable(),
  }),
});

export const rescheduleTaskCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: taskScheduleSchema.extend({
    taskId: taskIdSchema,
    reason: structuredReasonSchema,
  }),
});

export const cancelTaskCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: z.object({
    taskId: taskIdSchema,
    cancelledAt: utcTimestampSchema,
    reason: structuredReasonSchema,
  }),
});

export const resolveUnfinishedTaskCommandSchema = z.object({
  metadata: commandMetadataSchema,
  payload: z.discriminatedUnion('resolution', [
    z.object({
      taskId: taskIdSchema,
      resolution: z.literal('overdue'),
    }),
    taskScheduleSchema.extend({
      taskId: taskIdSchema,
      resolution: z.literal('reschedule'),
      targetLifeDayId: lifeDayIdSchema.nullable(),
      reason: structuredReasonSchema,
    }),
  ]),
});

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value) => value as CurrentLifeDayRead['operationalDate']);
const taskStatusSchema = z.enum(taskStatuses);

export const profileReadSchema: z.ZodType<ProfileRow> = z.object({
  id: userIdSchema,
  homeTimezone: ianaTimeZoneSchema,
  revision: revisionSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});

export const currentLifeDayReadSchema: z.ZodType<CurrentLifeDayRead> = z.object({
  id: lifeDayIdSchema,
  operationalDate: localDateSchema,
  timezone: ianaTimeZoneSchema,
  wokeAt: utcTimestampSchema,
  sleptAt: utcTimestampSchema.nullable(),
  revision: revisionSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});

export const todayTaskReadSchema: z.ZodType<TodayTaskRead> = z.object({
  id: taskIdSchema,
  lifeDayId: lifeDayIdSchema.nullable(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  scheduledAt: utcTimestampSchema.nullable(),
  scheduledTimezone: ianaTimeZoneSchema.nullable(),
  estimatedMinutes: estimatedMinutesSchema,
  position: positionSchema,
  isTopThree: z.boolean(),
  completedAt: utcTimestampSchema.nullable(),
  revision: revisionSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});

export const todaySnapshotSchema: z.ZodType<TodaySnapshot> = z.object({
  profile: profileReadSchema,
  lifeDay: currentLifeDayReadSchema.nullable(),
  tasks: z.array(todayTaskReadSchema),
});

export const commandResultSchema: z.ZodType<CommandResult> = z.discriminatedUnion('status', [
  z.object({
    operationId: operationIdSchema,
    status: z.enum(['accepted', 'duplicate_accepted']),
    entity: z.object({
      type: z.enum(['life_day', 'task']),
      id: z.string().uuid(),
      revision: revisionSchema,
      data: z.record(z.string(), z.unknown()),
    }),
    syncCursor: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    operationId: operationIdSchema,
    status: z.literal('conflict'),
    error: z.object({
      code: z.enum([
        'unauthenticated',
        'forbidden',
        'not_found',
        'validation_failed',
        'invalid_timezone',
        'repair_required',
        'unresolved_tasks',
        'revision_conflict',
        'invalid_transition',
        'top_three_limit',
      ]),
      message: z.string().min(1),
    }),
    entity: z
      .object({
        type: z.enum(['life_day', 'task']),
        id: z.string().uuid(),
        revision: revisionSchema,
        data: z.record(z.string(), z.unknown()),
      })
      .nullable(),
    syncCursor: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    operationId: operationIdSchema,
    status: z.literal('rejected'),
    error: z.object({
      code: z.enum([
        'unauthenticated',
        'forbidden',
        'not_found',
        'validation_failed',
        'invalid_timezone',
        'repair_required',
        'unresolved_tasks',
        'revision_conflict',
        'invalid_transition',
        'top_three_limit',
      ]),
      message: z.string().min(1),
    }),
    entity: z.null(),
    syncCursor: z.number().int().nonnegative().nullable(),
  }),
]);

export const emailPasswordCredentialsSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(256),
});
