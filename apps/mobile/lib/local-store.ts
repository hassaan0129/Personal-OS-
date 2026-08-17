import type { TodaySnapshot } from '@personal-os/database-contracts';
import type { OperationId, UserId } from '@personal-os/domain';
import {
  operationIdSchema,
  revisionSchema,
  taskIdSchema,
  todaySnapshotSchema,
  userIdSchema,
} from '@personal-os/validation';
import * as SQLite from 'expo-sqlite';

import type { LocalCommandRepository } from './local-command-engine';
import {
  LocalAcknowledgementConflictError,
  type OutboxRepository,
  type OutboxState,
  type StoredOutboxOperation,
} from './outbox-contracts';
import { rewriteQueuedTaskCommand } from './outbox-command-rewrite';
import { orderTasksByPosition } from './task-order';

const databaseName = 'personal-os-mobile.db';
const schemaVersion = 3;

export type { OutboxRepository, OutboxState, StoredOutboxOperation } from './outbox-contracts';

export interface LocalOutboxIssueDetails {
  readonly operationType: string;
  readonly classification: 'retryable' | 'conflict' | 'permanently_rejected';
  readonly safeErrorCode: string;
  readonly safeMessage: string;
  readonly createdAt: string;
  readonly attemptCount: number;
  readonly nextRetryAt: string | null;
  readonly blockedByPrerequisite: boolean;
}

export interface LocalOutboxPresentation {
  readonly pendingCount: number;
  readonly retryableCount: number;
  readonly pendingTaskIds: readonly string[];
  readonly issue: {
    readonly state: 'conflict' | 'permanently_rejected';
    readonly safeMessage: string;
  } | null;
  readonly issueDetails: readonly LocalOutboxIssueDetails[];
}

interface SnapshotRow {
  readonly snapshot_json: string;
}

interface OutboxRow {
  readonly operation_id: string;
  readonly user_id: string;
  readonly command_type: string;
  readonly command_json: string;
  readonly created_at: string;
  readonly expected_revision: number | null;
  readonly attempt_count: number;
  readonly next_retry_at: string | null;
  readonly state: OutboxState;
  readonly last_safe_error: string | null;
  readonly last_safe_error_code: string | null;
  readonly local_sequence: number;
  readonly target_entity_id: string | null;
  readonly depends_on_operation_id: string | null;
}

let database: SQLite.SQLiteDatabase | null = null;

type SqlConnection = Pick<SQLite.SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;

interface TemporaryTaskMappingRow {
  readonly temporary_task_id: string;
  readonly server_task_id: string | null;
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database !== null) return database;
  database = await SQLite.openDatabaseAsync(databaseName);
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return database;
}

export async function initializeLocalStore(): Promise<void> {
  const db = await openDatabase();
  const version =
    (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  if (version >= schemaVersion) return;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const current =
      (await transaction.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))
        ?.user_version ?? 0;
    if (current < 1) {
      await transaction.execAsync(`
      CREATE TABLE IF NOT EXISTS local_today_snapshots (
        user_id TEXT PRIMARY KEY NOT NULL,
        snapshot_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outbox_operations (
        operation_id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        command_type TEXT NOT NULL,
        command_json TEXT NOT NULL,
        expected_revision INTEGER,
        created_at TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at TEXT,
        state TEXT NOT NULL,
        last_safe_error TEXT,
        CHECK (state IN ('pending', 'processing', 'retry_scheduled', 'acknowledged', 'conflict', 'permanently_rejected'))
      );
      CREATE INDEX IF NOT EXISTS outbox_operations_user_state_created_idx
        ON outbox_operations(user_id, state, created_at);
      CREATE INDEX IF NOT EXISTS outbox_operations_due_idx
        ON outbox_operations(user_id, next_retry_at, created_at);
      CREATE TABLE IF NOT EXISTS sync_state (
        user_id TEXT PRIMARY KEY NOT NULL,
        last_successful_sync_at TEXT,
        last_sync_error TEXT,
        cursor INTEGER
      );
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        operation_id TEXT PRIMARY KEY NOT NULL REFERENCES outbox_operations(operation_id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        conflict_code TEXT NOT NULL,
        safe_message TEXT NOT NULL,
        server_snapshot_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sync_conflicts_user_created_idx ON sync_conflicts(user_id, created_at DESC);
        PRAGMA user_version = 1;
      `);
    }
    if (current < 2) {
      await transaction.execAsync(`
        ALTER TABLE outbox_operations ADD COLUMN local_sequence INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE outbox_operations ADD COLUMN target_entity_id TEXT;
        ALTER TABLE outbox_operations ADD COLUMN depends_on_operation_id TEXT;
        CREATE INDEX IF NOT EXISTS outbox_operations_user_sequence_idx
          ON outbox_operations(user_id, local_sequence);
        CREATE INDEX IF NOT EXISTS outbox_operations_dependency_idx
          ON outbox_operations(user_id, depends_on_operation_id);
        CREATE TABLE IF NOT EXISTS temporary_task_mappings (
          user_id TEXT NOT NULL,
          temporary_task_id TEXT NOT NULL,
          server_task_id TEXT,
          create_operation_id TEXT NOT NULL REFERENCES outbox_operations(operation_id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id, temporary_task_id)
        );
        CREATE INDEX IF NOT EXISTS temporary_task_mappings_operation_idx
          ON temporary_task_mappings(user_id, create_operation_id);
        PRAGMA user_version = 2;
      `);
    }
    if (current < 3) {
      await transaction.execAsync(`
        ALTER TABLE outbox_operations ADD COLUMN last_safe_error_code TEXT;
        PRAGMA user_version = 3;
      `);
    }
  });
}

