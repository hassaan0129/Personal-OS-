import { describe, expect, it } from 'vitest';

import {
  cancelTaskCommandSchema,
  commandMetadataSchema,
  ianaTimeZoneSchema,
  resolveUnfinishedTaskCommandSchema,
  rescheduleTaskCommandSchema,
  setTaskTopThreeCommandSchema,
} from './common';

describe('IANA time zone validation', () => {
  it('accepts a named IANA zone', () => {
    expect(ianaTimeZoneSchema.parse('Asia/Karachi')).toBe('Asia/Karachi');
  });

  it('rejects an invalid time zone', () => {
    expect(() => ianaTimeZoneSchema.parse('Mars/Olympus')).toThrow();
  });
});

describe('Planner Mode task validation', () => {
  const metadata = {
    operationId: '9cd95629-8a0a-4ca0-9cf9-aaeea69d2d20',
    deviceId: 'b702a556-d5dc-41f6-9edf-3263098967a5',
    schemaVersion: 1,
    commandName: 'task.set_top_three',
    baseRevision: 1,
    clientOccurredAt: '2026-07-17T04:30:00Z',
    clientTimezone: 'UTC',
  };

  it('accepts a typed Top 3 command', () => {
    expect(
      setTaskTopThreeCommandSchema.safeParse({
        metadata,
        payload: { taskId: 'e246d887-d215-4706-9ee5-1c2a2fda68f0', isTopThree: true },
      }).success,
    ).toBe(true);
  });

  it('requires a structured reason and complete schedule for unfinished-task rescheduling', () => {
    expect(
      resolveUnfinishedTaskCommandSchema.safeParse({
        metadata: { ...metadata, commandName: 'task.resolve_unfinished' },
        payload: {
          taskId: 'e246d887-d215-4706-9ee5-1c2a2fda68f0',
          resolution: 'reschedule',
          targetLifeDayId: null,
          scheduledAt: '2026-07-18T04:30:00Z',
          scheduledTimezone: null,
          reason: { code: 'capacity_limit' },
        },
      }).success,
    ).toBe(false);
  });
});

describe('command metadata validation', () => {
  it('requires an ISO timestamp and validated command name', () => {
    const result = commandMetadataSchema.safeParse({
      operationId: '9cd95629-8a0a-4ca0-9cf9-aaeea69d2d20',
      deviceId: 'b702a556-d5dc-41f6-9edf-3263098967a5',
      schemaVersion: 1,
      commandName: 'life_day.wake',
      baseRevision: null,
      clientOccurredAt: '2026-07-17T04:30:00Z',
      clientTimezone: 'Asia/Karachi',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid time zones in Life Day command metadata', () => {
    const result = commandMetadataSchema.safeParse({
      operationId: '9cd95629-8a0a-4ca0-9cf9-aaeea69d2d20',
      deviceId: 'b702a556-d5dc-41f6-9edf-3263098967a5',
      schemaVersion: 1,
      commandName: 'life_day.wake',
      baseRevision: null,
      clientOccurredAt: '2026-07-17T04:30:00Z',
      clientTimezone: 'Mars/Olympus',
    });

    expect(result.success).toBe(false);
  });

  it('requires structured reasons for rescheduling and cancellation', () => {
    const metadata = {
      operationId: '9cd95629-8a0a-4ca0-9cf9-aaeea69d2d20',
      deviceId: 'b702a556-d5dc-41f6-9edf-3263098967a5',
      schemaVersion: 1,
      commandName: 'task.reschedule',
      baseRevision: 1,
      clientOccurredAt: '2026-07-17T04:30:00Z',
      clientTimezone: 'Asia/Karachi',
    };

    expect(
      rescheduleTaskCommandSchema.safeParse({
        metadata,
        payload: {
          taskId: 'e246d887-d215-4706-9ee5-1c2a2fda68f0',
          scheduledAt: '2026-07-18T04:30:00Z',
          scheduledTimezone: 'Asia/Karachi',
          reason: { code: 'other' },
        },
      }).success,
    ).toBe(false);

    expect(
      cancelTaskCommandSchema.safeParse({
        metadata: { ...metadata, commandName: 'task.cancel' },
        payload: {
          taskId: 'e246d887-d215-4706-9ee5-1c2a2fda68f0',
          cancelledAt: '2026-07-17T04:30:00Z',
          reason: { code: 'no_longer_relevant' },
        },
      }).success,
    ).toBe(true);
  });
});
