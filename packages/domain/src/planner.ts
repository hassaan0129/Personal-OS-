import type { TaskStatus } from './task';

export interface PlannerTask {
  readonly status: TaskStatus;
  readonly scheduledAt: string | null;
  readonly isTopThree: boolean;
  readonly position: number;
  readonly createdAt: string;
}

export interface PlannerTaskGroups<T extends PlannerTask> {
  readonly topThree: readonly T[];
  readonly scheduled: readonly T[];
  readonly flexible: readonly T[];
  readonly overdue: readonly T[];
  readonly completed: readonly T[];
  readonly unresolved: readonly T[];
}

const activeStatuses: readonly TaskStatus[] = ['planned', 'in_progress'];

export function groupPlannerTasks<T extends PlannerTask>(
  tasks: readonly T[],
): PlannerTaskGroups<T> {
  const ordered = [...tasks].sort(
    (left, right) =>
      left.position - right.position || left.createdAt.localeCompare(right.createdAt),
  );
  const active = ordered.filter((task) => activeStatuses.includes(task.status));

  return {
    topThree: ordered.filter(
      (task) => task.isTopThree && ['planned', 'in_progress', 'overdue'].includes(task.status),
    ),
    scheduled: active.filter((task) => task.scheduledAt !== null),
    flexible: active.filter((task) => task.scheduledAt === null),
    overdue: ordered.filter((task) => task.status === 'overdue'),
    completed: ordered.filter((task) => task.status === 'completed'),
    unresolved: active,
  };
}
