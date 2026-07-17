import type { Brand } from './identifiers';

export type UtcTimestamp = Brand<string, 'UtcTimestamp'>;
export type IanaTimeZone = Brand<string, 'IanaTimeZone'>;
export type LocalDate = Brand<string, 'LocalDate'>;
export type LocalTime = Brand<string, 'LocalTime'>;

export interface ZonedOccurrence {
  readonly occurredAt: UtcTimestamp;
  readonly timezone: IanaTimeZone;
}
