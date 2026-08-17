import {
  createLifeDayCommandAdapter,
  createTaskCommandAdapter,
  type RpcClient,
} from '@personal-os/api-client';
import type { CommandResult } from '@personal-os/sync-contracts';
import {
  cancelTaskCommandSchema,
  closeLifeDayCommandSchema,
  completeTaskCommandSchema,
  createTaskCommandSchema,
  reorderTaskCommandSchema,
  repairPreviousLifeDayCommandSchema,
  reopenTaskCommandSchema,
  rescheduleTaskCommandSchema,
  resolveUnfinishedTaskCommandSchema,
  setTaskTopThreeCommandSchema,
  startLifeDayCommandSchema,
  updateTaskCommandSchema,
} from '@personal-os/validation';

import {
  LocalAcknowledgementConflictError,
  type OutboxRepository,
  type StoredOutboxOperation,
} from './outbox-contracts';

export type FailureKind = 'retryable' | 'permanent' | 'conflict';

export function classifyFailure(error: unknown): FailureKind {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('network') || message.includes('timeout') || message.includes('fetch'))
      return 'retryable';
  }
  return 'permanent';
}

export function retryAt(attemptCount: number, now = Date.now()): string {
  const capped = Math.min(attemptCount, 6);
  const jitter = (attemptCount * 7919) % 1000;
  return new Date(now + Math.min(60_000, 1000 * 2 ** capped) + jitter).toISOString();
}

export interface OutboxTransport {
  send(operation: StoredOutboxOperation): Promise<CommandResult>;
}

export function createRpcOutboxTransport(client: RpcClient): OutboxTransport {
  return {
    send: (operation) => sendOperation(client, operation),
  };
}

export class MobileOutboxProcessor {
  private running = false;
  private stopped = false;

  public constructor(
    private readonly repository: OutboxRepository,
    private readonly transport: OutboxTransport,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public stop(): void {
    this.stopped = true;
  }

  /** Call once during authenticated processor startup before polling. */
  public recover(userId: StoredOutboxOperation['userId']): Promise<void> {
    if (this.stopped) return Promise.resolve();
    return this.repository.recoverProcessingOperations(userId);
  }

  public async processOne(userId: StoredOutboxOperation['userId']): Promise<boolean> {
    if (this.running || this.stopped) return false;
    this.running = true;
    try {
      const operation = await this.repository.claimNextEligibleOperation(
        userId,
        this.now().toISOString(),
      );
      if (operation === null) return false;
      try {
        const result = await this.transport.send(operation);
        if (this.stopped) return false;
        if (result.status === 'accepted' || result.status === 'duplicate_accepted') {
          return this.acknowledge(userId, operation, result);
        }
        if (result.status === 'conflict') {
          await this.repository.updateOperation({
            userId,
            operationId: operation.operationId,
            state: 'conflict',
            attemptCount: operation.attemptCount,
            nextRetryAt: null,
            safeError: result.error.message,
            safeErrorCode: result.error.code,
          });
          await this.repository.writeConflict(
            operation,
            result.error.code,
            result.error.message,
            null,
          );
          return false;
        }
        if (result.status === 'rejected') {
          await this.repository.updateOperation({
            userId,
            operationId: operation.operationId,
            state: 'permanently_rejected',
            attemptCount: operation.attemptCount,
            nextRetryAt: null,
            safeError: result.error.message,
            safeErrorCode: result.error.code,
          });
          return false;
        }
        return false;
      } catch (error) {
        if (classifyFailure(error) === 'retryable') {
          await this.repository.updateOperation({
            userId,
            operationId: operation.operationId,
            state: 'retry_scheduled',
            attemptCount: operation.attemptCount,
            nextRetryAt: retryAt(operation.attemptCount, this.now().getTime()),
            safeError: 'Temporary connection problem.',
            safeErrorCode: 'temporary_connection_problem',
          });
        } else {
          await this.repository.updateOperation({
            userId,
            operationId: operation.operationId,
            state: 'permanently_rejected',
            attemptCount: operation.attemptCount,
            nextRetryAt: null,
            safeError: 'The command could not be sent safely.',
            safeErrorCode: 'command_transport_failed',
          });
        }
        return false;
      }
    } finally {
      this.running = false;
    }
  }

  private async acknowledge(
    userId: StoredOutboxOperation['userId'],
    operation: StoredOutboxOperation,
    result: Extract<CommandResult, { readonly status: 'accepted' | 'duplicate_accepted' }>,
  ): Promise<boolean> {
    try {
      await this.repository.acknowledgeAcceptedOperation({ userId, operation, result });
      return true;
    } catch (error) {
      if (error instanceof LocalAcknowledgementConflictError) {
        await this.repository.updateOperation({
          userId,
          operationId: operation.operationId,
          state: 'conflict',
          attemptCount: operation.attemptCount,
          nextRetryAt: null,
          safeError: 'The local task mapping conflicts with the server acknowledgement.',
          safeErrorCode: 'local_acknowledgement_conflict',
        });
        await this.repository.writeConflict(
          operation,
          'revision_conflict',
          'The local task mapping conflicts with the server acknowledgement.',
          null,
        );
        return false;
      }

      await this.repository.updateOperation({
        userId,
        operationId: operation.operationId,
        state: 'retry_scheduled',
        attemptCount: operation.attemptCount,
        nextRetryAt: retryAt(operation.attemptCount, this.now().getTime()),
        safeError: 'The command acknowledgement will be retried.',
        safeErrorCode: 'acknowledgement_retry_scheduled',
      });
      return false;
    }
  }
}

async function sendOperation(
  client: RpcClient,
  operation: StoredOutboxOperation,
): Promise<CommandResult> {
  const value: unknown = JSON.parse(operation.commandJson);
  const lifeDays = createLifeDayCommandAdapter(client);
  const tasks = createTaskCommandAdapter(client);
  switch (operation.commandType) {
    case 'life_day.wake':
      return lifeDays.start(startLifeDayCommandSchema.parse(value));
    case 'life_day.sleep':
      return lifeDays.close(closeLifeDayCommandSchema.parse(value));
    case 'life_day.repair_previous':
      return lifeDays.repairPrevious(repairPreviousLifeDayCommandSchema.parse(value));
    case 'task.create':
      return tasks.create(createTaskCommandSchema.parse(value));
    case 'task.update':
      return tasks.update(updateTaskCommandSchema.parse(value));
    case 'task.reorder':
      return tasks.reorder(reorderTaskCommandSchema.parse(value));
    case 'task.set_top_three':
      return tasks.setTopThree(setTaskTopThreeCommandSchema.parse(value));
    case 'task.complete':
      return tasks.complete(completeTaskCommandSchema.parse(value));
    case 'task.reopen':
      return tasks.reopen(reopenTaskCommandSchema.parse(value));
    case 'task.reschedule':
      return tasks.reschedule(rescheduleTaskCommandSchema.parse(value));
    case 'task.cancel':
      return tasks.cancel(cancelTaskCommandSchema.parse(value));
    case 'task.resolve_unfinished':
      return tasks.resolveUnfinished(resolveUnfinishedTaskCommandSchema.parse(value));
    default:
      throw new Error('Unsupported queued command.');
  }
}
