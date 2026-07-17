import type { IanaTimeZone, LocalDate, UtcTimestamp } from './time';
import type { LifeDayId, UserId } from './identifiers';
import type { Revision } from './revision';
import type { TaskStatus } from './task';

export type LifeDayState = 'open' | 'closed';

export type LifeDayRepairReasonCode =
  'forgot_to_record_sleep' | 'correct_recording_error' | 'other';

export interface LifeDay {
  readonly id: LifeDayId;
  readonly userId: UserId;
  readonly operationalDate: LocalDate;
  readonly timezone: IanaTimeZone;
  readonly wokeAt: UtcTimestamp;
  readonly sleptAt: UtcTimestamp | null;
  readonly revision: Revision;
}

export interface LifeDayRepairRequired {
  readonly kind: 'repair_required';
  readonly activeLifeDayId: LifeDayId;
}

export interface LifeDayStartAllowed {
  readonly kind: 'start_allowed';
}

export type LifeDayStartDecision = LifeDayStartAllowed | LifeDayRepairRequired;

export function lifeDayState(lifeDay: LifeDay): LifeDayState {
  return lifeDay.sleptAt === null ? 'open' : 'closed';
}

export function decideLifeDayStart(activeLifeDay: LifeDay | null): LifeDayStartDecision {
  if (activeLifeDay === null || lifeDayState(activeLifeDay) === 'closed') {
    return { kind: 'start_allowed' };
  }

  return { kind: 'repair_required', activeLifeDayId: activeLifeDay.id };
}

export function canCloseLifeDay(taskStatuses: readonly TaskStatus[]): boolean {
  return !taskStatuses.some((status) => status === 'planned' || status === 'in_progress');
}
