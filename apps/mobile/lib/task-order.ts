import type { TodayTaskRead } from '@personal-os/database-contracts';

export type TaskMoveDirection = 'up' | 'down';

/** Matches server Today-read ordering while providing a total local order. */
export function orderTasksByPosition(tasks: readonly TodayTaskRead[]): TodayTaskRead[] {
  return [...tasks].sort(
    (left, right) =>
      left.position - right.position ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

/** Uses the existing fractional numeric-position model from the web Planner. */
export function positionForTaskMove(
  tasks: readonly TodayTaskRead[],
  taskId: string,
  direction: TaskMoveDirection,
): number | null {
  const ordered = orderTasksByPosition(tasks);
  const index = ordered.findIndex((task) => task.id === taskId);
  if (index === -1) return null;

  const adjacent = ordered[direction === 'up' ? index - 1 : index + 1];
  if (adjacent === undefined) return null;

  return direction === 'up' ? adjacent.position - 0.5 : adjacent.position + 0.5;
}
