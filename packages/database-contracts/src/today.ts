import type {
  IanaTimeZone,
  LifeDayId,
  LocalDate,
  Revision,
  TaskId,
  TaskPriority,
  TaskStatus,
  UtcTimestamp,
} from '@personal-os/domain';

import type { ProfileRow } from './profiles';

export interface CurrentLifeDayRead {
  readonly id: LifeDayId;
  readonly operationalDate: LocalDate;
  readonly timezone: IanaTimeZone;
  readonly wokeAt: UtcTimestamp;
  readonly sleptAt: UtcTimestamp | null;
  readonly revision: Revision;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface TodayTaskRead {
  readonly id: TaskId;
  readonly lifeDayId: LifeDayId | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly scheduledAt: UtcTimestamp | null;
  readonly scheduledTimezone: IanaTimeZone | null;
  readonly estimatedMinutes: number | null;
  readonly position: number;
  readonly isTopThree: boolean;
  readonly completedAt: UtcTimestamp | null;
  readonly revision: Revision;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface TodaySnapshot {
  readonly profile: ProfileRow;
  readonly lifeDay: CurrentLifeDayRead | null;
  readonly tasks: readonly TodayTaskRead[];
}
