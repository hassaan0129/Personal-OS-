import type { TodaySnapshot } from '@personal-os/database-contracts';
import type { RpcClient } from '@personal-os/api-client';
import type { OperationId, TaskId, UserId } from '@personal-os/domain';
import type { AcceptedCommandResult, CommandResult } from '@personal-os/sync-contracts';
import {
  ianaTimeZoneSchema,
  operationIdSchema,
  revisionSchema,
  taskIdSchema,
  todaySnapshotSchema,
  utcTimestampSchema,
  userIdSchema,
} from '@personal-os/validation';
import { describe, expect, it } from 'vitest';

import {
  LocalAcknowledgementConflictError,
  type OutboxRepository,
  type OutboxState,
  type StoredOutboxOperation,
} from './outbox-contracts';
import { rewriteQueuedTaskCommand } from './outbox-command-rewrite';
import {
  createRpcOutboxTransport,
  MobileOutboxProcessor,
  type OutboxTransport,
} from './outbox-processor';

const timestamp = '2026-07-28T08:00:00.000Z';
const userA = userIdSchema.parse('11111111-1111-4111-8111-111111111111');
const userB = userIdSchema.parse('22222222-2222-4222-8222-222222222222');
const lifeDayId = '33333333-3333-4333-8333-333333333333';
const temporaryTaskId = taskIdSchema.parse('44444444-4444-4444-8444-444444444444');
const serverTaskId = taskIdSchema.parse('55555555-5555-4555-8555-555555555555');
const conflictingServerTaskId = taskIdSchema.parse('66666666-6666-4666-8666-666666666666');
const createOperationId = operationIdSchema.parse('77777777-7777-4777-8777-777777777777');
const updateOperationId = operationIdSchema.parse('88888888-8888-4888-8888-888888888888');
const completeOperationId = operationIdSchema.parse('99999999-9999-4999-8999-999999999999');
const reopenOperationId = operationIdSchema.parse('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
const cancelOperationId = operationIdSchema.parse('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
const rescheduleOperationId = operationIdSchema.parse('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
const reorderOperationId = operationIdSchema.parse('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');

function metadata(operationId: OperationId, commandName: string, baseRevision: number | null) {
  return {
    operationId,
    deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    schemaVersion: 1,
    commandName,
    baseRevision,
    clientOccurredAt: timestamp,
    clientTimezone: 'Asia/Karachi',
  };
}

function createSnapshot(userId: UserId = userA, taskRevision = 1): TodaySnapshot {
  return todaySnapshotSchema.parse({
    profile: {
      id: userId,
      homeTimezone: 'Asia/Karachi',
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    lifeDay: {
      id: lifeDayId,
      operationalDate: '2026-07-28',
      timezone: 'Asia/Karachi',
      wokeAt: timestamp,
      sleptAt: null,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    tasks: [
      {
        id: temporaryTaskId,
        lifeDayId,
        title: 'Offline task',
        description: null,
        status: 'planned',
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
        isTopThree: false,
        completedAt: null,
        revision: taskRevision,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  });
}

function operation(input: {
  readonly operationId: OperationId;
  readonly userId?: UserId;
  readonly commandType: string;
  readonly commandJson: string;
  readonly targetId: string | null;
  readonly expectedRevision: number | null;
  readonly dependsOnOperationId?: OperationId | null;
  readonly localSequence: number;
  readonly state?: OutboxState;
  readonly nextRetryAt?: string | null;
}): StoredOutboxOperation {
  return {
    operationId: input.operationId,
    userId: input.userId ?? userA,
    commandType: input.commandType,
    commandJson: input.commandJson,
    createdAt: timestamp,
    expectedRevision: input.expectedRevision,
    attemptCount: 0,
    nextRetryAt: input.nextRetryAt ?? null,
    state: input.state ?? 'pending',
    lastSafeError: null,
    lastSafeErrorCode: null,
    localSequence: input.localSequence,
    targetId: input.targetId,
    dependsOnOperationId: input.dependsOnOperationId ?? null,
  };
}

function createOperation(userId: UserId = userA): StoredOutboxOperation {
  return operation({
    operationId: createOperationId,
    userId,
    commandType: 'task.create',
    commandJson: JSON.stringify({
      metadata: metadata(createOperationId, 'task.create', null),
      payload: {
        lifeDayId,
        title: 'Offline task',
        description: null,
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
      },
    }),
    targetId: temporaryTaskId,
    expectedRevision: null,
    localSequence: 1,
  });
}

function updateOperation(dependency: OperationId = createOperationId): StoredOutboxOperation {
  return operation({
    operationId: updateOperationId,
    commandType: 'task.update',
    commandJson: JSON.stringify({
      metadata: metadata(updateOperationId, 'task.update', 1),
      payload: {
        taskId: temporaryTaskId,
        lifeDayId,
        title: 'Updated offline task',
        description: null,
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
        status: 'planned',
      },
    }),
    targetId: temporaryTaskId,
    expectedRevision: 1,
    dependsOnOperationId: dependency,
    localSequence: 2,
  });
}

function completeOperation(dependency: OperationId = updateOperationId): StoredOutboxOperation {
  return operation({
    operationId: completeOperationId,
    commandType: 'task.complete',
    commandJson: JSON.stringify({
      metadata: metadata(completeOperationId, 'task.complete', 1),
      payload: { taskId: temporaryTaskId, lifeDayId, completedAt: timestamp },
    }),
    targetId: temporaryTaskId,
    expectedRevision: 1,
    dependsOnOperationId: dependency,
    localSequence: 3,
  });
}

function reopenOperation(
  dependency: OperationId | null = completeOperationId,
  expectedRevision = 3,
): StoredOutboxOperation {
  return operation({
    operationId: reopenOperationId,
    commandType: 'task.reopen',
    commandJson: JSON.stringify({
      metadata: metadata(reopenOperationId, 'task.reopen', expectedRevision),
      payload: { taskId: temporaryTaskId, lifeDayId },
    }),
    targetId: temporaryTaskId,
    expectedRevision,
    dependsOnOperationId: dependency,
    localSequence: 4,
  });
}

function cancelOperation(
  dependency: OperationId | null = reopenOperationId,
  expectedRevision = 4,
): StoredOutboxOperation {
  return operation({
    operationId: cancelOperationId,
    commandType: 'task.cancel',
    commandJson: JSON.stringify({
      metadata: metadata(cancelOperationId, 'task.cancel', expectedRevision),
      payload: {
        taskId: temporaryTaskId,
        cancelledAt: timestamp,
        reason: { code: 'no_longer_relevant', note: 'No longer needed.' },
      },
    }),
    targetId: temporaryTaskId,
    expectedRevision,
    dependsOnOperationId: dependency,
    localSequence: 5,
  });
}

function rescheduleOperation(
  dependency: OperationId | null = reopenOperationId,
  expectedRevision = 4,
): StoredOutboxOperation {
  return operation({
    operationId: rescheduleOperationId,
    commandType: 'task.reschedule',
    commandJson: JSON.stringify({
      metadata: metadata(rescheduleOperationId, 'task.reschedule', expectedRevision),
      payload: {
        taskId: temporaryTaskId,
        scheduledAt: '2026-07-29T14:30:00.000Z',
        scheduledTimezone: 'America/New_York',
        reason: { code: 'user_rescheduled', note: 'Move it to the new slot.' },
      },
    }),
    targetId: temporaryTaskId,
    expectedRevision,
    dependsOnOperationId: dependency,
    localSequence: 5,
  });
}

function reorderOperation(
  dependency: OperationId | null = createOperationId,
  expectedRevision = 1,
  position = 0.5,
): StoredOutboxOperation {
  return operation({
    operationId: reorderOperationId,
    commandType: 'task.reorder',
    commandJson: JSON.stringify({
      metadata: metadata(reorderOperationId, 'task.reorder', expectedRevision),
      payload: { taskId: temporaryTaskId, position },
    }),
    targetId: temporaryTaskId,
    expectedRevision,
    dependsOnOperationId: dependency,
    localSequence: 6,
  });
}

function accepted(operationId: OperationId, taskId: TaskId = serverTaskId): AcceptedCommandResult {
  return {
    operationId,
    status: 'accepted',
    entity: { type: 'task', id: taskId, revision: revisionSchema.parse(2), data: {} },
    syncCursor: 42,
  };
}

class InMemoryOutboxRepository implements OutboxRepository {
  public readonly mappings = new Map<string, TaskId | null>();
  public readonly conflicts: string[] = [];
  public cursor: number | null = null;
  public failAcknowledgementOnce = false;
  public snapshot: TodaySnapshot;
  private operations: StoredOutboxOperation[];

  public constructor(snapshot: TodaySnapshot, operations: readonly StoredOutboxOperation[]) {
    this.snapshot = snapshot;
    this.operations = [...operations];
    for (const queued of operations) {
      if (queued.commandType === 'task.create' && queued.targetId !== null) {
        this.mappings.set(
          this.mappingKey(queued.userId, taskIdSchema.parse(queued.targetId)),
          null,
        );
      }
    }
  }

  public async recoverProcessingOperations(userId: UserId): Promise<void> {
    this.operations = this.operations.map((queued) =>
      queued.userId === userId && queued.state === 'processing'
        ? { ...queued, state: 'pending', nextRetryAt: null }
        : queued,
    );
  }

  public async claimNextEligibleOperation(
    userId: UserId,
    now: string,
  ): Promise<StoredOutboxOperation | null> {
    const candidate = this.operations
      .filter(
        (queued) =>
          queued.userId === userId &&
          (queued.state === 'pending' || queued.state === 'retry_scheduled') &&
          (queued.nextRetryAt === null || queued.nextRetryAt <= now) &&
          (queued.dependsOnOperationId === null ||
            this.isAcknowledged(userId, queued.dependsOnOperationId)),
      )
      .sort((left, right) => left.localSequence - right.localSequence)[0];
    if (candidate === undefined) return null;
    const claimed = {
      ...candidate,
      state: 'processing' as const,
      attemptCount: candidate.attemptCount + 1,
    };
    this.replaceOperation(claimed);
    return claimed;
  }

  public async updateOperation(
    input: Parameters<OutboxRepository['updateOperation']>[0],
  ): Promise<void> {
    const queued = this.findOperation(input.userId, input.operationId);
    this.replaceOperation({
      ...queued,
      state: input.state,
      attemptCount: input.attemptCount,
      nextRetryAt: input.nextRetryAt,
      lastSafeError: input.safeError,
      lastSafeErrorCode: input.safeErrorCode,
    });
  }

  public async acknowledgeAcceptedOperation(
    input: Parameters<OutboxRepository['acknowledgeAcceptedOperation']>[0],
  ): Promise<void> {
    if (this.failAcknowledgementOnce) {
      this.failAcknowledgementOnce = false;
      throw new Error('Simulated local persistence failure.');
    }
    if (input.result.operationId !== input.operation.operationId) {
      throw new LocalAcknowledgementConflictError('Operation mismatch.');
    }
    const queued = this.findOperation(input.userId, input.operation.operationId);
    const before = {
      operations: this.operations,
      mappings: new Map(this.mappings),
      snapshot: this.snapshot,
      cursor: this.cursor,
    };
    try {
      if (queued.commandType === 'task.create') {
        this.reconcileCreate(input.userId, queued, input.result);
      }
      this.replaceOperation({
        ...queued,
        state: 'acknowledged',
        nextRetryAt: null,
        lastSafeError: null,
        lastSafeErrorCode: null,
      });
      this.cursor = input.result.syncCursor;
    } catch (error) {
      this.operations = before.operations;
      this.mappings.clear();
      for (const [key, value] of before.mappings) this.mappings.set(key, value);
      this.snapshot = before.snapshot;
      this.cursor = before.cursor;
      throw error;
    }
  }

  public async writeConflict(
    operationToRecord: StoredOutboxOperation,
    code: string,
    _safeMessage: string,
    _serverSnapshot: TodaySnapshot | null,
  ): Promise<void> {
    this.findOperation(operationToRecord.userId, operationToRecord.operationId);
    this.conflicts.push(`${operationToRecord.operationId}:${code}`);
  }

  public operationFor(userId: UserId, operationId: OperationId): StoredOutboxOperation {
    return this.findOperation(userId, operationId);
  }

  private reconcileCreate(
    userId: UserId,
    create: StoredOutboxOperation,
    result: AcceptedCommandResult,
  ): void {
    if (result.entity.type !== 'task' || create.targetId === null) {
      throw new LocalAcknowledgementConflictError('Invalid create acknowledgement.');
    }
    const temporaryId = taskIdSchema.parse(create.targetId);
    const key = this.mappingKey(userId, temporaryId);
    const mapped = this.mappings.get(key);
    if (mapped === undefined) throw new LocalAcknowledgementConflictError('Mapping missing.');
    if (mapped !== null && mapped !== result.entity.id) {
      throw new LocalAcknowledgementConflictError('Mapping conflict.');
    }
    const serverId = taskIdSchema.parse(result.entity.id);
    this.mappings.set(key, serverId);
    this.snapshot = {
      ...this.snapshot,
      tasks: this.snapshot.tasks.map((task) =>
        task.id === temporaryId
          ? {
              ...task,
              id: serverId,
              revision: revisionSchema.parse(Math.max(task.revision, result.entity.revision)),
            }
          : task,
      ),
    };
    this.operations = this.operations.map((queued) =>
      queued.userId === userId &&
      queued.operationId !== create.operationId &&
      queued.targetId === temporaryId
        ? {
            ...queued,
            targetId: serverId,
            commandJson: rewriteQueuedTaskCommand(
              queued.commandType,
              queued.commandJson,
              temporaryId,
              serverId,
            ),
          }
        : queued,
    );
  }

  private isAcknowledged(userId: UserId, operationId: OperationId): boolean {
    return this.operations.some(
      (queued) =>
        queued.userId === userId &&
        queued.operationId === operationId &&
        queued.state === 'acknowledged',
    );
  }

  private findOperation(userId: UserId, operationId: OperationId): StoredOutboxOperation {
    const operationToFind = this.operations.find(
      (queued) => queued.userId === userId && queued.operationId === operationId,
    );
    if (operationToFind === undefined) throw new Error('Operation is not available for this user.');
    return operationToFind;
  }

  private replaceOperation(operationToReplace: StoredOutboxOperation): void {
    this.operations = this.operations.map((queued) =>
      queued.operationId === operationToReplace.operationId &&
      queued.userId === operationToReplace.userId
        ? operationToReplace
        : queued,
    );
  }

  private mappingKey(userId: UserId, taskId: TaskId): string {
    return `${userId}:${taskId}`;
  }
}

class ScriptedTransport implements OutboxTransport {
  public readonly sent: StoredOutboxOperation[] = [];

  public constructor(private readonly results: readonly CommandResult[]) {}

  public async send(operationToSend: StoredOutboxOperation): Promise<CommandResult> {
    this.sent.push(operationToSend);
    const result = this.results[this.sent.length - 1];
    if (result === undefined) throw new Error('No scripted result.');
    return result;
  }
}

function processor(
  repository: OutboxRepository,
  transport: OutboxTransport,
  now = timestamp,
): MobileOutboxProcessor {
  return new MobileOutboxProcessor(repository, transport, () => new Date(now));
}

describe('MobileOutboxProcessor', () => {
  it('sends task creation through the typed task command adapter', async () => {
    const calls: Array<{
      readonly name: string;
      readonly parameters: Readonly<Record<string, unknown>> | undefined;
    }> = [];
    const client: RpcClient = {
      rpc: async (name, parameters) => {
        calls.push({ name, parameters });
        return { data: accepted(createOperationId), error: null };
      },
    };

    await expect(createRpcOutboxTransport(client).send(createOperation())).resolves.toMatchObject({
      status: 'accepted',
      operationId: createOperationId,
    });

    expect(calls).toEqual([
      expect.objectContaining({
        name: 'command_create_task',
        parameters: expect.objectContaining({ p_operation_id: createOperationId }),
      }),
    ]);
  });

  it('claims the create before its dependent and reconciles an accepted server task ID', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(userA, 3), [
      createOperation(),
      updateOperation(),
    ]);
    const transport = new ScriptedTransport([accepted(createOperationId)]);
    const subject = processor(repository, transport);

    await expect(subject.processOne(userA)).resolves.toBe(true);

    expect(transport.sent.map((queued) => queued.operationId)).toEqual([createOperationId]);
    expect(repository.snapshot.tasks[0]).toMatchObject({ id: serverTaskId, revision: 3 });
    expect(repository.mappings.get(`${userA}:${temporaryTaskId}`)).toBe(serverTaskId);
    expect(repository.operationFor(userA, createOperationId).state).toBe('acknowledged');
    const dependent = repository.operationFor(userA, updateOperationId);
    expect(dependent.targetId).toBe(serverTaskId);
    expect(JSON.parse(dependent.commandJson).payload.taskId).toBe(serverTaskId);
    expect(JSON.parse(dependent.commandJson).metadata.operationId).toBe(updateOperationId);
    expect(JSON.parse(dependent.commandJson).metadata.baseRevision).toBe(1);
    expect(repository.cursor).toBe(42);
  });

  it('keeps a dependent blocked until creation is acknowledged', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(), [updateOperation()]);
    const transport = new ScriptedTransport([]);

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(false);
    expect(transport.sent).toHaveLength(0);
  });

  it('rewrites a dependent reopen to the authoritative task ID after creation acknowledgement', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(userA, 4), [
      createOperation(),
      updateOperation(),
      completeOperation(),
      reopenOperation(),
    ]);
    const transport = new ScriptedTransport([accepted(createOperationId)]);

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(true);

    const reopened = repository.operationFor(userA, reopenOperationId);
    expect(reopened.targetId).toBe(serverTaskId);
    expect(JSON.parse(reopened.commandJson)).toMatchObject({
      metadata: { operationId: reopenOperationId, baseRevision: 3 },
      payload: { taskId: serverTaskId, lifeDayId },
    });
    expect(repository.snapshot.tasks[0]).toMatchObject({ id: serverTaskId, revision: 4 });
  });

  it('rewrites a dependent cancellation to the authoritative task ID after creation acknowledgement', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(userA, 5), [
      createOperation(),
      updateOperation(),
      completeOperation(),
      reopenOperation(),
      cancelOperation(),
    ]);
    const transport = new ScriptedTransport([accepted(createOperationId)]);

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(true);

    const cancelled = repository.operationFor(userA, cancelOperationId);
    expect(cancelled.targetId).toBe(serverTaskId);
    expect(JSON.parse(cancelled.commandJson)).toMatchObject({
      metadata: { operationId: cancelOperationId, baseRevision: 4 },
      payload: {
        taskId: serverTaskId,
        reason: { code: 'no_longer_relevant', note: 'No longer needed.' },
      },
    });
    expect(repository.snapshot.tasks[0]).toMatchObject({ id: serverTaskId, revision: 5 });
  });

  it('rewrites a dependent reschedule to the authoritative task ID after creation acknowledgement', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(userA, 5), [
      createOperation(),
      updateOperation(),
      completeOperation(),
      reopenOperation(),
      rescheduleOperation(),
    ]);
    const transport = new ScriptedTransport([accepted(createOperationId)]);

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(true);

    const rescheduled = repository.operationFor(userA, rescheduleOperationId);
    expect(rescheduled.targetId).toBe(serverTaskId);
    expect(JSON.parse(rescheduled.commandJson)).toMatchObject({
      metadata: { operationId: rescheduleOperationId, baseRevision: 4 },
      payload: {
        taskId: serverTaskId,
        scheduledAt: '2026-07-29T14:30:00.000Z',
        scheduledTimezone: 'America/New_York',
        reason: { code: 'user_rescheduled', note: 'Move it to the new slot.' },
      },
    });
    expect(repository.snapshot.tasks[0]).toMatchObject({ id: serverTaskId, revision: 5 });
  });

  it('rewrites a dependent reorder to the authoritative task ID before submission', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(userA, 2), [
      createOperation(),
      reorderOperation(),
    ]);
    const transport = new ScriptedTransport([accepted(createOperationId)]);

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(true);

    const reordered = repository.operationFor(userA, reorderOperationId);
    expect(reordered.targetId).toBe(serverTaskId);
    expect(JSON.parse(reordered.commandJson)).toMatchObject({
      metadata: { operationId: reorderOperationId, baseRevision: 1 },
      payload: { taskId: serverTaskId, position: 0.5 },
    });
  });

  it('retains an update operation ID and expected revision through a retryable network failure', async () => {
    const queuedUpdate = { ...updateOperation(), dependsOnOperationId: null };
    const repository = new InMemoryOutboxRepository(createSnapshot(), [queuedUpdate]);
    const transport: OutboxTransport = {
      send: async (operationToSend) => {
        if (operationToSend.attemptCount === 1) throw new Error('Network unavailable.');
        return accepted(updateOperationId);
      },
    };
    const subject = processor(repository, transport);

    await expect(subject.processOne(userA)).resolves.toBe(false);
    expect(repository.operationFor(userA, updateOperationId)).toMatchObject({
      operationId: updateOperationId,
      expectedRevision: 1,
      state: 'retry_scheduled',
    });

    await expect(
      processor(repository, transport, '2026-07-28T08:00:04.000Z').processOne(userA),
    ).resolves.toBe(true);
    expect(repository.operationFor(userA, updateOperationId)).toMatchObject({
      operationId: updateOperationId,
      expectedRevision: 1,
      state: 'acknowledged',
    });
  });

  it('retains a reopen operation ID and expected revision through a retryable network failure', async () => {
    const queuedReopen = reopenOperation(null, 1);
    const repository = new InMemoryOutboxRepository(createSnapshot(), [queuedReopen]);
    const sentOperationIds: OperationId[] = [];
    const transport: OutboxTransport = {
      send: async (operationToSend) => {
        sentOperationIds.push(operationToSend.operationId);
        if (operationToSend.attemptCount === 1) throw new Error('Network unavailable.');
        return accepted(reopenOperationId);
      },
    };

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(false);
    expect(repository.operationFor(userA, reopenOperationId)).toMatchObject({
      operationId: reopenOperationId,
      expectedRevision: 1,
      state: 'retry_scheduled',
    });

    await expect(
      processor(repository, transport, '2026-07-28T08:00:04.000Z').processOne(userA),
    ).resolves.toBe(true);
    expect(sentOperationIds).toEqual([reopenOperationId, reopenOperationId]);
    expect(repository.operationFor(userA, reopenOperationId)).toMatchObject({
      operationId: reopenOperationId,
      expectedRevision: 1,
      state: 'acknowledged',
    });
  });

  it('retains cancellation operation data and its expected revision through a retryable failure', async () => {
    const queuedCancellation = cancelOperation(null, 1);
    const repository = new InMemoryOutboxRepository(createSnapshot(), [queuedCancellation]);
    const sentOperationIds: OperationId[] = [];
    const transport: OutboxTransport = {
      send: async (operationToSend) => {
        sentOperationIds.push(operationToSend.operationId);
        if (operationToSend.attemptCount === 1) throw new Error('Network unavailable.');
        return accepted(cancelOperationId);
      },
    };

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(false);
    expect(repository.operationFor(userA, cancelOperationId)).toMatchObject({
      operationId: cancelOperationId,
      expectedRevision: 1,
      state: 'retry_scheduled',
    });

    await expect(
      processor(repository, transport, '2026-07-28T08:00:04.000Z').processOne(userA),
    ).resolves.toBe(true);
    expect(sentOperationIds).toEqual([cancelOperationId, cancelOperationId]);
    expect(JSON.parse(repository.operationFor(userA, cancelOperationId).commandJson)).toMatchObject(
      {
        payload: { reason: { code: 'no_longer_relevant', note: 'No longer needed.' } },
      },
    );
  });

  it('retains reschedule operation data and expected revision through a retryable failure', async () => {
    const queuedReschedule = rescheduleOperation(null, 1);
    const repository = new InMemoryOutboxRepository(createSnapshot(), [queuedReschedule]);
    const sentOperationIds: OperationId[] = [];
    const transport: OutboxTransport = {
      send: async (operationToSend) => {
        sentOperationIds.push(operationToSend.operationId);
        if (operationToSend.attemptCount === 1) throw new Error('Network unavailable.');
        return accepted(rescheduleOperationId);
      },
    };

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(false);
    expect(repository.operationFor(userA, rescheduleOperationId)).toMatchObject({
      operationId: rescheduleOperationId,
      expectedRevision: 1,
      state: 'retry_scheduled',
    });

    await expect(
      processor(repository, transport, '2026-07-28T08:00:04.000Z').processOne(userA),
    ).resolves.toBe(true);
    expect(sentOperationIds).toEqual([rescheduleOperationId, rescheduleOperationId]);
    expect(
      JSON.parse(repository.operationFor(userA, rescheduleOperationId).commandJson),
    ).toMatchObject({
      payload: {
        scheduledAt: '2026-07-29T14:30:00.000Z',
        scheduledTimezone: 'America/New_York',
        reason: { code: 'user_rescheduled', note: 'Move it to the new slot.' },
      },
    });
  });

  it('retains reorder operation data and its expected revision through a retryable failure', async () => {
    const queuedReorder = reorderOperation(null, 1, 0.5);
    const repository = new InMemoryOutboxRepository(createSnapshot(), [queuedReorder]);
    const sentOperationIds: OperationId[] = [];
    const transport: OutboxTransport = {
      send: async (operationToSend) => {
        sentOperationIds.push(operationToSend.operationId);
        if (operationToSend.attemptCount === 1) throw new Error('Network unavailable.');
        return accepted(reorderOperationId);
      },
    };

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(false);
    await expect(
      processor(repository, transport, '2026-07-28T08:00:04.000Z').processOne(userA),
    ).resolves.toBe(true);

    expect(sentOperationIds).toEqual([reorderOperationId, reorderOperationId]);
    expect(repository.operationFor(userA, reorderOperationId)).toMatchObject({
      expectedRevision: 1,
      state: 'acknowledged',
    });
    expect(
      JSON.parse(repository.operationFor(userA, reorderOperationId).commandJson),
    ).toMatchObject({
      payload: { taskId: temporaryTaskId, position: 0.5 },
    });
  });

  it("recovers only the signed-in user's stranded processing operation after restart", async () => {
    const stranded = { ...createOperation(), state: 'processing' as const };
    const otherUser = { ...updateOperation(), userId: userB, state: 'processing' as const };
    const repository = new InMemoryOutboxRepository(createSnapshot(), [stranded, otherUser]);
    const subject = processor(repository, new ScriptedTransport([]));

    await subject.recover(userA);

    expect(repository.operationFor(userA, createOperationId).state).toBe('pending');
    expect(repository.operationFor(userB, updateOperationId).state).toBe('processing');
  });

  it('recovers a pending reorder after restart without changing its operation ID or position', async () => {
    const queuedReorder = { ...reorderOperation(null, 1, 0.5), state: 'processing' as const };
    const repository = new InMemoryOutboxRepository(
      {
        ...createSnapshot(),
        tasks: createSnapshot().tasks.map((task) => ({
          ...task,
          position: 0.5,
          revision: revisionSchema.parse(2),
        })),
      },
      [queuedReorder],
    );

    await processor(repository, new ScriptedTransport([])).recover(userA);

    expect(repository.operationFor(userA, reorderOperationId)).toMatchObject({
      operationId: reorderOperationId,
      state: 'pending',
    });
    expect(
      JSON.parse(repository.operationFor(userA, reorderOperationId).commandJson),
    ).toMatchObject({
      payload: { position: 0.5 },
    });
    expect(repository.snapshot.tasks[0]).toMatchObject({ position: 0.5, revision: 2 });
  });

  it('reconciles duplicate acceptance idempotently after a local acknowledgement failure', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(), [
      createOperation(),
      updateOperation(),
    ]);
    repository.failAcknowledgementOnce = true;
    const duplicate: AcceptedCommandResult = {
      ...accepted(createOperationId),
      status: 'duplicate_accepted',
    };
    const transport = new ScriptedTransport([accepted(createOperationId), duplicate]);
    const firstProcessor = processor(repository, transport);

    await expect(firstProcessor.processOne(userA)).resolves.toBe(false);
    expect(repository.snapshot.tasks[0]?.id).toBe(temporaryTaskId);
    expect(repository.operationFor(userA, createOperationId).state).toBe('retry_scheduled');

    await expect(
      processor(repository, transport, '2026-07-28T08:00:04.000Z').processOne(userA),
    ).resolves.toBe(true);
    await expect(
      repository.acknowledgeAcceptedOperation({
        userId: userA,
        operation: repository.operationFor(userA, createOperationId),
        result: duplicate,
      }),
    ).resolves.toBeUndefined();

    expect(transport.sent.map((queued) => queued.operationId)).toEqual([
      createOperationId,
      createOperationId,
    ]);
    expect(repository.snapshot.tasks).toHaveLength(1);
    expect(repository.snapshot.tasks[0]?.id).toBe(serverTaskId);
    expect(repository.operationFor(userA, updateOperationId).targetId).toBe(serverTaskId);
  });

  it('treats a different server ID for the same mapping as a local conflict', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(), [createOperation()]);
    repository.mappings.set(`${userA}:${temporaryTaskId}`, conflictingServerTaskId);
    const transport = new ScriptedTransport([accepted(createOperationId)]);

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(false);
    expect(repository.operationFor(userA, createOperationId).state).toBe('conflict');
    expect(repository.conflicts).toEqual([`${createOperationId}:revision_conflict`]);
    expect(repository.snapshot.tasks[0]?.id).toBe(temporaryTaskId);
  });

  it('keeps dependent chains ordered and preserves the stale expected revision for conflict handling', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(), [
      createOperation(),
      updateOperation(),
      completeOperation(),
    ]);
    const transport = new ScriptedTransport([
      accepted(createOperationId),
      accepted(updateOperationId),
      {
        operationId: completeOperationId,
        status: 'conflict',
        entity: null,
        error: { code: 'revision_conflict', message: 'Task changed remotely.' },
        syncCursor: null,
      },
    ]);
    const subject = processor(repository, transport);

    await subject.processOne(userA);
    await subject.processOne(userA);
    await subject.processOne(userA);

    expect(transport.sent.map((queued) => queued.operationId)).toEqual([
      createOperationId,
      updateOperationId,
      completeOperationId,
    ]);
    expect(repository.operationFor(userA, completeOperationId).expectedRevision).toBe(1);
    expect(repository.operationFor(userA, completeOperationId).state).toBe('conflict');
  });

  it('records a reopen conflict without replacing its optimistic local task state', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(), [reopenOperation(null, 1)]);
    const transport = new ScriptedTransport([
      {
        operationId: reopenOperationId,
        status: 'conflict',
        entity: null,
        error: { code: 'revision_conflict', message: 'Task changed remotely.' },
        syncCursor: null,
      },
    ]);

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(false);

    expect(repository.operationFor(userA, reopenOperationId).state).toBe('conflict');
    expect(repository.conflicts).toEqual([`${reopenOperationId}:revision_conflict`]);
    expect(repository.snapshot.tasks[0]?.status).toBe('planned');
  });

  it('records a cancellation conflict without replacing the optimistic local cancellation', async () => {
    const optimistic = createSnapshot();
    const repository = new InMemoryOutboxRepository(
      {
        ...optimistic,
        tasks: optimistic.tasks.map((task) => ({
          ...task,
          status: 'cancelled',
          revision: revisionSchema.parse(2),
        })),
      },
      [cancelOperation(null, 1)],
    );
    const transport = new ScriptedTransport([
      {
        operationId: cancelOperationId,
        status: 'conflict',
        entity: null,
        error: { code: 'revision_conflict', message: 'Task changed remotely.' },
        syncCursor: null,
      },
    ]);

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(false);

    expect(repository.operationFor(userA, cancelOperationId).state).toBe('conflict');
    expect(repository.conflicts).toEqual([`${cancelOperationId}:revision_conflict`]);
    expect(repository.snapshot.tasks[0]).toMatchObject({ status: 'cancelled', revision: 2 });
  });

  it('records a reschedule conflict without replacing the optimistic local schedule', async () => {
    const optimistic = createSnapshot();
    const repository = new InMemoryOutboxRepository(
      {
        ...optimistic,
        tasks: optimistic.tasks.map((task) => ({
          ...task,
          scheduledAt: utcTimestampSchema.parse('2026-07-29T14:30:00.000Z'),
          scheduledTimezone: ianaTimeZoneSchema.parse('America/New_York'),
          revision: revisionSchema.parse(2),
        })),
      },
      [rescheduleOperation(null, 1)],
    );
    const transport = new ScriptedTransport([
      {
        operationId: rescheduleOperationId,
        status: 'conflict',
        entity: null,
        error: { code: 'revision_conflict', message: 'Task changed remotely.' },
        syncCursor: null,
      },
    ]);

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(false);

    expect(repository.operationFor(userA, rescheduleOperationId).state).toBe('conflict');
    expect(repository.conflicts).toEqual([`${rescheduleOperationId}:revision_conflict`]);
    expect(repository.snapshot.tasks[0]).toMatchObject({
      scheduledAt: '2026-07-29T14:30:00.000Z',
      scheduledTimezone: 'America/New_York',
      revision: 2,
    });
  });

  it('records a reorder conflict without replacing the optimistic local position', async () => {
    const optimistic = createSnapshot();
    const repository = new InMemoryOutboxRepository(
      {
        ...optimistic,
        tasks: optimistic.tasks.map((task) => ({
          ...task,
          position: 0.5,
          revision: revisionSchema.parse(2),
        })),
      },
      [reorderOperation(null, 1, 0.5)],
    );
    const transport = new ScriptedTransport([
      {
        operationId: reorderOperationId,
        status: 'conflict',
        entity: null,
        error: { code: 'revision_conflict', message: 'Task changed remotely.' },
        syncCursor: null,
      },
    ]);

    await expect(processor(repository, transport).processOne(userA)).resolves.toBe(false);

    expect(repository.operationFor(userA, reorderOperationId).state).toBe('conflict');
    expect(repository.conflicts).toEqual([`${reorderOperationId}:revision_conflict`]);
    expect(repository.snapshot.tasks[0]).toMatchObject({ position: 0.5, revision: 2 });
  });

  it("does not claim or update another account's queued task cancellation", async () => {
    const queuedCancellation = cancelOperation(null, 1);
    const repository = new InMemoryOutboxRepository(createSnapshot(userA), [queuedCancellation]);
    const transport = new ScriptedTransport([]);

    await expect(processor(repository, transport).processOne(userB)).resolves.toBe(false);
    expect(transport.sent).toHaveLength(0);
    expect(() => repository.operationFor(userB, cancelOperationId)).toThrow(
      'not available for this user',
    );
    expect(repository.operationFor(userA, cancelOperationId).state).toBe('pending');
  });

  it("does not claim or update another account's queued task reschedule", async () => {
    const queuedReschedule = rescheduleOperation(null, 1);
    const repository = new InMemoryOutboxRepository(createSnapshot(userA), [queuedReschedule]);
    const transport = new ScriptedTransport([]);

    await expect(processor(repository, transport).processOne(userB)).resolves.toBe(false);
    expect(transport.sent).toHaveLength(0);
    expect(() => repository.operationFor(userB, rescheduleOperationId)).toThrow(
      'not available for this user',
    );
    expect(repository.operationFor(userA, rescheduleOperationId).state).toBe('pending');
  });

  it("does not claim or update another account's queued task reorder", async () => {
    const queuedReorder = reorderOperation(null, 1, 0.5);
    const repository = new InMemoryOutboxRepository(createSnapshot(userA), [queuedReorder]);
    const transport = new ScriptedTransport([]);

    await expect(processor(repository, transport).processOne(userB)).resolves.toBe(false);
    expect(transport.sent).toHaveLength(0);
    expect(() => repository.operationFor(userB, reorderOperationId)).toThrow(
      'not available for this user',
    );
    expect(repository.operationFor(userA, reorderOperationId).state).toBe('pending');
  });

  it('does not retry a permanently rejected cancellation', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(), [cancelOperation(null, 1)]);
    const transport = new ScriptedTransport([
      {
        operationId: cancelOperationId,
        status: 'rejected',
        entity: null,
        error: { code: 'invalid_transition', message: 'Task cannot be cancelled.' },
        syncCursor: null,
      },
    ]);
    const subject = processor(repository, transport);

    await expect(subject.processOne(userA)).resolves.toBe(false);
    await expect(subject.processOne(userA)).resolves.toBe(false);

    expect(transport.sent).toHaveLength(1);
    expect(repository.operationFor(userA, cancelOperationId).state).toBe('permanently_rejected');
  });

  it('does not retry a permanently rejected reschedule', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(), [
      rescheduleOperation(null, 1),
    ]);
    const transport = new ScriptedTransport([
      {
        operationId: rescheduleOperationId,
        status: 'rejected',
        entity: null,
        error: { code: 'invalid_transition', message: 'Task cannot be rescheduled.' },
        syncCursor: null,
      },
    ]);
    const subject = processor(repository, transport);

    await expect(subject.processOne(userA)).resolves.toBe(false);
    await expect(subject.processOne(userA)).resolves.toBe(false);

    expect(transport.sent).toHaveLength(1);
    expect(repository.operationFor(userA, rescheduleOperationId).state).toBe(
      'permanently_rejected',
    );
  });

  it('does not retry a permanently rejected reorder', async () => {
    const repository = new InMemoryOutboxRepository(createSnapshot(), [reorderOperation(null, 1)]);
    const transport = new ScriptedTransport([
      {
        operationId: reorderOperationId,
        status: 'rejected',
        entity: null,
        error: { code: 'invalid_transition', message: 'Task cannot be reordered.' },
        syncCursor: null,
      },
    ]);
    const subject = processor(repository, transport);

    await expect(subject.processOne(userA)).resolves.toBe(false);
    await expect(subject.processOne(userA)).resolves.toBe(false);

    expect(transport.sent).toHaveLength(1);
    expect(repository.operationFor(userA, reorderOperationId).state).toBe('permanently_rejected');
  });

  it.each([
    {
      result: {
        operationId: createOperationId,
        status: 'rejected' as const,
        entity: null,
        error: { code: 'validation_failed' as const, message: 'Invalid task.' },
        syncCursor: null,
      },
      expectedState: 'permanently_rejected' as const,
    },
    {
      result: {
        operationId: createOperationId,
        status: 'conflict' as const,
        entity: null,
        error: { code: 'revision_conflict' as const, message: 'Task changed remotely.' },
        syncCursor: null,
      },
      expectedState: 'conflict' as const,
    },
  ])(
    'does not release a dependent after a $expectedState prerequisite',
    async ({ result, expectedState }) => {
      const repository = new InMemoryOutboxRepository(createSnapshot(), [
        createOperation(),
        updateOperation(),
      ]);
      const transport = new ScriptedTransport([result]);
      const subject = processor(repository, transport);

      await subject.processOne(userA);
      await expect(subject.processOne(userA)).resolves.toBe(false);
      expect(transport.sent).toHaveLength(1);
      expect(repository.operationFor(userA, createOperationId).state).toBe(expectedState);
      expect(repository.operationFor(userA, updateOperationId).state).toBe('pending');
    },
  );
});