export async function readCachedSnapshot(userId: UserId): Promise<TodaySnapshot | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<SnapshotRow>(
    'SELECT snapshot_json FROM local_today_snapshots WHERE user_id = ?',
    userId,
  );
  if (row === null) return null;
  const parsed = todaySnapshotSchema.safeParse(JSON.parse(row.snapshot_json) as unknown);
  return parsed.success ? parsed.data : null;
}

export async function replaceCachedSnapshot(
  userId: UserId,
  snapshot: TodaySnapshot,
): Promise<void> {
  const db = await openDatabase();
  const validated = todaySnapshotSchema.parse(snapshot);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO local_today_snapshots(user_id, snapshot_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at`,
      userId,
      JSON.stringify(validated),
      new Date().toISOString(),
    );
  });
}

/**
 * Merges an authoritative Today read without discarding local task intent that
 * is still represented by a pending, retrying, or blocked outbox operation. This is a
 * conservative temporary projection merge, not general conflict resolution.
 */
export async function mergeAuthoritativeTodaySnapshot(
  userId: UserId,
  snapshot: TodaySnapshot,
): Promise<void> {
  const db = await openDatabase();
  const authoritative = todaySnapshotSchema.parse(snapshot);
  if (authoritative.profile.id !== userId) {
    throw new Error('The authoritative Today snapshot does not belong to the signed-in user.');
  }
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const cachedRow = await transaction.getFirstAsync<SnapshotRow>(
      'SELECT snapshot_json FROM local_today_snapshots WHERE user_id = ?',
      userId,
    );
    if (cachedRow === null) {
      await writeSnapshot(transaction, userId, authoritative);
      return;
    }
    const cached = todaySnapshotSchema.safeParse(JSON.parse(cachedRow.snapshot_json) as unknown);
    if (!cached.success || cached.data.profile.id !== userId) {
      await writeSnapshot(transaction, userId, authoritative);
      return;
    }
    const pendingRows = await transaction.getAllAsync<{ target_entity_id: string }>(
      `SELECT DISTINCT target_entity_id FROM outbox_operations
       WHERE user_id = ? AND command_type LIKE 'task.%'
         AND target_entity_id IS NOT NULL
         AND state IN ('pending', 'processing', 'retry_scheduled', 'conflict', 'permanently_rejected')`,
      userId,
    );
    const pendingTaskIds = new Set(pendingRows.map((row) => row.target_entity_id));
    if (pendingTaskIds.size === 0) {
      await writeSnapshot(transaction, userId, authoritative);
      return;
    }
    const cachedPendingTasks = cached.data.tasks.filter((task) => pendingTaskIds.has(task.id));
    const cachedById = new Map(cachedPendingTasks.map((task) => [task.id, task]));
    const remoteTaskIds = new Set(authoritative.tasks.map((task) => task.id));
    const merged: TodaySnapshot = {
      ...authoritative,
      tasks: orderTasksByPosition([
        ...authoritative.tasks.map((task) => cachedById.get(task.id) ?? task),
        ...cachedPendingTasks.filter((task) => !remoteTaskIds.has(task.id)),
      ]),
    };
    await writeSnapshot(transaction, userId, todaySnapshotSchema.parse(merged));
  });
}

async function writeSnapshot(
  connection: SqlConnection,
  userId: UserId,
  snapshot: TodaySnapshot,
): Promise<void> {
  await connection.runAsync(
    `INSERT INTO local_today_snapshots(user_id, snapshot_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at`,
    userId,
    JSON.stringify(snapshot),
    new Date().toISOString(),
  );
}

export async function enqueueOperation(operation: StoredOutboxOperation): Promise<void> {
  const db = await openDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO outbox_operations(operation_id, user_id, command_type, command_json, expected_revision, created_at, attempt_count, next_retry_at, state, last_safe_error, local_sequence, target_entity_id, depends_on_operation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(operation_id) DO NOTHING`,
      operation.operationId,
      operation.userId,
      operation.commandType,
      operation.commandJson,
      operation.expectedRevision,
      operation.createdAt,
      operation.attemptCount,
      operation.nextRetryAt,
      operation.state,
      operation.lastSafeError,
      operation.localSequence,
      operation.targetId,
      operation.dependsOnOperationId,
    );
  });
}

