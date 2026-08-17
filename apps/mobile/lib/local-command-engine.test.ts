import type { TodaySnapshot } from '@personal-os/database-contracts';
import type { OperationId, UserId } from '@personal-os/domain';
import {
  lifeDayIdSchema,
  operationIdSchema,
  revisionSchema,
  taskIdSchema,
  todaySnapshotSchema,
  utcTimestampSchema,
  userIdSchema,
} from '@personal-os/validation';
import { describe, expect, it } from 'vitest';

import { LocalCommandEngine, type LocalCommandRepository } from './local-command-engine';

const ids = {
  user: userIdSchema.parse('11111111-1111-4111-8111-111111111111'),
  lifeDay: lifeDayIdSchema.parse('22222222-2222-4222-8222-222222222222'),
  task: taskIdSchema.parse('33333333-3333-4333-8333-333333333333'),
  temporaryTask: taskIdSchema.parse('44444444-4444-4444-8444-444444444444'),
  createOperation: '55555555-5555-4555-8555-555555555555',
  updateOperation: '66666666-6666-4666-8666-666666666666',
  secondUpdateOperation: '77777777-7777-4777-8777-777777777777',
  completeOperation: '88888888-8888-4888-8888-888888888888',
  reopenOperation: '99999999-9999-4999-8999-999999999999',
  cancelOperation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  rescheduleOperation: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  reorderOperation: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  secondReorderOperation: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  beforeTask: taskIdSchema.parse('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  afterTask: taskIdSchema.parse('ffffffff-ffff-4fff-8fff-ffffffffffff'),
} as const;

const timestamp = utcTimestampSchema.parse('2026-07-18T08:00:00.000Z');

class InMemoryRepository implements LocalCommandRepository {
  public readonly operations: Array<Parameters<LocalCommandRepository['insertOutbox']>[0]> = [];
  public readonly temporaryTasks: Array<
    Parameters<LocalCommandRepository['registerTemporaryTask']>[0]
  > = [];
  public failInsertOutbox = false;
  public failTemporaryTaskRegistration = false;

  public constructor(private snapshot: TodaySnapshot) {}

  public async transaction<Value>(work: () => Promise<Value>): Promise<Value> {
    const beforeSnapshot = this.snapshot;
    const beforeOperations = this.operations.length;
    const beforeTemporaryTasks = this.temporaryTasks.length;
    try {
      return await work();
    } catch (error) {
      this.snapshot = beforeSnapshot;
      this.operations.splice(beforeOperations);
      this.temporaryTasks.splice(beforeTemporaryTasks);
      throw error;
    }
  }

  public async readSnapshot(userId: UserId): Promise<TodaySnapshot | null> {
    return userId === ids.user ? this.snapshot : null;
  }

  public async replaceSnapshot(userId: UserId, snapshot: TodaySnapshot): Promise<void> {
    if (userId !== ids.user) throw new Error('User scope mismatch');
    this.snapshot = snapshot;
  }

  public async insertOutbox(
    input: Parameters<LocalCommandRepository['insertOutbox']>[0],
  ): Promise<void> {
    if (this.failInsertOutbox) throw new Error('Simulated outbox persistence failure.');
    this.operations.push(input);
  }

  public async registerTemporaryTask(
    input: Parameters<LocalCommandRepository['registerTemporaryTask']>[0],
  ): Promise<void> {
    if (this.failTemporaryTaskRegistration) {
      throw new Error('Simulated temporary-task persistence failure.');
    }
    this.temporaryTasks.push(input);
  }

  public async nextSequence(): Promise<number> {
    return this.operations.length + 1;
  }

  public async latestPendingOperation(
    _userId: UserId,
    targetId: string,
  ): Promise<OperationId | null> {
    return (
      this.operations.findLast((operation) => operation.targetId === targetId)?.operationId ?? null
    );
  }

  public currentSnapshot(): TodaySnapshot {
    return this.snapshot;
  }
}

function createEngine(repository: LocalCommandRepository): LocalCommandEngine {
  return new LocalCommandEngine({
    repository,
    now: () => timestamp,
    temporaryTaskId: () => ids.temporaryTask,
  });
}

function createSnapshot(): TodaySnapshot {
  return todaySnapshotSchema.parse({
    profile: {
      id: ids.user,
      homeTimezone: 'Asia/Karachi',
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    lifeDay: {
      id: ids.lifeDay,
      operationalDate: '2026-07-18',
      timezone: 'Asia/Karachi',
      wokeAt: timestamp,
      sleptAt: null,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    tasks: [],
  });
}

function metadata(
  operationId: string,
  commandName = 'task.create',
  baseRevision: number | null = null,
) {
  return {
    operationId,
    deviceId: '77777777-7777-4777-8777-777777777777',
    schemaVersion: 1,
    commandName,
    baseRevision,
    clientOccurredAt: timestamp,
    clientTimezone: 'Asia/Karachi',
  };
}

function existingTaskSnapshot(): TodaySnapshot {
  const snapshot = createSnapshot();
  return todaySnapshotSchema.parse({
    ...snapshot,
    tasks: [
      {
        id: ids.task,
        lifeDayId: ids.lifeDay,
        title: 'Existing task',
        description: null,
        status: 'planned',
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
        isTopThree: false,
        completedAt: null,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  });
}

function completedTaskSnapshot(revision = 1): TodaySnapshot {
  const snapshot = existingTaskSnapshot();
  return todaySnapshotSchema.parse({
    ...snapshot,
    tasks: snapshot.tasks.map((task) => ({
      ...task,
      status: 'completed',
      completedAt: timestamp,
      revision,
    })),
  });
}

function orderedTaskSnapshot(
  status: 'planned' | 'in_progress' | 'overdue' = 'planned',
): TodaySnapshot {
  const snapshot = existingTaskSnapshot();
  return todaySnapshotSchema.parse({
    ...snapshot,
    tasks: [
      {
        ...snapshot.tasks[0],
        id: ids.beforeTask,
        title: 'Before',
        position: 1,
        createdAt: utcTimestampSchema.parse('2026-07-18T07:58:00.000Z'),
      },
      { ...snapshot.tasks[0], id: ids.task, title: 'Middle', status, position: 2 },
      {
        ...snapshot.tasks[0],
        id: ids.afterTask,
        title: 'After',
        position: 3,
        createdAt: utcTimestampSchema.parse('2026-07-18T08:02:00.000Z'),
      },
    ],
  });
}

describe('LocalCommandEngine', () => {
  it('creates a temporary task and durable create mapping in one local command', async () => {
    const repository = new InMemoryRepository(createSnapshot());
    const result = await createEngine(repository).createTask(ids.user, {
      metadata: metadata(ids.createOperation),
      payload: {
        lifeDayId: ids.lifeDay,
        title: 'Offline task',
        description: null,
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: 30,
        position: 1,
      },
    });

    expect(result.status).toBe('queued');
    expect(repository.currentSnapshot().tasks[0]?.id).toBe(ids.temporaryTask);
    expect(repository.operations).toHaveLength(1);
    expect(repository.operations[0]?.targetId).toBe(ids.temporaryTask);
    expect(repository.temporaryTasks).toEqual([
      {
        userId: ids.user,
        temporaryTaskId: ids.temporaryTask,
        createOperationId: operationIdSchema.parse(ids.createOperation),
      },
    ]);
  });

  it('keeps a follow-up task mutation behind its pending create operation', async () => {
    const repository = new InMemoryRepository(createSnapshot());
    const engine = createEngine(repository);
    await engine.createTask(ids.user, {
      metadata: metadata(ids.createOperation),
      payload: {
        lifeDayId: ids.lifeDay,
        title: 'Offline task',
        description: null,
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
      },
    });

    const result = await engine.complete(ids.user, {
      metadata: { ...metadata(ids.updateOperation), commandName: 'task.complete', baseRevision: 1 },
      payload: { taskId: ids.temporaryTask, lifeDayId: ids.lifeDay, completedAt: timestamp },
    });

    expect(result.status).toBe('queued');
    expect(repository.operations[1]?.dependsOnOperationId).toBe(ids.createOperation);
    expect(repository.currentSnapshot().tasks[0]?.status).toBe('completed');
  });

  it('reopens a completed task immediately and queues one durable command', async () => {
    const repository = new InMemoryRepository(completedTaskSnapshot());

    const result = await createEngine(repository).reopen(ids.user, {
      metadata: metadata(ids.reopenOperation, 'task.reopen', 1),
      payload: { taskId: ids.task, lifeDayId: ids.lifeDay },
    });

    expect(result.status).toBe('queued');
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      id: ids.task,
      status: 'planned',
      completedAt: null,
      revision: 2,
    });
    expect(repository.operations).toEqual([
      expect.objectContaining({
        operationId: ids.reopenOperation,
        commandType: 'task.reopen',
        targetId: ids.task,
        expectedRevision: 1,
        dependsOnOperationId: null,
      }),
    ]);
  });

  it('orders a temporary task cancellation after its create, edit, completion, and reopen commands', async () => {
    const repository = new InMemoryRepository(createSnapshot());
    const engine = createEngine(repository);
    await engine.createTask(ids.user, {
      metadata: metadata(ids.createOperation),
      payload: {
        lifeDayId: ids.lifeDay,
        title: 'Offline task',
        description: null,
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
      },
    });
    await engine.updateTask(ids.user, {
      metadata: metadata(ids.updateOperation, 'task.update', 1),
      payload: {
        taskId: ids.temporaryTask,
        lifeDayId: ids.lifeDay,
        title: 'Edited before completion',
        description: null,
        status: 'planned',
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
      },
    });
    await engine.complete(ids.user, {
      metadata: metadata(ids.completeOperation, 'task.complete', 2),
      payload: { taskId: ids.temporaryTask, lifeDayId: ids.lifeDay, completedAt: timestamp },
    });
    await engine.reopen(ids.user, {
      metadata: metadata(ids.reopenOperation, 'task.reopen', 3),
      payload: { taskId: ids.temporaryTask, lifeDayId: ids.lifeDay },
    });
    await engine.cancel(ids.user, {
      metadata: metadata(ids.cancelOperation, 'task.cancel', 4),
      payload: {
        taskId: ids.temporaryTask,
        cancelledAt: timestamp,
        reason: { code: 'no_longer_relevant' },
      },
    });

    expect(repository.operations).toHaveLength(5);
    expect(repository.operations.map((operation) => operation.commandType)).toEqual([
      'task.create',
      'task.update',
      'task.complete',
      'task.reopen',
      'task.cancel',
    ]);
    expect(repository.operations[4]).toMatchObject({
      operationId: ids.cancelOperation,
      expectedRevision: 4,
      dependsOnOperationId: operationIdSchema.parse(ids.reopenOperation),
      localSequence: 5,
    });
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      id: ids.temporaryTask,
      status: 'cancelled',
      completedAt: null,
      revision: 5,
    });
  });

  it('cancels an active task immediately and persists the structured reason', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());

    const result = await createEngine(repository).cancel(ids.user, {
      metadata: metadata(ids.cancelOperation, 'task.cancel', 1),
      payload: {
        taskId: ids.task,
        cancelledAt: timestamp,
        reason: { code: 'capacity_limit' },
      },
    });

    expect(result.status).toBe('queued');
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      id: ids.task,
      status: 'cancelled',
      isTopThree: false,
      revision: 2,
    });
    expect(repository.operations).toEqual([
      expect.objectContaining({
        operationId: ids.cancelOperation,
        commandType: 'task.cancel',
        targetId: ids.task,
        expectedRevision: 1,
        dependsOnOperationId: null,
      }),
    ]);
    expect(JSON.parse(repository.operations[0]?.commandJson ?? '{}')).toMatchObject({
      payload: { reason: { code: 'capacity_limit' } },
    });
  });

  it('requires the existing non-empty note for an other cancellation reason', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());
    const engine = createEngine(repository);

    const rejected = await engine.cancel(ids.user, {
      metadata: metadata(ids.cancelOperation, 'task.cancel', 1),
      payload: { taskId: ids.task, cancelledAt: timestamp, reason: { code: 'other' } },
    });
    expect(rejected).toMatchObject({ status: 'rejected', error: { code: 'validation_failed' } });

    const accepted = await engine.cancel(ids.user, {
      metadata: metadata(ids.cancelOperation, 'task.cancel', 1),
      payload: {
        taskId: ids.task,
        cancelledAt: timestamp,
        reason: { code: 'other', note: 'The circumstances changed.' },
      },
    });
    expect(accepted.status).toBe('queued');
    expect(JSON.parse(repository.operations[0]?.commandJson ?? '{}')).toMatchObject({
      payload: { reason: { code: 'other', note: 'The circumstances changed.' } },
    });
  });

  it('rejects a stale local cancellation without silently rebasing it', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());

    const result = await createEngine(repository).cancel(ids.user, {
      metadata: metadata(ids.cancelOperation, 'task.cancel', 2),
      payload: {
        taskId: ids.task,
        cancelledAt: timestamp,
        reason: { code: 'no_longer_relevant' },
      },
    });

    expect(result).toMatchObject({ status: 'rejected', error: { code: 'revision_conflict' } });
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({ status: 'planned', revision: 1 });
    expect(repository.operations).toHaveLength(0);
  });

  it('rolls back an optimistic cancellation when durable outbox persistence fails', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());
    repository.failInsertOutbox = true;

    await expect(
      createEngine(repository).cancel(ids.user, {
        metadata: metadata(ids.cancelOperation, 'task.cancel', 1),
        payload: {
          taskId: ids.task,
          cancelledAt: timestamp,
          reason: { code: 'no_longer_relevant' },
        },
      }),
    ).rejects.toThrow('Simulated outbox persistence failure.');

    expect(repository.currentSnapshot().tasks[0]).toMatchObject({ status: 'planned', revision: 1 });
    expect(repository.operations).toHaveLength(0);
  });

  it('rejects cancellation and all other mutations once a task is locally cancelled', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());
    const engine = createEngine(repository);
    await engine.cancel(ids.user, {
      metadata: metadata(ids.cancelOperation, 'task.cancel', 1),
      payload: {
        taskId: ids.task,
        cancelledAt: timestamp,
        reason: { code: 'no_longer_relevant' },
      },
    });

    const [complete, update, reopen, cancel] = await Promise.all([
      engine.complete(ids.user, {
        metadata: metadata(ids.completeOperation, 'task.complete', 2),
        payload: { taskId: ids.task, lifeDayId: ids.lifeDay, completedAt: timestamp },
      }),
      engine.updateTask(ids.user, {
        metadata: metadata(ids.updateOperation, 'task.update', 2),
        payload: {
          taskId: ids.task,
          lifeDayId: ids.lifeDay,
          title: 'Not permitted',
          description: null,
          priority: 'progress',
          status: 'planned',
          scheduledAt: null,
          scheduledTimezone: null,
          estimatedMinutes: null,
          position: 1,
        },
      }),
      engine.reopen(ids.user, {
        metadata: metadata(ids.reopenOperation, 'task.reopen', 2),
        payload: { taskId: ids.task, lifeDayId: ids.lifeDay },
      }),
      engine.cancel(ids.user, {
        metadata: metadata(ids.cancelOperation, 'task.cancel', 2),
        payload: {
          taskId: ids.task,
          cancelledAt: timestamp,
          reason: { code: 'duplicate' },
        },
      }),
    ]);

    for (const result of [complete, update, reopen, cancel]) {
      expect(result).toMatchObject({ status: 'rejected', error: { code: 'invalid_transition' } });
    }
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      status: 'cancelled',
      revision: 2,
    });
    expect(repository.operations).toHaveLength(1);
  });

  it('does not allow another account to queue a task cancellation against this cache', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());
    const otherUser = userIdSchema.parse('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

    const result = await createEngine(repository).cancel(otherUser, {
      metadata: metadata(ids.cancelOperation, 'task.cancel', 1),
      payload: {
        taskId: ids.task,
        cancelledAt: timestamp,
        reason: { code: 'no_longer_relevant' },
      },
    });

    expect(result).toMatchObject({ status: 'rejected', error: { code: 'invalid_transition' } });
    expect(repository.currentSnapshot().tasks[0]?.status).toBe('planned');
    expect(repository.operations).toHaveLength(0);
  });

  it('moves an active task up immediately and queues exactly one reorder command', async () => {
    const repository = new InMemoryRepository(orderedTaskSnapshot());
    const result = await createEngine(repository).reorder(ids.user, {
      metadata: metadata(ids.reorderOperation, 'task.reorder', 1),
      payload: { taskId: ids.task, position: 0.5 },
    });

    expect(result.status).toBe('queued');
    expect(repository.currentSnapshot().tasks.map((task) => task.id)).toEqual([
      ids.task,
      ids.beforeTask,
      ids.afterTask,
    ]);
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({ position: 0.5, revision: 2 });
    expect(repository.operations).toEqual([
      expect.objectContaining({
        operationId: ids.reorderOperation,
        commandType: 'task.reorder',
        expectedRevision: 1,
        targetId: ids.task,
        dependsOnOperationId: null,
      }),
    ]);
    expect(JSON.parse(repository.operations[0]?.commandJson ?? '{}')).toMatchObject({
      metadata: metadata(ids.reorderOperation, 'task.reorder', 1),
      payload: { taskId: ids.task, position: 0.5 },
    });
  });

  it('moves an active task down immediately using the exact numeric position', async () => {
    const repository = new InMemoryRepository(orderedTaskSnapshot());

    await createEngine(repository).reorder(ids.user, {
      metadata: metadata(ids.reorderOperation, 'task.reorder', 1),
      payload: { taskId: ids.task, position: 3.5 },
    });

    expect(repository.currentSnapshot().tasks.map((task) => task.id)).toEqual([
      ids.beforeTask,
      ids.afterTask,
      ids.task,
    ]);
    expect(repository.currentSnapshot().tasks[2]).toMatchObject({ position: 3.5, revision: 2 });
  });

  it('orders temporary and repeated reorder commands after the prior same-task operation', async () => {
    const repository = new InMemoryRepository(createSnapshot());
    const engine = createEngine(repository);
    await engine.createTask(ids.user, {
      metadata: metadata(ids.createOperation),
      payload: {
        lifeDayId: ids.lifeDay,
        title: 'Offline task',
        description: null,
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
      },
    });
    await engine.reorder(ids.user, {
      metadata: metadata(ids.reorderOperation, 'task.reorder', 1),
      payload: { taskId: ids.temporaryTask, position: 2 },
    });
    await engine.reorder(ids.user, {
      metadata: metadata(ids.secondReorderOperation, 'task.reorder', 2),
      payload: { taskId: ids.temporaryTask, position: 0.5 },
    });

    expect(repository.operations.map((operation) => operation.commandType)).toEqual([
      'task.create',
      'task.reorder',
      'task.reorder',
    ]);
    expect(repository.operations[1]).toMatchObject({
      dependsOnOperationId: operationIdSchema.parse(ids.createOperation),
      expectedRevision: 1,
      localSequence: 2,
    });
    expect(repository.operations[2]).toMatchObject({
      dependsOnOperationId: operationIdSchema.parse(ids.reorderOperation),
      expectedRevision: 2,
      localSequence: 3,
    });
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      id: ids.temporaryTask,
      position: 0.5,
      revision: 3,
    });
  });

  it.each(['planned', 'in_progress', 'overdue'] as const)(
    'allows an active %s task to be reordered',
    async (status) => {
      const repository = new InMemoryRepository(orderedTaskSnapshot(status));

      const result = await createEngine(repository).reorder(ids.user, {
        metadata: metadata(ids.reorderOperation, 'task.reorder', 1),
        payload: { taskId: ids.task, position: 0.5 },
      });

      expect(result.status).toBe('queued');
      expect(repository.currentSnapshot().tasks[0]).toMatchObject({
        id: ids.task,
        status,
        revision: 2,
      });
    },
  );

  it.each(['completed', 'cancelled', 'archived'] as const)(
    'rejects a terminal %s task before changing cached order or queuing work',
    async (status) => {
      const base = orderedTaskSnapshot();
      const repository = new InMemoryRepository(
        todaySnapshotSchema.parse({
          ...base,
          tasks: base.tasks.map((task) =>
            task.id === ids.task
              ? { ...task, status, completedAt: status === 'completed' ? timestamp : null }
              : task,
          ),
        }),
      );

      const result = await createEngine(repository).reorder(ids.user, {
        metadata: metadata(ids.reorderOperation, 'task.reorder', 1),
        payload: { taskId: ids.task, position: 0.5 },
      });

      expect(result).toMatchObject({ status: 'rejected', error: { code: 'invalid_transition' } });
      expect(repository.currentSnapshot().tasks.map((task) => task.id)).toEqual([
        ids.beforeTask,
        ids.task,
        ids.afterTask,
      ]);
      expect(repository.operations).toHaveLength(0);
    },
  );

  it('preserves a reorder conflict, account boundary, and rollback on local persistence failure', async () => {
    const repository = new InMemoryRepository(orderedTaskSnapshot());
    const engine = createEngine(repository);
    const stale = await engine.reorder(ids.user, {
      metadata: metadata(ids.reorderOperation, 'task.reorder', 2),
      payload: { taskId: ids.task, position: 0.5 },
    });
    const crossAccount = await engine.reorder(
      userIdSchema.parse('12121212-1212-4121-8121-121212121212'),
      {
        metadata: metadata(ids.reorderOperation, 'task.reorder', 1),
        payload: { taskId: ids.task, position: 0.5 },
      },
    );
    repository.failInsertOutbox = true;

    await expect(
      engine.reorder(ids.user, {
        metadata: metadata(ids.reorderOperation, 'task.reorder', 1),
        payload: { taskId: ids.task, position: 0.5 },
      }),
    ).rejects.toThrow('Simulated outbox persistence failure.');

    expect(stale).toMatchObject({ status: 'rejected', error: { code: 'revision_conflict' } });
    expect(crossAccount).toMatchObject({
      status: 'rejected',
      error: { code: 'invalid_transition' },
    });
    expect(repository.currentSnapshot().tasks.map((task) => task.id)).toEqual([
      ids.beforeTask,
      ids.task,
      ids.afterTask,
    ]);
    expect(repository.operations).toHaveLength(0);
  });

  it('reschedules an eligible task immediately and persists the exact schedule and reason', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());
    const result = await createEngine(repository).reschedule(ids.user, {
      metadata: metadata(ids.rescheduleOperation, 'task.reschedule', 1),
      payload: {
        taskId: ids.task,
        scheduledAt: '2026-07-19T14:30:00.000Z',
        scheduledTimezone: 'America/New_York',
        reason: { code: 'user_rescheduled' },
      },
    });

    expect(result.status).toBe('queued');
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      status: 'planned',
      scheduledAt: '2026-07-19T14:30:00.000Z',
      scheduledTimezone: 'America/New_York',
      revision: 2,
    });
    expect(repository.operations).toEqual([
      expect.objectContaining({
        operationId: ids.rescheduleOperation,
        commandType: 'task.reschedule',
        targetId: ids.task,
        expectedRevision: 1,
        dependsOnOperationId: null,
      }),
    ]);
    expect(JSON.parse(repository.operations[0]?.commandJson ?? '{}')).toMatchObject({
      payload: {
        scheduledAt: '2026-07-19T14:30:00.000Z',
        scheduledTimezone: 'America/New_York',
        reason: { code: 'user_rescheduled' },
      },
    });
  });

  it('requires a scheduled instant, IANA timezone, and note for an other reschedule reason', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());
    const engine = createEngine(repository);

    const missingNote = await engine.reschedule(ids.user, {
      metadata: metadata(ids.rescheduleOperation, 'task.reschedule', 1),
      payload: {
        taskId: ids.task,
        scheduledAt: '2026-07-19T14:30:00.000Z',
        scheduledTimezone: 'Asia/Karachi',
        reason: { code: 'other' },
      },
    });
    expect(missingNote).toMatchObject({ status: 'rejected', error: { code: 'validation_failed' } });

    const flexible = await engine.reschedule(ids.user, {
      metadata: metadata(ids.rescheduleOperation, 'task.reschedule', 1),
      payload: {
        taskId: ids.task,
        scheduledAt: null,
        scheduledTimezone: null,
        reason: { code: 'other', note: 'A new time is needed.' },
      },
    });
    expect(flexible).toMatchObject({ status: 'rejected', error: { code: 'validation_failed' } });
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({ revision: 1, scheduledAt: null });
    expect(repository.operations).toHaveLength(0);
  });

  it('orders a temporary task reschedule after create, edit, completion, and reopen', async () => {
    const repository = new InMemoryRepository(createSnapshot());
    const engine = createEngine(repository);
    await engine.createTask(ids.user, {
      metadata: metadata(ids.createOperation),
      payload: {
        lifeDayId: ids.lifeDay,
        title: 'Offline task',
        description: null,
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
      },
    });
    await engine.updateTask(ids.user, {
      metadata: metadata(ids.updateOperation, 'task.update', 1),
      payload: {
        taskId: ids.temporaryTask,
        lifeDayId: ids.lifeDay,
        title: 'Edited offline task',
        description: null,
        priority: 'progress',
        status: 'planned',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
      },
    });
    await engine.complete(ids.user, {
      metadata: metadata(ids.completeOperation, 'task.complete', 2),
      payload: { taskId: ids.temporaryTask, lifeDayId: ids.lifeDay, completedAt: timestamp },
    });
    await engine.reopen(ids.user, {
      metadata: metadata(ids.reopenOperation, 'task.reopen', 3),
      payload: { taskId: ids.temporaryTask, lifeDayId: ids.lifeDay },
    });
    await engine.reschedule(ids.user, {
      metadata: metadata(ids.rescheduleOperation, 'task.reschedule', 4),
      payload: {
        taskId: ids.temporaryTask,
        scheduledAt: '2026-07-19T14:30:00.000Z',
        scheduledTimezone: 'Asia/Karachi',
        reason: { code: 'capacity_limit' },
      },
    });

    expect(repository.operations.map((operation) => operation.commandType)).toEqual([
      'task.create',
      'task.update',
      'task.complete',
      'task.reopen',
      'task.reschedule',
    ]);
    expect(repository.operations[4]).toMatchObject({
      operationId: ids.rescheduleOperation,
      expectedRevision: 4,
      dependsOnOperationId: operationIdSchema.parse(ids.reopenOperation),
      localSequence: 5,
    });
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      id: ids.temporaryTask,
      status: 'planned',
      scheduledAt: '2026-07-19T14:30:00.000Z',
      scheduledTimezone: 'Asia/Karachi',
      revision: 5,
    });
  });

  it('rejects stale, cross-account, and invalid-status reschedules without changing local intent', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());
    const engine = createEngine(repository);
    const payload = {
      taskId: ids.task,
      scheduledAt: '2026-07-19T14:30:00.000Z',
      scheduledTimezone: 'Asia/Karachi',
      reason: { code: 'capacity_limit' as const },
    };

    const stale = await engine.reschedule(ids.user, {
      metadata: metadata(ids.rescheduleOperation, 'task.reschedule', 2),
      payload,
    });
    const crossAccount = await engine.reschedule(
      userIdSchema.parse('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      { metadata: metadata(ids.rescheduleOperation, 'task.reschedule', 1), payload },
    );
    const inProgressRepository = new InMemoryRepository(
      todaySnapshotSchema.parse({
        ...existingTaskSnapshot(),
        tasks: existingTaskSnapshot().tasks.map((task) => ({ ...task, status: 'in_progress' })),
      }),
    );
    const invalidStatus = await createEngine(inProgressRepository).reschedule(ids.user, {
      metadata: metadata(ids.rescheduleOperation, 'task.reschedule', 1),
      payload,
    });

    expect(stale).toMatchObject({ status: 'rejected', error: { code: 'revision_conflict' } });
    expect(crossAccount).toMatchObject({
      status: 'rejected',
      error: { code: 'invalid_transition' },
    });
    expect(invalidStatus).toMatchObject({
      status: 'rejected',
      error: { code: 'invalid_transition' },
    });
    expect(repository.operations).toHaveLength(0);
    expect(inProgressRepository.operations).toHaveLength(0);
  });

  it('rolls back an optimistic reschedule when durable outbox persistence fails', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());
    repository.failInsertOutbox = true;

    await expect(
      createEngine(repository).reschedule(ids.user, {
        metadata: metadata(ids.rescheduleOperation, 'task.reschedule', 1),
        payload: {
          taskId: ids.task,
          scheduledAt: '2026-07-19T14:30:00.000Z',
          scheduledTimezone: 'Asia/Karachi',
          reason: { code: 'capacity_limit' },
        },
      }),
    ).rejects.toThrow('Simulated outbox persistence failure.');

    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      scheduledAt: null,
      scheduledTimezone: null,
      revision: 1,
    });
    expect(repository.operations).toHaveLength(0);
  });

  it('rejects a stale local reopen without changing cached intent', async () => {
    const repository = new InMemoryRepository(completedTaskSnapshot());

    const result = await createEngine(repository).reopen(ids.user, {
      metadata: metadata(ids.reopenOperation, 'task.reopen', 2),
      payload: { taskId: ids.task, lifeDayId: ids.lifeDay },
    });

    expect(result).toMatchObject({ status: 'rejected', error: { code: 'revision_conflict' } });
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      status: 'completed',
      completedAt: timestamp,
      revision: 1,
    });
    expect(repository.operations).toHaveLength(0);
  });

  it('rolls back an optimistic reopen when durable outbox persistence fails', async () => {
    const repository = new InMemoryRepository(completedTaskSnapshot());
    repository.failInsertOutbox = true;

    await expect(
      createEngine(repository).reopen(ids.user, {
        metadata: metadata(ids.reopenOperation, 'task.reopen', 1),
        payload: { taskId: ids.task, lifeDayId: ids.lifeDay },
      }),
    ).rejects.toThrow('Simulated outbox persistence failure.');

    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      status: 'completed',
      completedAt: timestamp,
      revision: 1,
    });
    expect(repository.operations).toHaveLength(0);
  });

  it('does not allow another account to queue a task reopen against this cache', async () => {
    const repository = new InMemoryRepository(completedTaskSnapshot());
    const otherUser = userIdSchema.parse('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    const result = await createEngine(repository).reopen(otherUser, {
      metadata: metadata(ids.reopenOperation, 'task.reopen', 1),
      payload: { taskId: ids.task, lifeDayId: ids.lifeDay },
    });

    expect(result).toMatchObject({ status: 'rejected', error: { code: 'invalid_transition' } });
    expect(repository.currentSnapshot().tasks[0]?.status).toBe('completed');
    expect(repository.operations).toHaveLength(0);
  });

  it('applies a complete offline edit immediately and persists its full command', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());

    const result = await createEngine(repository).updateTask(ids.user, {
      metadata: metadata(ids.updateOperation, 'task.update', 1),
      payload: {
        taskId: ids.task,
        lifeDayId: ids.lifeDay,
        title: 'Edited task',
        description: 'Preserve every editable field.',
        status: 'planned',
        priority: 'non_negotiable',
        scheduledAt: '2026-07-18T10:30:00.000Z',
        scheduledTimezone: 'Asia/Karachi',
        estimatedMinutes: 45,
        position: 1,
      },
    });

    expect(result.status).toBe('queued');
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      id: ids.task,
      title: 'Edited task',
      description: 'Preserve every editable field.',
      priority: 'non_negotiable',
      scheduledAt: '2026-07-18T10:30:00.000Z',
      scheduledTimezone: 'Asia/Karachi',
      estimatedMinutes: 45,
      revision: 2,
    });
    expect(repository.operations).toHaveLength(1);
    expect(repository.operations[0]).toMatchObject({
      operationId: ids.updateOperation,
      commandType: 'task.update',
      targetId: ids.task,
      expectedRevision: 1,
      dependsOnOperationId: null,
    });
  });

  it('queues an edit of a temporary task behind creation and predicts sequential revisions', async () => {
    const repository = new InMemoryRepository(createSnapshot());
    const engine = createEngine(repository);
    await engine.createTask(ids.user, {
      metadata: metadata(ids.createOperation),
      payload: {
        lifeDayId: ids.lifeDay,
        title: 'Offline task',
        description: null,
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
      },
    });

    await engine.updateTask(ids.user, {
      metadata: metadata(ids.updateOperation, 'task.update', 1),
      payload: {
        taskId: ids.temporaryTask,
        lifeDayId: ids.lifeDay,
        title: 'First edit',
        description: null,
        status: 'planned',
        priority: 'maintenance',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: 20,
        position: 1,
      },
    });
    await engine.updateTask(ids.user, {
      metadata: metadata(ids.secondUpdateOperation, 'task.update', 2),
      payload: {
        taskId: ids.temporaryTask,
        lifeDayId: ids.lifeDay,
        title: 'Second edit',
        description: 'Final local intent.',
        status: 'planned',
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: 25,
        position: 1,
      },
    });

    expect(repository.operations).toHaveLength(3);
    expect(repository.operations[1]).toMatchObject({
      operationId: ids.updateOperation,
      expectedRevision: 1,
      dependsOnOperationId: ids.createOperation,
      localSequence: 2,
    });
    expect(repository.operations[2]).toMatchObject({
      operationId: ids.secondUpdateOperation,
      expectedRevision: 2,
      dependsOnOperationId: ids.updateOperation,
      localSequence: 3,
    });
    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      id: ids.temporaryTask,
      title: 'Second edit',
      description: 'Final local intent.',
      revision: 3,
    });
  });

  it('rejects a stale local edit without silently rebasing it', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());

    const result = await createEngine(repository).updateTask(ids.user, {
      metadata: metadata(ids.updateOperation, 'task.update', 2),
      payload: {
        taskId: ids.task,
        lifeDayId: ids.lifeDay,
        title: 'Stale edit',
        description: null,
        status: 'planned',
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
      },
    });

    expect(result).toMatchObject({ status: 'rejected', error: { code: 'revision_conflict' } });
    expect(repository.operations).toHaveLength(0);
    expect(repository.currentSnapshot().tasks[0]?.title).toBe('Existing task');
  });

  it('rolls back an optimistic edit when durable outbox persistence fails', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());
    repository.failInsertOutbox = true;

    await expect(
      createEngine(repository).updateTask(ids.user, {
        metadata: metadata(ids.updateOperation, 'task.update', 1),
        payload: {
          taskId: ids.task,
          lifeDayId: ids.lifeDay,
          title: 'Edit that cannot persist',
          description: null,
          status: 'planned',
          priority: 'progress',
          scheduledAt: null,
          scheduledTimezone: null,
          estimatedMinutes: null,
          position: 1,
        },
      }),
    ).rejects.toThrow('Simulated outbox persistence failure.');

    expect(repository.currentSnapshot().tasks[0]).toMatchObject({
      title: 'Existing task',
      revision: 1,
    });
    expect(repository.operations).toHaveLength(0);
  });

  it('does not allow another account to queue an edit against this cache', async () => {
    const repository = new InMemoryRepository(existingTaskSnapshot());
    const otherUser = userIdSchema.parse('88888888-8888-4888-8888-888888888888');

    const result = await createEngine(repository).updateTask(otherUser, {
      metadata: metadata(ids.updateOperation, 'task.update', 1),
      payload: {
        taskId: ids.task,
        lifeDayId: ids.lifeDay,
        title: 'Cross-account edit',
        description: null,
        status: 'planned',
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
      },
    });

    expect(result).toMatchObject({ status: 'rejected', error: { code: 'invalid_transition' } });
    expect(repository.currentSnapshot().tasks[0]?.title).toBe('Existing task');
    expect(repository.operations).toHaveLength(0);
  });

  it('rejects a fourth active Top 3 task without queuing a command', async () => {
    const snapshot = createSnapshot();
    const tasks = [1, 2, 3, 4].map((position) => {
      const [task] = todaySnapshotSchema.parse({
        ...snapshot,
        tasks: [
          {
            id: `00000000-0000-4000-8000-00000000000${position}`,
            lifeDayId: ids.lifeDay,
            title: `Task ${position}`,
            description: null,
            status: 'planned',
            priority: 'progress',
            scheduledAt: null,
            scheduledTimezone: null,
            estimatedMinutes: null,
            position,
            isTopThree: position < 4,
            completedAt: null,
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }).tasks;
      if (task === undefined) throw new Error('Expected a fixture task.');
      return task;
    });
    const repository = new InMemoryRepository({ ...snapshot, tasks });
    const result = await createEngine(repository).topThree(ids.user, {
      metadata: {
        ...metadata(ids.updateOperation),
        commandName: 'task.set_top_three',
        baseRevision: 1,
      },
      payload: { taskId: tasks[3]?.id, isTopThree: true },
    });

    expect(result).toMatchObject({ status: 'rejected', error: { code: 'top_three_limit' } });
    expect(repository.operations).toHaveLength(0);
  });

  it('rejects Life Day closure while a local task remains unresolved', async () => {
    const snapshot = createSnapshot();
    const repository = new InMemoryRepository({
      ...snapshot,
      tasks: [
        {
          id: ids.task,
          lifeDayId: ids.lifeDay,
          title: 'Unfinished',
          description: null,
          status: 'planned',
          priority: 'progress',
          scheduledAt: null,
          scheduledTimezone: null,
          estimatedMinutes: null,
          position: 1,
          isTopThree: false,
          completedAt: null,
          revision: revisionSchema.parse(1),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });

    const result = await createEngine(repository).close(ids.user, {
      metadata: {
        ...metadata(ids.updateOperation),
        commandName: 'life_day.sleep',
        baseRevision: 1,
      },
      payload: { lifeDayId: ids.lifeDay, sleptAt: timestamp, timezone: 'Asia/Karachi' },
    });

    expect(result).toMatchObject({ status: 'rejected', error: { code: 'invalid_transition' } });
    expect(repository.operations).toHaveLength(0);
    expect(repository.currentSnapshot().lifeDay?.sleptAt).toBeNull();
  });

  it('rejects malformed commands before changing the local projection', async () => {
    const repository = new InMemoryRepository(createSnapshot());

    const result = await createEngine(repository).createTask(ids.user, {
      metadata: metadata(ids.createOperation),
      payload: { title: '' },
    });

    expect(result).toMatchObject({ status: 'rejected', error: { code: 'validation_failed' } });
    expect(repository.currentSnapshot().tasks).toHaveLength(0);
    expect(repository.operations).toHaveLength(0);
  });

  it.each(['outbox', 'temporary mapping'] as const)(
    'rolls back the optimistic projection when %s persistence fails',
    async (failure) => {
      const repository = new InMemoryRepository(createSnapshot());
      repository.failInsertOutbox = failure === 'outbox';
      repository.failTemporaryTaskRegistration = failure === 'temporary mapping';

      await expect(
        createEngine(repository).createTask(ids.user, {
          metadata: metadata(ids.createOperation),
          payload: {
            lifeDayId: ids.lifeDay,
            title: 'Offline task',
            description: null,
            priority: 'progress',
            scheduledAt: null,
            scheduledTimezone: null,
            estimatedMinutes: null,
            position: 1,
          },
        }),
      ).rejects.toThrow('Simulated');

      expect(repository.currentSnapshot().tasks).toHaveLength(0);
      expect(repository.operations).toHaveLength(0);
      expect(repository.temporaryTasks).toHaveLength(0);
    },
  );
});
