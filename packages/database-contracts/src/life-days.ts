import type {
  IanaTimeZone,
  LifeDayId,
  LocalDate,
  Revision,
  UserId,
  UtcTimestamp,
} from '@personal-os/domain';

export interface LifeDayRow {
  readonly id: LifeDayId;
  readonly userId: UserId;
  readonly operationalDate: LocalDate;
  readonly timezone: IanaTimeZone;
  readonly wokeAt: UtcTimestamp;
  readonly sleptAt: UtcTimestamp | null;
  readonly revision: Revision;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}
