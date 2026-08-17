import type { TodaySnapshot } from '@personal-os/database-contracts';
import {
  taskIdSchema,
  todaySnapshotSchema,
  utcTimestampSchema,
  userIdSchema,
} from '@personal-os/validation';
import { describe, expect, it } from 'vitest';

import { orderTasksByPosition, positionForTaskMove } from './task-order';

const timestamp = utcTimestampSchema.parse('2026-08-02T08:00:00.000Z');

function tasks(): TodaySnapshot['tasks'] {
  const userId = userIdSchema.parse('11111111-1111-4111-8111-111111111111');
  const snapshot = todaySnapshotSchema.parse({
    profile: {
      id: userId,
      homeTimezone: 'Asia/Karachi',
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    lifeDay: null,
    tasks: [
      {
        id: taskIdSchema.parse('33333333-3333-4333-8333-333333333333'),
        lifeDayId: null,
        title: 'Third',
        description: null,
        status: 'planned',
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 2,
        isTopThree: false,
        completedAt: null,
        revision: 1,
        createdAt: utcTimestampSchema.parse('2026-08-02T08:02:00.000Z'),
        updatedAt: timestamp,
      },
      {
        id: taskIdSchema.parse('22222222-2222-4222-8222-222222222222'),
        lifeDayId: null,
        title: 'First',
        description: null,
        status: 'planned',
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
        isTopThree: false,
        completedAt: null,
        revision: 1,
        createdAt: utcTimestampSchema.parse('2026-08-02T08:01:00.000Z'),
        updatedAt: timestamp,
      },
      {
        id: taskIdSchema.parse('44444444-4444-4444-8444-444444444444'),
        lifeDayId: null,
        title: 'Second',
        description: null,
        status: 'planned',
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
        isTopThree: false,
        completedAt: null,
        revision: 1,
        createdAt: utcTimestampSchema.parse('2026-08-02T08:01:00.000Z'),
        updatedAt: timestamp,
      },
    ],
  });
  return snapshot.tasks;
}

describe('task ordering', () => {
  it('uses position, creation time, and ID as a deterministic total order', () => {
    expect(orderTasksByPosition(tasks()).map((task) => task.title)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  it('derives the existing fractional move-up and move-down positions', () => {
    const ordered = orderTasksByPosition(tasks());
    const firstId = ordered[0]?.id;
    const secondId = ordered[1]?.id;
    if (firstId === undefined || secondId === undefined)
      throw new Error('Expected ordered task fixtures.');

    expect(positionForTaskMove(ordered, secondId, 'up')).toBe(0.5);
    expect(positionForTaskMove(ordered, firstId, 'down')).toBe(1.5);
    expect(positionForTaskMove(ordered, firstId, 'up')).toBeNull();
  });
});