export async function getNextDueOperation(
  userId: UserId,
  now: string,
): Promise<StoredOutboxOperation | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<OutboxRow>(
    `SELECT * FROM outbox_operations
     WHERE user_id = ? AND state IN ('pending', 'retry_scheduled')
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       AND (
         depends_on_operation_id IS NULL
         OR EXISTS (
           SELECT 1 FROM outbox_operations AS prerequisite
           WHERE prerequisite.operation_id = outbox_operations.depends_on_operation_id
             AND prerequisite.user_id = outbox_operations.user_id
             AND prerequisite.state = 'acknowledged'
         )
       )
     ORDER BY local_sequence ASC, created_at ASC LIMIT 1`,
    userId,
    now,
  );
  return row === null ? null : mapOperation(row);
}

/**
 * Claims one eligible operation inside an exclusive transaction. Claiming and
 * moving to processing are inseparable so two workers cannot submit the same
 * operation.
 */
export async function claimNextEligibleOperation(
  userId: UserId,
  now: string,
): Promise<StoredOutboxOperation | null> {
  const db = await openDatabase();
  let claimed: StoredOutboxOperation | null = null;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<OutboxRow>(
      `SELECT * FROM outbox_operations
       WHERE user_id = ? AND state IN ('pending', 'retry_scheduled')
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
         AND (
           depends_on_operation_id IS NULL
           OR EXISTS (
             SELECT 1 FROM outbox_operations AS prerequisite
             WHERE prerequisite.operation_id = outbox_operations.depends_on_operation_id
               AND prerequisite.user_id = outbox_operations.user_id
               AND prerequisite.state = 'acknowledged'
           )
         )
       ORDER BY local_sequence ASC, created_at ASC LIMIT 1`,
      userId,
      now,
    );
    if (row === null) return;

    const update = await transaction.runAsync(
      `UPDATE outbox_operations
       SET state = 'processing', attempt_count = attempt_count + 1, next_retry_at = NULL, last_safe_error = NULL, last_safe_error_code = NULL
       WHERE operation_id = ? AND user_id = ? AND state IN ('pending', 'retry_scheduled')`,
      row.operation_id,
      userId,
    );
    if (update.changes !== 1) {
      throw new Error('The local outbox operation could not be claimed.');
    }
    claimed = mapOperation({
      ...row,
      attempt_count: row.attempt_count + 1,
      last_safe_error: null,
      last_safe_error_code: null,
      next_retry_at: null,
      state: 'processing',
    });
  });
  return claimed;
}

export async function updateOperation(
  input: Parameters<OutboxRepository['updateOperation']>[0],
): Promise<void> {
  const db = await openDatabase();
  const result = await db.runAsync(
    `UPDATE outbox_operations
     SET state = ?, attempt_count = ?, next_retry_at = ?, last_safe_error = ?, last_safe_error_code = ?
     WHERE operation_id = ? AND user_id = ?`,
    input.state,
    input.attemptCount,
    input.nextRetryAt,
    input.safeError,
    input.safeErrorCode,
    input.operationId,
    input.userId,
  );
  if (result.changes !== 1) {
    throw new Error('The local outbox operation is not available for this user.');
  }
}

