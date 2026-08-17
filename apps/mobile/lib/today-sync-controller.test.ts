import type { TodaySnapshot } from '@personal-os/database-contracts';
import type { UserId } from '@personal-os/domain';
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

import type { LocalCommandResult } from './local-command-engine';
import {
  TodaySyncController,
  type TodayCacheRepository,
  type TodayCommandEngine,
  type TodayOutboxPresentation,
  type TodayOutboxProcessor,
} from './today-sync-controller';

const timestamp = utcTimestampSchema.parse('2026-07-28T08:00:00.000Z');
const userA = userIdSchema.parse('11111111-1111-4111-8111-111111111111');
const userB = userIdSchema.parse('22222222-2222-4222-8222-222222222222');
const lifeDayId = '33333333-3333-4333-8333-333333333333';
const temporaryTaskId = taskIdSchema.parse('44444444-4444-4444-8444-444444444444');
const serverTaskId = taskIdSchema.parse('55555555-5555-4555-8555-555555555555');
const queuedOperationId = operationIdSchema.parse('66666666-6666-4666-8666-666666666666');

function snapshot(userId: UserId, taskId = temporaryTaskId, status = 'planned'): TodaySnapshot {
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
        id: taskId,
        lifeDayId,
        title: 'Offline task',
        description: null,
        status,
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 1,
        isTopThree: false,
        completedAt: status === 'completed' ? timestamp : null,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  });
}

const emptyPresentation = (): TodayOutboxPresentation => ({
  pendingCount: 0,
  retryableCount: 0,
  pendingTaskIds: [],
  issue: null,
  issueDetails: [],
});

class MemoryCache implements TodayCacheRepository {
  public initializeCalls = 0;
  public clearedUsers: UserId[] = [];
  public retriedUsers: UserId[] = [];
  public mergedSnapshots: TodaySnapshot[] = [];
  public readonly snapshots = new Map<UserId, TodaySnapshot>();
  public readonly presentations = new Map<UserId, TodayOutboxPresentation>();

  public async initialize(): Promise<void> {
    this.initializeCalls += 1;
  }

  public async readSnapshot(userId: UserId): Promise<TodaySnapshot | null> {
    return this.snapshots.get(userId) ?? null;
  }

  public async replaceSnapshot(userId: UserId, value: TodaySnapshot): Promise<void> {
    this.snapshots.set(userId, value);
  }

  public async mergeAuthoritativeSnapshot(userId: UserId, value: TodaySnapshot): Promise<void> {
    const cached = this.snapshots.get(userId);
    const presentation = await this.readPresentation(userId);
    const pendingTaskIds = new Set(presentation.pendingTaskIds);
    if (presentation.issue !== null && cached !== undefined) {
      this.snapshots.set(userId, cached);
      this.mergedSnapshots.push(value);
      return;
    }
    const localPending = cached?.tasks.filter((task) => pendingTaskIds.has(task.id)) ?? [];
    const localById = new Map(localPending.map((task) => [task.id, task]));
    const remoteTaskIds = new Set(value.tasks.map((task) => task.id));
    this.snapshots.set(userId, {
      ...value,
      tasks: [
        ...value.tasks.map((task) => localById.get(task.id) ?? task),
        ...localPending.filter((task) => !remoteTaskIds.has(task.id)),
      ],
    });
    this.mergedSnapshots.push(value);
  }

  public async readPresentation(userId: UserId): Promise<TodayOutboxPresentation> {
    return this.presentations.get(userId) ?? emptyPresentation();
  }

  public async makeRetryableOperationsDue(userId: UserId): Promise<void> {
    this.retriedUsers.push(userId);
    const presentation = await this.readPresentation(userId);
    this.presentations.set(userId, { ...presentation, retryableCount: 0 });
  }

  public async clearUserData(userId: UserId): Promise<void> {
    this.clearedUsers.push(userId);
    this.snapshots.delete(userId);
    this.presentations.delete(userId);
  }
}

class FakeEngine implements TodayCommandEngine {
  public createCalls = 0;
  public updateCalls = 0;
  public reorderCalls = 0;
  public completeCalls = 0;
  public reopenCalls = 0;
  public cancelCalls = 0;
  public rescheduleCalls = 0;
  public throwOnCreate = false;
  public throwOnUpdate = false;
  public throwOnReorder = false;
  public throwOnReopen = false;
  public throwOnCancel = false;
  public throwOnReschedule = false;
  public onCreate: (() => void) | null = null;
  public onUpdate: (() => void) | null = null;
  public onReorder: (() => void) | null = null;
  public onComplete: (() => void) | null = null;
  public onReopen: (() => void) | null = null;
  public onCancel: (() => void) | null = null;
  public onReschedule: (() => void) | null = null;

