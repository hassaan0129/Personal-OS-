import type { LifeDayId, TaskId, UserId } from './identifiers';
import type { Revision } from './revision';
import type { IanaTimeZone, UtcTimestamp } from './time';

export const taskPriorities = ['non_negotiable', 'progress', 'maintenance'] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const taskStatuses = [
  'planned',
  'in_progress',
  'completed',
  'overdue',
  'cancelled',
  'archived',
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskReasonCodes = [
  'user_rescheduled',
  'capacity_limit',
  'external_change',
  'no_longer_relevant',
  'duplicate',
  'other',
] as const;
export type TaskReasonCode = (typeof taskReasonCodes)[number];

export interface StructuredReason {
  readonly code: TaskReasonCode;
  readonly note?: string;
}

export interface Task {
  readonly id: TaskId;
  readonly userId: UserId;
  readonly lifeDayId: LifeDayId | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly scheduledAt: UtcTimestamp | null;
  readonly scheduledTimezone: IanaTimeZone | null;
  readonly estimatedMinutes: number | null;
  readonly position: number;
  readonly completedAt: UtcTimestamp | null;
  readonly revision: Revision;
}

export type TaskTransitionDecision =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'already_completed' }
  | { readonly kind: 'invalid_transition' };

export function decideTaskCompletion(task: Task): TaskTransitionDecision {
  if (task.status === 'completed') {
    return { kind: 'already_completed' };
  }

  if (task.status === 'cancelled' || task.status === 'archived') {
    return { kind: 'invalid_transition' };
  }

  return { kind: 'allowed' };
}

export function hasValidStructuredReason(reason: StructuredReason): boolean {
  return reason.code !== 'other' || Boolean(reason.note?.trim());
}
