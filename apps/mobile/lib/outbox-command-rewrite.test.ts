import { taskIdSchema } from '@personal-os/validation';
import { describe, expect, it } from 'vitest';

import { rewriteQueuedTaskCommand } from './outbox-command-rewrite';

const temporaryTaskId = taskIdSchema.parse('11111111-1111-4111-8111-111111111111');
const serverTaskId = taskIdSchema.parse('22222222-2222-4222-8222-222222222222');
const lifeDayId = '33333333-3333-4333-8333-333333333333';
const timestamp = '2026-07-28T08:00:00.000Z';

const metadata = {
  operationId: '44444444-4444-4444-8444-444444444444',
  deviceId: '55555555-5555-4555-8555-555555555555',
  schemaVersion: 1,
  commandName: 'task.complete',
  baseRevision: 7,
  clientOccurredAt: timestamp,
  clientTimezone: 'Asia/Karachi',
};

describe('rewriteQueuedTaskCommand', () => {
  it.each([
    [
      'task.update',
      {
        taskId: temporaryTaskId,
        lifeDayId,
        title: 'Task',
        description: null,
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
        status: 'planned',
      },
    ],
    ['task.reorder', { taskId: temporaryTaskId, position: 2 }],
    ['task.set_top_three', { taskId: temporaryTaskId, isTopThree: true }],
    ['task.complete', { taskId: temporaryTaskId, completedAt: timestamp, lifeDayId }],
    ['task.reopen', { taskId: temporaryTaskId, lifeDayId }],
    [
      'task.reschedule',
      {
        taskId: temporaryTaskId,
        scheduledAt: timestamp,
        scheduledTimezone: 'Asia/Karachi',
        reason: { code: 'user_rescheduled', note: 'Move it.' },
      },
    ],
    [
      'task.cancel',
      {
        taskId: temporaryTaskId,
        cancelledAt: timestamp,
        reason: { code: 'no_longer_relevant', note: 'No longer needed.' },
      },
    ],
    [
      'task.resolve_unfinished',
      {
        taskId: temporaryTaskId,
        resolution: 'reschedule',
        targetLifeDayId: lifeDayId,
        scheduledAt: null,
        scheduledTimezone: null,
        reason: { code: 'user_rescheduled', note: 'Move it.' },
      },
    ],
  ] as const)('rewrites only taskId for %s', (commandType, payload) => {
    const original = {
      metadata: { ...metadata, commandName: commandType },
      payload,
    };

    const rewritten = JSON.parse(
      rewriteQueuedTaskCommand(
        commandType,
        JSON.stringify(original),
        temporaryTaskId,
        serverTaskId,
      ),
    ) as typeof original;

    expect(rewritten.payload.taskId).toBe(serverTaskId);
    expect(rewritten.metadata).toEqual(original.metadata);
    expect({ ...rewritten.payload, taskId: temporaryTaskId }).toEqual(original.payload);
  });

  it('rejects unsupported commands and malformed envelopes', () => {
    expect(() =>
      rewriteQueuedTaskCommand(
        'task.create',
        JSON.stringify({ metadata, payload: {} }),
        temporaryTaskId,
        serverTaskId,
      ),
    ).toThrow('Unsupported queued task command');
    expect(() =>
      rewriteQueuedTaskCommand('task.complete', '{', temporaryTaskId, serverTaskId),
    ).toThrow();
  });
});