  public async createTask(_userId: UserId, _command: unknown): Promise<LocalCommandResult> {
    this.createCalls += 1;
    if (this.throwOnCreate) throw new Error('Storage failure.');
    this.onCreate?.();
    return { status: 'queued', operationId: queuedOperationId, snapshot: snapshot(userA) };
  }

  public async updateTask(_userId: UserId, _command: unknown): Promise<LocalCommandResult> {
    this.updateCalls += 1;
    if (this.throwOnUpdate) throw new Error('Storage failure.');
    this.onUpdate?.();
    return { status: 'queued', operationId: queuedOperationId, snapshot: snapshot(userA) };
  }

  public async reorder(_userId: UserId, _command: unknown): Promise<LocalCommandResult> {
    this.reorderCalls += 1;
    if (this.throwOnReorder) throw new Error('Storage failure.');
    this.onReorder?.();
    return { status: 'queued', operationId: queuedOperationId, snapshot: snapshot(userA) };
  }

  public async complete(_userId: UserId, _command: unknown): Promise<LocalCommandResult> {
    this.completeCalls += 1;
    this.onComplete?.();
    return { status: 'queued', operationId: queuedOperationId, snapshot: snapshot(userA) };
  }

  public async reopen(_userId: UserId, _command: unknown): Promise<LocalCommandResult> {
    this.reopenCalls += 1;
    if (this.throwOnReopen) throw new Error('Storage failure.');
    this.onReopen?.();
    return { status: 'queued', operationId: queuedOperationId, snapshot: snapshot(userA) };
  }

  public async cancel(_userId: UserId, _command: unknown): Promise<LocalCommandResult> {
    this.cancelCalls += 1;
    if (this.throwOnCancel) throw new Error('Storage failure.');
    this.onCancel?.();
    return { status: 'queued', operationId: queuedOperationId, snapshot: snapshot(userA) };
  }

  public async reschedule(_userId: UserId, _command: unknown): Promise<LocalCommandResult> {
    this.rescheduleCalls += 1;
    if (this.throwOnReschedule) throw new Error('Storage failure.');
    this.onReschedule?.();
    return { status: 'queued', operationId: queuedOperationId, snapshot: snapshot(userA) };
  }
}

class FakeProcessor implements TodayOutboxProcessor {
  public stopped = false;
  public recoveredUsers: UserId[] = [];
  public readonly actions: Array<() => boolean | Promise<boolean>> = [];

  public async recover(userId: UserId): Promise<void> {
    this.recoveredUsers.push(userId);
  }

  public async processOne(_userId: UserId): Promise<boolean> {
    return (await this.actions.shift()?.()) ?? false;
  }

  public stop(): void {
    this.stopped = true;
  }
}

function controller(input: {
  readonly cache: MemoryCache;
  readonly engine?: FakeEngine;
  readonly processor?: FakeProcessor;
  readonly online?: boolean;
  readonly remoteSnapshot?: TodaySnapshot;
  readonly remoteReads?: { count: number };
  readonly remoteFailure?: Error;
}): TodaySyncController {
  const remoteReads = input.remoteReads ?? { count: 0 };
  return new TodaySyncController({
    cache: input.cache,
    engine: input.engine ?? new FakeEngine(),
    processor: input.processor ?? new FakeProcessor(),
    reader: {
      getTodaySnapshot: async () => {
        remoteReads.count += 1;
        if (input.remoteFailure) throw input.remoteFailure;
        return input.remoteSnapshot ?? snapshot(userA, serverTaskId);
      },
    },
    isOnline: async () => input.online ?? false,
  });
}