/**
 * Commits the local side of a server acknowledgement. A failed transaction is
 * intentionally retryable: the same operation ID will receive
 * `duplicate_accepted` from the command RPC and can reconcile again.
 */
export async function acknowledgeAcceptedOperation(
  input: Parameters<OutboxRepository['acknowledgeAcceptedOperation']>[0],
): Promise<void> {
  const db = await openDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    if (input.operation.userId !== input.userId) {
      throw new LocalAcknowledgementConflictError(
        'The local acknowledgement user does not match the operation.',
      );
    }
    const stored = await transaction.getFirstAsync<OutboxRow>(
      'SELECT * FROM outbox_operations WHERE operation_id = ? AND user_id = ?',
      input.operation.operationId,
      input.userId,
    );
    if (stored === null) {
      throw new Error('The local outbox operation is not available for this user.');
    }
    if (stored.command_type !== input.operation.commandType) {
      throw new LocalAcknowledgementConflictError(
        'The local acknowledgement command does not match.',
      );
    }

    if (input.result.operationId !== input.operation.operationId) {
      throw new LocalAcknowledgementConflictError(
        'The server acknowledgement operation does not match.',
      );
    }

    if (input.operation.commandType === 'task.create') {
      await reconcileCreatedTask(transaction, input);
    }

    const operationUpdate = await transaction.runAsync(
      `UPDATE outbox_operations
       SET state = 'acknowledged', attempt_count = ?, next_retry_at = NULL, last_safe_error = NULL, last_safe_error_code = NULL
       WHERE operation_id = ? AND user_id = ?`,
      input.operation.attemptCount,
      input.operation.operationId,
      input.userId,
    );
    if (operationUpdate.changes !== 1) {
      throw new Error('The local outbox operation could not be acknowledged.');
    }

    if (input.result.syncCursor !== null) {
      await transaction.runAsync(
        `INSERT INTO sync_state(user_id, cursor) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET cursor = excluded.cursor`,
        input.userId,
        input.result.syncCursor,
      );
    }
  });
}

