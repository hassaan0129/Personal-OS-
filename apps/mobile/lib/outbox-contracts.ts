import type { TodaySnapshot } from '@personal-os/database-contracts';
import type { OperationId, UserId } from '@personal-os/domain';
import type { AcceptedCommandResult } from '@personal-os/sync-contracts';

export type OutboxState =
  | 'pending'
  | 'processing'
  | 'retry_scheduled'
  | 'acknowledged'
  | 'conflict'
  | 'permanently_rejected';

export interface StoredOutboxOperation {
  readonly operationId: OperationId;
  readonly userId: UserId;
  readonly commandType: string;
  readonly commandJson: string;
  readonly createdAt: string;
  readonly expectedRevision: number | null;
  readonly attemptCount: number;
  readonly nextRetryAt: string | null;
  readonly state: OutboxState;
  readonly lastSafeError: string | null;
  readonly lastSafeErrorCode: string | null;
  readonly localSequence: number;
  readonly targetId: string | null;
  readonly dependsOnOperationId: OperationId | null;
}

export interface OutboxRepository {
  recoverProcessingOperations(userId: UserId): Promise<void>;
  claimNextEligibleOperation(userId: UserId, now: string): Promise<StoredOutboxOperation | null>;
  updateOperation(input: {
    readonly userId: UserId;
    readonly operationId: OperationId;
    readonly state: OutboxState;
    readonly attemptCount: number;
    readonly nextRetryAt: string | null;
    readonly safeError: string | null;
    readonly safeErrorCode: string | null;
  }): Promise<void>;
  acknowledgeAcceptedOperation(input: {
    readonly userId: UserId;
    readonly operation: StoredOutboxOperation;
    readonly result: AcceptedCommandResult;
  }): Promise<void>;
  writeConflict(
    operation: StoredOutboxOperation,
    code: string,
    safeMessage: string,
    serverSnapshot: TodaySnapshot | null,
  ): Promise<void>;
}

export class LocalAcknowledgementConflictError extends Error {}
