import type { IanaTimeZone, Revision, UserId, UtcTimestamp } from '@personal-os/domain';

export interface ProfileRow {
  readonly id: UserId;
  readonly homeTimezone: IanaTimeZone;
  readonly revision: Revision;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface ProfileUpdate {
  readonly homeTimezone: IanaTimeZone;
  readonly revision: Revision;
}