async function reconcileCreatedTask(
  transaction: SqlConnection,
  input: Parameters<OutboxRepository['acknowledgeAcceptedOperation']>[0],
): Promise<void> {
  if (input.result.entity.type !== 'task') {
    throw new LocalAcknowledgementConflictError(
      'The create acknowledgement does not describe a task.',
    );
  }

  const mapping = await transaction.getFirstAsync<TemporaryTaskMappingRow>(
    `SELECT temporary_task_id, server_task_id FROM temporary_task_mappings
     WHERE user_id = ? AND create_operation_id = ?`,
    input.userId,
    input.operation.operationId,
  );
  if (mapping === null) {
    throw new LocalAcknowledgementConflictError(
      'The local temporary task mapping is not available.',
    );
  }

  const temporaryTaskId = taskIdSchema.parse(mapping.temporary_task_id);
  const serverTaskId = taskIdSchema.parse(input.result.entity.id);
  if (mapping.server_task_id !== null && mapping.server_task_id !== serverTaskId) {
    throw new LocalAcknowledgementConflictError(
      'The local temporary task mapping conflicts with the server.',
    );
  }

  const snapshotRow = await transaction.getFirstAsync<SnapshotRow>(
    'SELECT snapshot_json FROM local_today_snapshots WHERE user_id = ?',
    input.userId,
  );
  if (snapshotRow === null) {
    throw new Error('The local Today snapshot is not available for acknowledgement.');
  }
  const parsedSnapshot = todaySnapshotSchema.safeParse(
    JSON.parse(snapshotRow.snapshot_json) as unknown,
  );
  if (!parsedSnapshot.success) {
    throw new Error('The local Today snapshot is invalid.');
  }

  const temporaryTaskExists = parsedSnapshot.data.tasks.some((task) => task.id === temporaryTaskId);
  const serverTaskExists = parsedSnapshot.data.tasks.some((task) => task.id === serverTaskId);
  if (!temporaryTaskExists && !serverTaskExists) {
    throw new LocalAcknowledgementConflictError('The local temporary task is not available.');
  }
  if (temporaryTaskExists && serverTaskExists) {
    throw new LocalAcknowledgementConflictError('The local task mapping would duplicate a task.');
  }

  const reconciledSnapshot: TodaySnapshot = {
    ...parsedSnapshot.data,
    tasks: parsedSnapshot.data.tasks.map((task) =>
      task.id === temporaryTaskId
        ? {
            ...task,
            id: serverTaskId,
            // Keep the locally predicted revision when a create already has
            // dependent offline edits. Those commands retain their original
            // expected revisions and must not be silently rebased.
            revision: revisionSchema.parse(Math.max(task.revision, input.result.entity.revision)),
          }
        : task,
    ),
  };

  if (mapping.server_task_id === null) {
    const mappingUpdate = await transaction.runAsync(
      `UPDATE temporary_task_mappings SET server_task_id = ?
       WHERE user_id = ? AND temporary_task_id = ? AND server_task_id IS NULL`,
      serverTaskId,
      input.userId,
      temporaryTaskId,
    );
    if (mappingUpdate.changes !== 1) {
      throw new Error('The local temporary task mapping could not be acknowledged.');
    }
  }

  await transaction.runAsync(
    `INSERT INTO local_today_snapshots(user_id, snapshot_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at`,
    input.userId,
    JSON.stringify(todaySnapshotSchema.parse(reconciledSnapshot)),
    new Date().toISOString(),
  );

  const dependents = await transaction.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox_operations
     WHERE user_id = ? AND target_entity_id = ? AND operation_id <> ?
       AND state IN ('pending', 'retry_scheduled')
     ORDER BY local_sequence ASC, created_at ASC`,
    input.userId,
    temporaryTaskId,
    input.operation.operationId,
  );
  for (const dependent of dependents) {
    const rewrittenCommand = rewriteQueuedTaskCommand(
      dependent.command_type,
      dependent.command_json,
      temporaryTaskId,
      serverTaskId,
    );
    const dependentUpdate = await transaction.runAsync(
      `UPDATE outbox_operations
       SET command_json = ?, target_entity_id = ?
       WHERE operation_id = ? AND user_id = ? AND target_entity_id = ?`,
      rewrittenCommand,
      serverTaskId,
      dependent.operation_id,
      input.userId,
      temporaryTaskId,
    );
    if (dependentUpdate.changes !== 1) {
      throw new Error('A dependent local command could not be reconciled.');
    }
  }
}

export async function recoverProcessingOperations(userId: UserId): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    `UPDATE outbox_operations SET state = 'pending', next_retry_at = NULL
     WHERE user_id = ? AND state = 'processing'`,
    userId,
  );
}

export async function countPendingOperations(userId: UserId): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) AS count FROM outbox_operations
     WHERE user_id = ? AND state IN ('pending', 'processing', 'retry_scheduled')`,
    userId,
  );
  return row?.count ?? 0;
}

/** Makes only retryable user-scoped operations eligible for a manual retry. */
export async function makeRetryableOperationsDue(userId: UserId): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    `UPDATE outbox_operations SET next_retry_at = NULL
     WHERE user_id = ? AND state = 'retry_scheduled'`,
    userId,
  );
}

