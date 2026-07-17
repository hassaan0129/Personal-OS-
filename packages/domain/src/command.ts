import type { DeviceId, OperationId } from './identifiers';
import type { IanaTimeZone, UtcTimestamp } from './time';
import type { Revision } from './revision';

export type CommandName = `${string}.${string}`;

export interface CommandMetadata {
  readonly operationId: OperationId;
  readonly deviceId: DeviceId;
  readonly schemaVersion: number;
  readonly commandName: CommandName;
  readonly baseRevision: Revision | null;
  readonly clientOccurredAt: UtcTimestamp;
  readonly clientTimezone: IanaTimeZone;
}
