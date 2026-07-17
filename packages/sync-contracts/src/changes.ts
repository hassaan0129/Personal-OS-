import type { OperationId, Revision, UtcTimestamp } from '@personal-os/domain';

export interface SyncChange {
  readonly cursor: number;
  readonly entityType: 'life_day' | 'task';
  readonly entityId: string;
  readonly changeType: 'upsert';
  readonly revision: Revision;
  readonly operationId: OperationId;
  readonly recordedAt: UtcTimestamp;
}