/** Returns the user-scoped pending and safe issue state needed by the mobile Today UI. */
export async function readLocalOutboxPresentation(
  userId: UserId,
): Promise<LocalOutboxPresentation> {
  const db = await openDatabase();
  const pending = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) AS count FROM outbox_operations
     WHERE user_id = ? AND state IN ('pending', 'processing', 'retry_scheduled')`,
    userId,
  );
  const retryable = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) AS count FROM outbox_operations
     WHERE user_id = ? AND state = 'retry_scheduled'`,
    userId,
  );
  const taskRows = await db.getAllAsync<{ target_entity_id: string }>(
    `SELECT DISTINCT target_entity_id FROM outbox_operations
     WHERE user_id = ? AND command_type LIKE 'task.%'
       AND target_entity_id IS NOT NULL
       AND state IN ('pending', 'processing', 'retry_scheduled')`,
    userId,
  );
  const issueRows = await db.getAllAsync<{
    command_type: string;
    state: 'retry_scheduled' | 'conflict' | 'permanently_rejected';
    last_safe_error: string | null;
    created_at: string;
    attempt_count: number;
    next_retry_at: string | null;
    last_safe_error_code: string | null;
    blocked_by_prerequisite: number;
  }>(
    `SELECT operation.command_type, operation.state, operation.last_safe_error,
            operation.created_at, operation.attempt_count, operation.next_retry_at,
            operation.last_safe_error_code,
            CASE WHEN operation.depends_on_operation_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM outbox_operations AS prerequisite
              WHERE prerequisite.operation_id = operation.depends_on_operation_id
                AND prerequisite.user_id = operation.user_id
                AND prerequisite.state = 'acknowledged'
            ) THEN 1 ELSE 0 END AS blocked_by_prerequisite
     FROM outbox_operations AS operation
     LEFT JOIN sync_conflicts AS conflict
       ON conflict.operation_id = operation.operation_id AND conflict.user_id = operation.user_id
     WHERE operation.user_id = ? AND operation.state IN ('retry_scheduled', 'conflict', 'permanently_rejected')
     ORDER BY operation.created_at ASC, operation.local_sequence ASC`,
    userId,
  );
  const issueDetails: LocalOutboxIssueDetails[] = issueRows.map((row) => ({
    operationType: row.command_type,
    classification: row.state === 'retry_scheduled' ? 'retryable' : row.state,
    safeErrorCode: row.last_safe_error_code ?? row.state,
    safeMessage: row.last_safe_error ?? 'A queued change needs attention.',
    createdAt: row.created_at,
    attemptCount: row.attempt_count,
    nextRetryAt: row.next_retry_at,
    blockedByPrerequisite: row.blocked_by_prerequisite === 1,
  }));
  const issue = issueDetails.find((detail) => detail.classification !== 'retryable') ?? null;

  return {
    pendingCount: pending?.count ?? 0,
    retryableCount: retryable?.count ?? 0,
    pendingTaskIds: taskRows.map((row) => row.target_entity_id),
    issue:
      issue === null
        ? null
        : {
            state: issue.classification === 'conflict' ? 'conflict' : 'permanently_rejected',
            safeMessage: issue.safeMessage,
          },
    issueDetails,
  };
}

export async function writeConflict(
  operation: StoredOutboxOperation,
  code: string,
  safeMessage: string,
  serverSnapshot: TodaySnapshot | null,
): Promise<void> {
  const db = await openDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const write = await transaction.runAsync(
      `INSERT INTO sync_conflicts(operation_id, user_id, conflict_code, safe_message, server_snapshot_json, created_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM outbox_operations WHERE operation_id = ? AND user_id = ?
       )
       ON CONFLICT(operation_id) DO UPDATE SET
         conflict_code = excluded.conflict_code,
         safe_message = excluded.safe_message,
         server_snapshot_json = excluded.server_snapshot_json,
         created_at = excluded.created_at
       WHERE sync_conflicts.user_id = excluded.user_id`,
      operation.operationId,
      operation.userId,
      code,
      safeMessage,
      serverSnapshot === null ? null : JSON.stringify(todaySnapshotSchema.parse(serverSnapshot)),
      new Date().toISOString(),
      operation.operationId,
      operation.userId,
    );
    if (write.changes !== 1) {
      throw new Error('The local conflict record is not available for this user.');
    }
  });
}

export async function clearUserLocalData(userId: UserId): Promise<void> {
  const db = await openDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM local_today_snapshots WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM sync_conflicts WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM outbox_operations WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM sync_state WHERE user_id = ?', userId);
  });
}

/**
 * Creates the SQLite-backed outbox repository. It is deliberately separate
 * from the processor so tests can inject an in-memory repository without
 * loading Expo SQLite.
 */
export function createLocalOutboxRepository(): OutboxRepository {
  return {
    recoverProcessingOperations,
    claimNextEligibleOperation,
    updateOperation,
    acknowledgeAcceptedOperation,
    writeConflict,
  };
}

/**
 * Creates the mobile-only repository used by the local command engine. Its
 * transaction method keeps the projection change, temporary-ID mapping, and
 * outbox row inside one exclusive SQLite transaction.
 */
export function createLocalCommandRepository(): LocalCommandRepository {
  return new SqliteLocalCommandRepository();
}

class SqliteLocalCommandRepository implements LocalCommandRepository {
  private activeConnection: SqlConnection | null = null;