describe('TodaySyncController', () => {
  it('initializes after session restoration and returns the cached Today snapshot first', async () => {
    const cache = new MemoryCache();
    const cached = snapshot(userA);
    cache.snapshots.set(userA, cached);
    const processor = new FakeProcessor();

    const state = await controller({ cache, processor }).restore(userA);

    expect(cache.initializeCalls).toBe(1);
    expect(processor.recoveredUsers).toEqual([userA]);
    expect(state.snapshot).toEqual(cached);
  });

  it('uses the remote snapshot only after cached state has no queued commands', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    const remote = snapshot(userA, serverTaskId);
    const remoteReads = { count: 0 };
    const subject = controller({ cache, online: true, remoteSnapshot: remote, remoteReads });

    await subject.restore(userA);
    const synchronized = await subject.synchronizeWhenOnline(userA);

    expect(remoteReads.count).toBe(1);
    expect(synchronized.snapshot).toEqual(remote);
  });

  it('shows offline-created and dependent-complete tasks as pending without remote processing', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    const engine = new FakeEngine();
    engine.onCreate = () => {
      cache.presentations.set(userA, {
        pendingCount: 1,
        retryableCount: 0,
        pendingTaskIds: [temporaryTaskId],
        issue: null,
        issueDetails: [],
      });
    };
    engine.onComplete = () => {
      const current = cache.snapshots.get(userA);
      if (current === undefined) throw new Error('Expected cached snapshot.');
      cache.snapshots.set(userA, {
        ...current,
        tasks: current.tasks.map((task) => ({
          ...task,
          status: 'completed',
          completedAt: timestamp,
        })),
      });
      cache.presentations.set(userA, {
        pendingCount: 2,
        retryableCount: 0,
        pendingTaskIds: [temporaryTaskId],
        issue: null,
        issueDetails: [],
      });
    };
    const subject = controller({ cache, engine, online: false });

    const created = await subject.createTask(userA, { title: 'Offline task' });
    const completed = await subject.completeTask(userA, { taskId: temporaryTaskId });

    expect(created).toMatchObject({ status: 'queued', state: { pendingCount: 1 } });
    expect(completed).toMatchObject({ status: 'queued', state: { pendingCount: 2 } });
    expect(completed.status === 'queued' && completed.state.pendingTaskIds).toEqual([
      temporaryTaskId,
    ]);
    expect(cache.snapshots.get(userA)?.tasks[0]?.status).toBe('completed');
  });

  it('renders an offline edit from the cache and keeps it pending without a remote request', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    const engine = new FakeEngine();
    engine.onUpdate = () => {
      const current = cache.snapshots.get(userA);
      if (current === undefined) throw new Error('Expected cached snapshot.');
      cache.snapshots.set(userA, {
        ...current,
        tasks: current.tasks.map((task) => ({
          ...task,
          title: 'Edited offline task',
          priority: 'maintenance',
          estimatedMinutes: 35,
          revision: revisionSchema.parse(2),
        })),
      });
      cache.presentations.set(userA, {
        pendingCount: 1,
        retryableCount: 0,
        pendingTaskIds: [temporaryTaskId],
        issue: null,
        issueDetails: [],
      });
    };
    const subject = controller({ cache, engine, online: false });

    const edited = await subject.updateTask(userA, { taskId: temporaryTaskId });

    expect(engine.updateCalls).toBe(1);
    expect(edited).toMatchObject({ status: 'queued', state: { pendingCount: 1 } });
    expect(cache.snapshots.get(userA)?.tasks[0]).toMatchObject({
      title: 'Edited offline task',
      priority: 'maintenance',
      estimatedMinutes: 35,
      revision: 2,
    });
  });

  it('renders an offline reopen from the cache and keeps the command pending', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA, temporaryTaskId, 'completed'));
    const engine = new FakeEngine();
    engine.onReopen = () => {
      const current = cache.snapshots.get(userA);
      if (current === undefined) throw new Error('Expected cached snapshot.');
      cache.snapshots.set(userA, {
        ...current,
        tasks: current.tasks.map((task) => ({
          ...task,
          status: 'planned',
          completedAt: null,
          revision: revisionSchema.parse(2),
        })),
      });
      cache.presentations.set(userA, {
        pendingCount: 1,
        retryableCount: 0,
        pendingTaskIds: [temporaryTaskId],
        issue: null,
        issueDetails: [],
      });
    };
    const subject = controller({ cache, engine, online: false });

    const reopened = await subject.reopenTask(userA, { taskId: temporaryTaskId });

    expect(engine.reopenCalls).toBe(1);
    expect(reopened).toMatchObject({ status: 'queued', state: { pendingCount: 1 } });
    expect(cache.snapshots.get(userA)?.tasks[0]).toMatchObject({
      status: 'planned',
      completedAt: null,
      revision: 2,
    });
  });

  it('renders an offline cancellation from the cache and keeps the command pending', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    const engine = new FakeEngine();
    engine.onCancel = () => {
      const current = cache.snapshots.get(userA);
      if (current === undefined) throw new Error('Expected cached snapshot.');
      cache.snapshots.set(userA, {
        ...current,
        tasks: current.tasks.map((task) => ({
          ...task,
          status: 'cancelled',
          isTopThree: false,
          revision: revisionSchema.parse(2),
        })),
      });
      cache.presentations.set(userA, {
        pendingCount: 1,
        retryableCount: 0,
        pendingTaskIds: [temporaryTaskId],
        issue: null,
        issueDetails: [],
      });
    };
    const subject = controller({ cache, engine, online: false });

    const cancelled = await subject.cancelTask(userA, { taskId: temporaryTaskId });

    expect(engine.cancelCalls).toBe(1);
    expect(cancelled).toMatchObject({ status: 'queued', state: { pendingCount: 1 } });
    expect(cache.snapshots.get(userA)?.tasks[0]).toMatchObject({
      status: 'cancelled',
      isTopThree: false,
      revision: 2,
    });
  });

  it('keeps the online cancellation fallback available only when local persistence fails', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    const engine = new FakeEngine();
    engine.throwOnCancel = true;

    const outcome = await controller({ cache, engine, online: false }).cancelTask(userA, {
      taskId: temporaryTaskId,
    });

    expect(outcome).toMatchObject({
      status: 'unavailable',
      message: 'Local task storage is unavailable.',
    });
    expect(cache.snapshots.get(userA)?.tasks[0]?.status).toBe('planned');
  });

  it('renders an offline reschedule from the cache and keeps the command pending', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    const engine = new FakeEngine();
    engine.onReschedule = () => {
      const current = cache.snapshots.get(userA);
      if (current === undefined) throw new Error('Expected cached snapshot.');
      cache.snapshots.set(userA, {
        ...current,
        tasks: current.tasks.map((task) => ({
          ...task,
          scheduledAt: utcTimestampSchema.parse('2026-07-29T14:30:00.000Z'),
          scheduledTimezone: ianaTimeZoneSchema.parse('America/New_York'),
          revision: revisionSchema.parse(2),
        })),
      });
      cache.presentations.set(userA, {
        pendingCount: 1,
        retryableCount: 0,
        pendingTaskIds: [temporaryTaskId],
        issue: null,
        issueDetails: [],
      });
    };
    const subject = controller({ cache, engine, online: false });

    const rescheduled = await subject.rescheduleTask(userA, { taskId: temporaryTaskId });

    expect(engine.rescheduleCalls).toBe(1);
    expect(rescheduled).toMatchObject({ status: 'queued', state: { pendingCount: 1 } });
    expect(cache.snapshots.get(userA)?.tasks[0]).toMatchObject({
      scheduledAt: '2026-07-29T14:30:00.000Z',
      scheduledTimezone: 'America/New_York',
      revision: 2,
    });
  });

  it('keeps the online reschedule fallback available only when local persistence fails', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    const engine = new FakeEngine();
    engine.throwOnReschedule = true;

    const outcome = await controller({ cache, engine, online: false }).rescheduleTask(userA, {
      taskId: temporaryTaskId,
    });

    expect(outcome).toMatchObject({
      status: 'unavailable',
      message: 'Local task storage is unavailable.',
    });
    expect(cache.snapshots.get(userA)?.tasks[0]?.scheduledAt).toBeNull();
  });

  it('renders an offline reorder from the cache and keeps the command pending', async () => {
    const cache = new MemoryCache();
    const beforeTaskId = taskIdSchema.parse('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const cached = todaySnapshotSchema.parse({
      ...snapshot(userA),
      tasks: [
        {
          ...snapshot(userA).tasks[0],
          id: beforeTaskId,
          title: 'Before',
          position: 1,
        },
        { ...snapshot(userA).tasks[0], id: temporaryTaskId, position: 2 },
      ],
    });
    cache.snapshots.set(userA, cached);
    const engine = new FakeEngine();
    engine.onReorder = () => {
      const current = cache.snapshots.get(userA);
      if (current === undefined) throw new Error('Expected cached snapshot.');
      cache.snapshots.set(userA, {
        ...current,
        tasks: [
          {
            ...current.tasks[1]!,
            position: 0.5,
            revision: revisionSchema.parse(2),
          },
          current.tasks[0]!,
        ],
      });
      cache.presentations.set(userA, {
        pendingCount: 1,
        retryableCount: 0,
        pendingTaskIds: [temporaryTaskId],
        issue: null,
        issueDetails: [],
      });
    };
    const subject = controller({ cache, engine, online: false });

    const reordered = await subject.reorderTask(userA, { taskId: temporaryTaskId, position: 0.5 });

    expect(engine.reorderCalls).toBe(1);
    expect(reordered).toMatchObject({ status: 'queued', state: { pendingCount: 1 } });
    expect(cache.snapshots.get(userA)?.tasks.map((task) => task.id)).toEqual([
      temporaryTaskId,
      beforeTaskId,
    ]);
    expect(cache.snapshots.get(userA)?.tasks[0]).toMatchObject({ position: 0.5, revision: 2 });
  });

  it('keeps the online reorder fallback available only when local persistence fails', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    const engine = new FakeEngine();
    engine.throwOnReorder = true;

    const outcome = await controller({ cache, engine, online: false }).reorderTask(userA, {
      taskId: temporaryTaskId,
      position: 2,
    });

    expect(outcome).toMatchObject({
      status: 'unavailable',
      message: 'Local task storage is unavailable.',
    });
    expect(cache.snapshots.get(userA)?.tasks[0]?.position).toBe(1);
  });

  it('preserves a pending optimistic reorder through an authoritative refresh', async () => {
    const cache = new MemoryCache();
    const cached = snapshot(userA);
    cache.snapshots.set(
      userA,
      todaySnapshotSchema.parse({
        ...cached,
        tasks: cached.tasks.map((task) => ({
          ...task,
          position: 0.5,
          revision: revisionSchema.parse(2),
        })),
      }),
    );
    cache.presentations.set(userA, {
      pendingCount: 1,
      retryableCount: 0,
      pendingTaskIds: [temporaryTaskId],
      issue: null,
      issueDetails: [],
    });

    const state = await controller({
      cache,
      online: true,
      remoteSnapshot: snapshot(userA, temporaryTaskId),
    }).refreshToday(userA);

    expect(state.snapshot?.tasks[0]).toMatchObject({ position: 0.5, revision: 2 });
  });

  it('processes create before completion, then refreshes the cached Today state after acknowledgement', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    cache.presentations.set(userA, {
      pendingCount: 2,
      retryableCount: 0,
      pendingTaskIds: [temporaryTaskId],
      issue: null,
      issueDetails: [],
    });
    const processor = new FakeProcessor();
    const order: string[] = [];
    processor.actions.push(
      () => {
        order.push('create');
        cache.snapshots.set(userA, snapshot(userA, serverTaskId));
        cache.presentations.set(userA, {
          pendingCount: 1,
          retryableCount: 0,
          pendingTaskIds: [serverTaskId],
          issue: null,
          issueDetails: [],
        });
        return true;
      },
      () => {
        order.push('complete');
        cache.snapshots.set(userA, snapshot(userA, serverTaskId, 'completed'));
        cache.presentations.set(userA, emptyPresentation());
        return true;
      },
    );
    const remote = snapshot(userA, serverTaskId, 'completed');
    const subject = controller({ cache, processor, online: true, remoteSnapshot: remote });

    const state = await subject.synchronizeWhenOnline(userA);

    expect(order).toEqual(['create', 'complete']);
    expect(state.pendingCount).toBe(0);
    expect(state.pendingTaskIds).toEqual([]);
    expect(state.snapshot?.tasks[0]).toMatchObject({ id: serverTaskId, status: 'completed' });
  });

  it('keeps retryable operations pending and does not replace their optimistic cache', async () => {
    const cache = new MemoryCache();
    const optimistic = snapshot(userA);
    cache.snapshots.set(userA, optimistic);
    cache.presentations.set(userA, {
      pendingCount: 1,
      retryableCount: 1,
      pendingTaskIds: [temporaryTaskId],
      issue: null,
      issueDetails: [],
    });
    const processor = new FakeProcessor();
    processor.actions.push(() => false);
    const remoteReads = { count: 0 };

    const state = await controller({
      cache,
      processor,
      online: true,
      remoteReads,
    }).synchronizeWhenOnline(userA);

    expect(state.snapshot).toEqual(optimistic);
    expect(state.pendingCount).toBe(1);
    expect(remoteReads.count).toBe(0);
  });

  it('exposes a safe conflict or permanent rejection message without changing cached tasks', async () => {
    const cache = new MemoryCache();
    const cached = snapshot(userA);
    cache.snapshots.set(userA, cached);
    cache.presentations.set(userA, {
      pendingCount: 0,
      retryableCount: 0,
      pendingTaskIds: [],
      issue: { state: 'conflict', safeMessage: 'The task changed before it could sync.' },
      issueDetails: [
        {
          operationType: 'task.complete',
          classification: 'conflict',
          safeErrorCode: 'revision_conflict',
          safeMessage: 'The task changed before it could sync.',
          createdAt: timestamp,
          attemptCount: 1,
          nextRetryAt: null,
          blockedByPrerequisite: false,
        },
      ],
    });

    const state = await controller({
      cache,
      online: true,
      remoteSnapshot: snapshot(userA, serverTaskId),
    }).refreshToday(userA);

    expect(state.snapshot).toEqual(cached);
    expect(state.issue).toEqual({
      state: 'conflict',
      safeMessage: 'The task changed before it could sync.',
    });
  });

  it('stops processing and clears one signed-in account without exposing it to another', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    cache.snapshots.set(userB, snapshot(userB, serverTaskId));
    const processor = new FakeProcessor();
    const subject = controller({ cache, processor });

    await subject.stopAndClear(userA);
    const nextAccount = await subject.restore(userB);

    expect(processor.stopped).toBe(true);
    expect(cache.clearedUsers).toEqual([userA]);
    expect(nextAccount.snapshot?.profile.id).toBe(userB);
    expect(cache.snapshots.has(userA)).toBe(false);
  });

  it('signals online fallback only when local command storage failed before queueing', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    const engine = new FakeEngine();
    engine.throwOnCreate = true;

    const result = await controller({ cache, engine }).createTask(userA, {
      title: 'Fallback task',
    });

    expect(result).toEqual({
      status: 'unavailable',
      message: 'Local task storage is unavailable.',
    });
  });

  it('signals the same online fallback when local edit persistence fails before queueing', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    const engine = new FakeEngine();
    engine.throwOnUpdate = true;

    const result = await controller({ cache, engine }).updateTask(userA, {
      title: 'Fallback edit',
    });

    expect(result).toEqual({
      status: 'unavailable',
      message: 'Local task storage is unavailable.',
    });
  });

  it('signals the same online fallback when local reopen persistence fails before queueing', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA, temporaryTaskId, 'completed'));
    const engine = new FakeEngine();
    engine.throwOnReopen = true;

    const result = await controller({ cache, engine }).reopenTask(userA, {
      taskId: temporaryTaskId,
    });

    expect(result).toEqual({
      status: 'unavailable',
      message: 'Local task storage is unavailable.',
    });
  });

  it('recovers stranded processing work once when foreground reconciliation repeats', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    const processor = new FakeProcessor();
    let release!: () => void;
    let started!: () => void;
    const processingStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    processor.actions.push(
      () =>
        new Promise<boolean>((resolve) => {
          started();
          release = () => resolve(false);
        }),
    );
    const subject = controller({ cache, processor, online: true });

    const first = subject.reconcileAfterForeground(userA);
    const second = subject.reconcileAfterForeground(userA);
    await processingStarted;
    release();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    expect(processor.recoveredUsers).toEqual([userA]);
  });

  it('preserves queued work without remote processing while foregrounded offline', async () => {
    const cache = new MemoryCache();
    const optimistic = snapshot(userA);
    cache.snapshots.set(userA, optimistic);
    cache.presentations.set(userA, {
      pendingCount: 1,
      retryableCount: 0,
      pendingTaskIds: [temporaryTaskId],
      issue: null,
      issueDetails: [],
    });
    const processor = new FakeProcessor();
    const remoteReads = { count: 0 };

    const state = await controller({
      cache,
      processor,
      online: false,
      remoteReads,
    }).reconcileAfterForeground(userA);

    expect(state.snapshot).toEqual(optimistic);
    expect(processor.recoveredUsers).toEqual([]);
    expect(remoteReads.count).toBe(0);
  });

  it('manually retries only retryable operations without changing the operation identity', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    cache.presentations.set(userA, {
      pendingCount: 1,
      retryableCount: 1,
      pendingTaskIds: [temporaryTaskId],
      issue: null,
      issueDetails: [],
    });
    const processor = new FakeProcessor();
    processor.actions.push(() => false);
    const subject = controller({ cache, processor, online: true });

    await subject.retryPending(userA);

    expect(cache.retriedUsers).toEqual([userA]);
    expect(cache.presentations.get(userA)?.pendingTaskIds).toEqual([temporaryTaskId]);
  });

  it('does not retry conflicts or permanently rejected operations', async () => {
    const cache = new MemoryCache();
    const cached = snapshot(userA);
    cache.snapshots.set(userA, cached);
    cache.presentations.set(userA, {
      ...emptyPresentation(),
      issue: { state: 'conflict', safeMessage: 'A newer task revision exists.' },
      issueDetails: [
        {
          operationType: 'task.complete',
          classification: 'conflict',
          safeErrorCode: 'revision_conflict',
          safeMessage: 'A newer task revision exists.',
          createdAt: timestamp,
          attemptCount: 1,
          nextRetryAt: null,
          blockedByPrerequisite: false,
        },
      ],
    });
    const processor = new FakeProcessor();

    const state = await controller({ cache, processor, online: true }).retryPending(userA);

    expect(cache.retriedUsers).toEqual([]);
    expect(processor.recoveredUsers).toEqual([]);
    expect(state.snapshot).toEqual(cached);
    expect(state.issue?.state).toBe('conflict');
  });

  it('manually refreshes through a conservative merge without erasing a pending optimistic task', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    cache.presentations.set(userA, {
      pendingCount: 1,
      retryableCount: 0,
      pendingTaskIds: [temporaryTaskId],
      issue: null,
      issueDetails: [],
    });
    const remote = todaySnapshotSchema.parse({ ...snapshot(userA, serverTaskId), tasks: [] });

    const state = await controller({ cache, online: true, remoteSnapshot: remote }).refreshToday(
      userA,
    );

    expect(state.snapshot?.tasks.map((task) => task.id)).toEqual([temporaryTaskId]);
    expect(cache.mergedSnapshots).toEqual([remote]);
  });

  it('keeps the cached snapshot when manual refresh fails', async () => {
    const cache = new MemoryCache();
    const cached = snapshot(userA);
    cache.snapshots.set(userA, cached);

    const state = await controller({
      cache,
      online: true,
      remoteFailure: new Error('Network unavailable.'),
    }).refreshToday(userA);

    expect(state.snapshot).toEqual(cached);
    expect(state.transientMessage).toBe('Today will refresh when the connection is available.');
  });

  it('exposes safe issue detail fields without command payloads or operation identifiers', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    cache.presentations.set(userA, {
      ...emptyPresentation(),
      issue: { state: 'permanently_rejected', safeMessage: 'Invalid task state.' },
      issueDetails: [
        {
          operationType: 'task.complete',
          classification: 'permanently_rejected',
          safeErrorCode: 'invalid_state',
          safeMessage: 'Invalid task state.',
          createdAt: timestamp,
          attemptCount: 2,
          nextRetryAt: null,
          blockedByPrerequisite: true,
        },
      ],
    });

    const state = await controller({ cache }).restore(userA);
    const detail = state.issueDetails[0];

    expect(detail).toEqual({
      operationType: 'task.complete',
      classification: 'permanently_rejected',
      safeErrorCode: 'invalid_state',
      safeMessage: 'Invalid task state.',
      createdAt: timestamp,
      attemptCount: 2,
      nextRetryAt: null,
      blockedByPrerequisite: true,
    });
    expect(detail).not.toHaveProperty('operationId');
    expect(detail).not.toHaveProperty('payload');
  });

  it('keeps retryable issue metadata separate from conflicts and permanent rejections', async () => {
    const cache = new MemoryCache();
    cache.snapshots.set(userA, snapshot(userA));
    cache.presentations.set(userA, {
      ...emptyPresentation(),
      retryableCount: 1,
      issueDetails: [
        {
          operationType: 'task.create',
          classification: 'retryable',
          safeErrorCode: 'temporary_connection_problem',
          safeMessage: 'Temporary connection problem.',
          createdAt: timestamp,
          attemptCount: 1,
          nextRetryAt: '2026-07-28T08:00:02.000Z',
          blockedByPrerequisite: false,
        },
      ],
    });

    const state = await controller({ cache }).restore(userA);

    expect(state.issue).toBeNull();
    expect(state.issueDetails[0]).toMatchObject({
      classification: 'retryable',
      safeErrorCode: 'temporary_connection_problem',
      nextRetryAt: '2026-07-28T08:00:02.000Z',
    });
  });
});
