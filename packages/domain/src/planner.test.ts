import { describe, expect, it } from 'vitest';

import { groupPlannerTasks } from './planner';

describe('Planner task grouping', () => {
  it('groups ordered tasks for execution and unfinished-task resolution', () => {
    const groups = groupPlannerTasks([
      {
        status: 'completed',
        scheduledAt: null,
        isTopThree: true,
        position: 3,
        createdAt: '2026-07-18T03:00:00Z',
      },
      {
        status: 'planned',
        scheduledAt: null,
        isTopThree: true,
        position: 2,
        createdAt: '2026-07-18T02:00:00Z',
      },
      {
        status: 'overdue',
        scheduledAt: null,
        isTopThree: false,
        position: 1,
        createdAt: '2026-07-18T01:00:00Z',
      },
      {
        status: 'in_progress',
        scheduledAt: '2026-07-18T04:00:00Z',
        isTopThree: true,
        position: 4,
        createdAt: '2026-07-18T04:00:00Z',
      },
    ]);

    expect(groups.topThree).toHaveLength(2);
    expect(groups.scheduled).toHaveLength(1);
    expect(groups.flexible).toHaveLength(1);
    expect(groups.overdue).toHaveLength(1);
    expect(groups.completed).toHaveLength(1);
    expect(groups.unresolved.map((task) => task.position)).toEqual([2, 4]);
  });
});