  public async transaction<Value>(work: () => Promise<Value>): Promise<Value> {
    if (this.activeConnection !== null) {
      throw new Error('Nested local command transactions are not supported.');
    }
    const db = await openDatabase();
    let resolveResult: ((value: Value) => void) | undefined;
    const result = new Promise<Value>((resolve) => {
      resolveResult = resolve;
    });
    await db.withExclusiveTransactionAsync(async (transaction) => {
      this.activeConnection = transaction;
      try {
        if (resolveResult === undefined) {
          throw new Error('The local command transaction did not initialize.');
        }
        resolveResult(await work());
      } finally {
        this.activeConnection = null;
      }
    });
    return result;
  }

  public async readSnapshot(userId: UserId): Promise<TodaySnapshot | null> {
    const row = await (
      await this.connection()
    ).getFirstAsync<SnapshotRow>(
      'SELECT snapshot_json FROM local_today_snapshots WHERE user_id = ?',
      userId,
    );
    if (row === null) return null;
    const parsed = todaySnapshotSchema.safeParse(JSON.parse(row.snapshot_json) as unknown);
    return parsed.success ? parsed.data : null;
  }

  public async replaceSnapshot(userId: UserId, snapshot: TodaySnapshot): Promise<void> {
    const validated = todaySnapshotSchema.parse(snapshot);
    await (
      await this.connection()
    ).runAsync(
      `INSERT INTO local_today_snapshots(user_id, snapshot_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at`,
      userId,
      JSON.stringify(validated),
      new Date().toISOString(),
    );
  }

  public async insertOutbox(
    input: Parameters<LocalCommandRepository['insertOutbox']>[0],
  ): Promise<void> {
    await (
      await this.connection()
    ).runAsync(
      `INSERT INTO outbox_operations(operation_id, user_id, command_type, command_json, expected_revision, created_at, attempt_count, next_retry_at, state, last_safe_error, local_sequence, target_entity_id, depends_on_operation_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 'pending', NULL, ?, ?, ?)`,
      input.operationId,
      input.userId,
      input.commandType,
      input.commandJson,
      input.expectedRevision,
      input.createdAt,
      input.localSequence,
      input.targetId,
      input.dependsOnOperationId,
    );
  }

  public async registerTemporaryTask(
    input: Parameters<LocalCommandRepository['registerTemporaryTask']>[0],
  ): Promise<void> {
    await (
      await this.connection()
    ).runAsync(
      `INSERT INTO temporary_task_mappings(user_id, temporary_task_id, server_task_id, create_operation_id, created_at)
       VALUES (?, ?, NULL, ?, ?)`,
      input.userId,
      input.temporaryTaskId,
      input.createOperationId,
      new Date().toISOString(),
    );
  }

  public async nextSequence(userId: UserId): Promise<number> {
    const row = await (
      await this.connection()
    ).getFirstAsync<{ next_sequence: number }>(
      'SELECT COALESCE(MAX(local_sequence), 0) + 1 AS next_sequence FROM outbox_operations WHERE user_id = ?',
      userId,
    );
    return row?.next_sequence ?? 1;
  }

  public async latestPendingOperation(
    userId: UserId,
    targetId: string,
  ): Promise<OperationId | null> {
    const row = await (
      await this.connection()
    ).getFirstAsync<{ operation_id: string }>(
      `SELECT operation_id FROM outbox_operations
       WHERE user_id = ? AND target_entity_id = ?
         AND state IN ('pending', 'processing', 'retry_scheduled')
       ORDER BY local_sequence DESC LIMIT 1`,
      userId,
      targetId,
    );
    return row === null ? null : operationIdSchema.parse(row.operation_id);
  }

  private async connection(): Promise<SqlConnection> {
    return this.activeConnection ?? openDatabase();
  }
}

function mapOperation(row: OutboxRow): StoredOutboxOperation {
  return {
    operationId: operationIdSchema.parse(row.operation_id),
    userId: userIdSchema.parse(row.user_id),
    commandType: row.command_type,
    commandJson: row.command_json,
    createdAt: row.created_at,
    expectedRevision: row.expected_revision,
    attemptCount: row.attempt_count,
    nextRetryAt: row.next_retry_at,
    state: row.state,
    lastSafeError: row.last_safe_error,
    lastSafeErrorCode: row.last_safe_error_code,
    localSequence: row.local_sequence,
    targetId: row.target_entity_id,
    dependsOnOperationId:
      row.depends_on_operation_id === null
        ? null
        : operationIdSchema.parse(row.depends_on_operation_id),
  };
}
