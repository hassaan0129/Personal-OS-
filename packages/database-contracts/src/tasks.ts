import type {
  IanaTimeZone,
  LifeDayId,
  Revision,
  TaskId,
  TaskPriority,
  TaskStatus,
  UserId,
  UtcTimestamp,
} from '@personal-os/domain';

export interface TaskRow {
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
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}
