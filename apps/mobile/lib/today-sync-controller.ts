import type { TodaySnapshot } from '@personal-os/database-contracts';
import type { UserId } from '@personal-os/domain';

import type { LocalCommandResult } from './local-command-engine';

export interface TodayOutboxPresentation {
  readonly pendingCount: number;
  readonly retryableCount: number;
  readonly pendingTaskIds: readonly string[];
  readonly issue: {
    readonly state: 'conflict' | 'permanently_rejected';
    readonly safeMessage: string;
  } | null;
  readonly issueDetails: readonly {
    readonly operationType: string;
    readonly classification: 'retryable' | 'conflict' | 'permanently_rejected';
    readonly safeErrorCode: string;
    readonly safeMessage: string;
    readonly createdAt: string;
    readonly attemptCount: number;
    readonly nextRetryAt: string | null;
    readonly blockedByPrerequisite: boolean;
  }[];
}

export interface TodayCacheRepository {
  initialize(): Promise<void>;
  readSnapshot(userId: UserId): Promise<TodaySnapshot | null>;
  replaceSnapshot(userId: UserId, snapshot: TodaySnapshot): Promise<void>;
  mergeAuthoritativeSnapshot(userId: UserId, snapshot: TodaySnapshot): Promise<void>;
  readPresentation(userId: UserId): Promise<TodayOutboxPresentation>;
  makeRetryableOperationsDue(userId: UserId): Promise<void>;
  clearUserData(userId: UserId): Promise<void>;
}

export interface TodaySnapshotReader {
  getTodaySnapshot(): Promise<TodaySnapshot>;
}

export interface TodayCommandEngine {
  createTask(userId: UserId, command: unknown): Promise<LocalCommandResult>;
  updateTask(userId: UserId, command: unknown): Promise<LocalCommandResult>;
  reorder(userId: UserId, command: unknown): Promise<LocalCommandResult>;
  complete(userId: UserId, command: unknown): Promise<LocalCommandResult>;
  reopen(userId: UserId, command: unknown): Promise<LocalCommandResult>;
  cancel(userId: UserId, command: unknown): Promise<LocalCommandResult>;
  reschedule(userId: UserId, command: unknown): Promise<LocalCommandResult>;
}

export interface TodayOutboxProcessor {
  recover(userId: UserId): Promise<void>;
  processOne(userId: UserId): Promise<boolean>;
  stop(): void;
}

export interface MobileTodayState extends TodayOutboxPresentation {
  readonly snapshot: TodaySnapshot | null;
  readonly transientMessage: string | null;
}

export type LocalTodayCommandOutcome =
  | { readonly status: 'queued'; readonly state: MobileTodayState }
  | { readonly status: 'rejected'; readonly message: string; readonly state: MobileTodayState }
  | { readonly status: 'unavailable'; readonly message: string };

export interface TodaySyncControllerDependencies {
  readonly cache: TodayCacheRepository;
  readonly engine: TodayCommandEngine;
  readonly processor: TodayOutboxProcessor;
  readonly reader: TodaySnapshotReader;
  readonly isOnline: () => Promise<boolean>;
  readonly maxOperationsPerDrain?: number;
}

/**
 * Coordinates the narrow mobile Today offline slice without exposing SQLite to
 * React components. It only queues task creation, editing, ordering, completion,
 * reopening, cancellation, and rescheduling; Life Day commands remain on the online RPC path.
 */
export class TodaySyncController {
  private readonly maxOperationsPerDrain: number;
  private reconciliation: Promise<MobileTodayState> | null = null;
  private reconciliationUserId: UserId | null = null;
  private stopped = false;

  public constructor(private readonly dependencies: TodaySyncControllerDependencies) {
    this.maxOperationsPerDrain = dependencies.maxOperationsPerDrain ?? 10;
  }

  /** Initializes local storage and returns cached content before any remote work. */
  public async restore(userId: UserId): Promise<MobileTodayState> {
    await this.dependencies.cache.initialize();
    await this.dependencies.processor.recover(userId);
    return this.readState(userId);
  }

  /** Drains queued commands when connected, then refreshes only an empty queue. */
  public async synchronizeWhenOnline(userId: UserId): Promise<MobileTodayState> {
    return this.reconcile(userId, { recoverProcessing: false, retryNow: false });
  }

  /** Recovers a session after the app returns to the foreground. */
  public async reconcileAfterForeground(userId: UserId): Promise<MobileTodayState> {
    return this.reconcile(userId, { recoverProcessing: true, retryNow: false });
  }

  /** Retries only retry-scheduled operations for the authenticated user. */
  public async retryPending(userId: UserId): Promise<MobileTodayState> {
    return this.reconcile(userId, { recoverProcessing: false, retryNow: true });
  }

