import { describe, expect, it } from 'vitest';
import {
  decideTaskCompletion,
  hasValidStructuredReason,
  type Revision,
  type Task,
  type TaskId,
  type UserId,
} from './index';

const plannedTask: Task = {
  id: '00000000-0000-4000-8000-000000000002' as TaskId,
  userId: '00000000-0000-4000-8000-000000000010' as UserId,
  lifeDayId: null,
  title: 'Write migration',
  description: null,
  status: 'planned',
  priority: 'progress',
  scheduledAt: null,
  scheduledTimezone: null,
  estimatedMinutes: 30,
  position: 1,
  completedAt: null,
  revision: 1 as Revision,
};

describe('task rules', () => {
  it('rejects completing an already completed task', () => {
    expect(
      decideTaskCompletion({
        ...plannedTask,
        status: 'completed',
        completedAt: '2026-07-17T09:00:00.000Z' as Task['completedAt'],
      }),
    ).toEqual({ kind: 'already_completed' });
  });

  it('requires a note for an other cancellation or reschedule reason', () => {
    expect(hasValidStructuredReason({ code: 'other' })).toBe(false);
    expect(hasValidStructuredReason({ code: 'other', note: 'Changed circumstances' })).toBe(true);
    expect(hasValidStructuredReason({ code: 'capacity_limit' })).toBe(true);
  });
});