  /** Fetches and conservatively merges an authoritative Today snapshot. */
  public async refreshToday(userId: UserId): Promise<MobileTodayState> {
    return this.runExclusive(userId, async () => {
      if (!(await this.dependencies.isOnline())) {
        return {
          ...(await this.readState(userId)),
          transientMessage: 'Today will refresh when the connection is available.',
        };
      }
      return this.refreshAuthoritativeSnapshot(userId);
    });
  }

  public stop(): void {
    this.stopped = true;
    this.dependencies.processor.stop();
  }

  public async stopAndClear(userId: UserId): Promise<void> {
    this.stop();
    await this.dependencies.cache.clearUserData(userId);
  }

  private async reconcile(
    userId: UserId,
    options: { readonly recoverProcessing: boolean; readonly retryNow: boolean },
  ): Promise<MobileTodayState> {
    return this.runExclusive(userId, async () => {
      if (this.stopped || !(await this.dependencies.isOnline())) return this.readState(userId);
      if (options.retryNow) {
        const state = await this.readState(userId);
        if (state.retryableCount === 0) return state;
      }
      if (options.recoverProcessing) await this.dependencies.processor.recover(userId);
      if (options.retryNow) await this.dependencies.cache.makeRetryableOperationsDue(userId);

      for (let count = 0; count < this.maxOperationsPerDrain; count += 1) {
        if (!(await this.dependencies.processor.processOne(userId))) break;
      }

      const state = await this.readState(userId);
      if (state.pendingCount > 0) return state;
      return this.refreshAuthoritativeSnapshot(userId);
    });
  }

  public async createTask(userId: UserId, command: unknown): Promise<LocalTodayCommandOutcome> {
    return this.queue(userId, () => this.dependencies.engine.createTask(userId, command));
  }

  public async updateTask(userId: UserId, command: unknown): Promise<LocalTodayCommandOutcome> {
    return this.queue(userId, () => this.dependencies.engine.updateTask(userId, command));
  }

  public async reorderTask(userId: UserId, command: unknown): Promise<LocalTodayCommandOutcome> {
    return this.queue(userId, () => this.dependencies.engine.reorder(userId, command));
  }

  public async completeTask(userId: UserId, command: unknown): Promise<LocalTodayCommandOutcome> {
    return this.queue(userId, () => this.dependencies.engine.complete(userId, command));
  }

  public async reopenTask(userId: UserId, command: unknown): Promise<LocalTodayCommandOutcome> {
    return this.queue(userId, () => this.dependencies.engine.reopen(userId, command));
  }

  public async cancelTask(userId: UserId, command: unknown): Promise<LocalTodayCommandOutcome> {
    return this.queue(userId, () => this.dependencies.engine.cancel(userId, command));
  }

  public async rescheduleTask(userId: UserId, command: unknown): Promise<LocalTodayCommandOutcome> {
    return this.queue(userId, () => this.dependencies.engine.reschedule(userId, command));
  }

  private async refreshAuthoritativeSnapshot(userId: UserId): Promise<MobileTodayState> {
    const state = await this.readState(userId);
    try {
      const remoteSnapshot = await this.dependencies.reader.getTodaySnapshot();
      await this.dependencies.cache.mergeAuthoritativeSnapshot(userId, remoteSnapshot);
      return this.readState(userId);
    } catch {
      return {
        ...state,
        transientMessage: 'Today will refresh when the connection is available.',
      };
    }
  }

  private runExclusive(
    userId: UserId,
    work: () => Promise<MobileTodayState>,
  ): Promise<MobileTodayState> {
    if (this.reconciliation !== null) {
      return this.reconciliationUserId === userId ? this.reconciliation : this.readState(userId);
    }
    const reconciliation = work().finally(() => {
      if (this.reconciliation === reconciliation) {
        this.reconciliation = null;
        this.reconciliationUserId = null;
      }
    });
    this.reconciliation = reconciliation;
    this.reconciliationUserId = userId;
    return reconciliation;
  }

  private async queue(
    userId: UserId,
    queueCommand: () => Promise<LocalCommandResult>,
  ): Promise<LocalTodayCommandOutcome> {
    let result: LocalCommandResult;
    try {
      result = await queueCommand();
    } catch {
      // The command engine only throws for repository failures, which roll
      // back before this point. The UI may safely use its existing online path.
      return { status: 'unavailable', message: 'Local task storage is unavailable.' };
    }
    if (result.status === 'rejected') {
      return {
        status: 'rejected',
        message: result.error.message,
        state: await this.readState(userId),
      };
    }

    return { status: 'queued', state: await this.synchronizeWhenOnline(userId) };
  }

  private async readState(userId: UserId): Promise<MobileTodayState> {
    const [snapshot, presentation] = await Promise.all([
      this.dependencies.cache.readSnapshot(userId),
      this.dependencies.cache.readPresentation(userId),
    ]);
    return { ...presentation, snapshot, transientMessage: null };
  }
}
