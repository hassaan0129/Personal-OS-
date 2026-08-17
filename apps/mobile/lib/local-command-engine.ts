import type { TodaySnapshot, TodayTaskRead } from '@personal-os/database-contracts';
import { INITIAL_REVISION, decideTaskCompletion } from '@personal-os/domain';
import type { LifeDayId, OperationId, TaskId, UserId } from '@personal-os/domain';
import {
  cancelTaskCommandSchema,
  closeLifeDayCommandSchema,
  completeTaskCommandSchema,
  createTaskCommandSchema,
  lifeDayIdSchema,
  localDateSchema,
  reorderTaskCommandSchema,
  repairPreviousLifeDayCommandSchema,
  revisionSchema,
  reopenTaskCommandSchema,
  rescheduleTaskCommandSchema,
  resolveUnfinishedTaskCommandSchema,
  setTaskTopThreeCommandSchema,
  startLifeDayCommandSchema,
  updateTaskCommandSchema,
} from '@personal-os/validation';

import { orderTasksByPosition } from './task-order';

type CommandSchema<Value> = {
  parse(input: unknown): Value;
};

type ParsedCommand = {
  readonly metadata: {
    readonly operationId: OperationId;
    readonly baseRevision: number | null;
    readonly clientOccurredAt: string;
  };
};

type TaskCommand = ParsedCommand & {
  readonly payload: {
    readonly taskId: TaskId;
  };
};

export interface LocalCommandError {
  readonly code:
    'validation_failed' | 'invalid_transition' | 'revision_conflict' | 'top_three_limit';
  readonly message: string;
}

export type LocalCommandResult =
  | {
      readonly status: 'queued';
      readonly operationId: OperationId;
      readonly snapshot: TodaySnapshot;
    }
  | { readonly status: 'rejected'; readonly error: LocalCommandError };

export interface LocalCommandRepository {
  transaction<Value>(work: () => Promise<Value>): Promise<Value>;
  readSnapshot(userId: UserId): Promise<TodaySnapshot | null>;
  replaceSnapshot(userId: UserId, snapshot: TodaySnapshot): Promise<void>;
  insertOutbox(input: {
    readonly operationId: OperationId;
    readonly userId: UserId;
    readonly commandType: string;
    readonly commandJson: string;
    readonly expectedRevision: number | null;
    readonly createdAt: string;
    readonly localSequence: number;
    readonly targetId: string | null;
    readonly dependsOnOperationId: OperationId | null;
  }): Promise<void>;
  registerTemporaryTask(input: {
    readonly userId: UserId;
    readonly temporaryTaskId: TaskId;
    readonly createOperationId: OperationId;
  }): Promise<void>;
  nextSequence(userId: UserId): Promise<number>;
  latestPendingOperation(userId: UserId, targetId: string): Promise<OperationId | null>;
}

export interface LocalCommandDependencies {
  readonly repository: LocalCommandRepository;
  readonly now: () => string;
  readonly temporaryTaskId: () => TaskId;
}

/**
 * Applies validated commands to a local Today projection and persists the command
 * in the same repository transaction. It never calls Supabase directly.
 */
export class LocalCommandEngine {
  public constructor(private readonly dependencies: LocalCommandDependencies) {}

  public start(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    return this.queue(
      userId,
      'life_day.wake',
      startLifeDayCommandSchema,
      command,
      (snapshot, parsed) => {
        if (snapshot.lifeDay !== null) {
          throw localError('invalid_transition', 'A local Life Day is already open.');
        }

        const temporaryLifeDayId = lifeDayIdSchema.parse(parsed.metadata.operationId);
        return {
          ...snapshot,
          lifeDay: {
            id: temporaryLifeDayId,
            operationalDate: localDateSchema.parse(parsed.payload.wokeAt.slice(0, 10)),
            timezone: parsed.payload.timezone,
            wokeAt: parsed.payload.wokeAt,
            sleptAt: null,
            revision: INITIAL_REVISION,
            createdAt: parsed.metadata.clientOccurredAt,
            updatedAt: parsed.metadata.clientOccurredAt,
          },
        };
      },
      (parsed) => lifeDayIdSchema.parse(parsed.metadata.operationId),
    );
  }

  public close(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    return this.queue(
      userId,
      'life_day.sleep',
      closeLifeDayCommandSchema,
      command,
      (snapshot, parsed) => {
        if (snapshot.lifeDay?.id !== parsed.payload.lifeDayId) {
          throw localError('invalid_transition', 'The local Life Day is not available to close.');
        }
        if (hasUnresolvedTasks(snapshot, parsed.payload.lifeDayId)) {
          throw localError(
            'invalid_transition',
            'Resolve unfinished tasks before closing this Life Day.',
          );
        }
        return {
          ...snapshot,
          lifeDay: {
            ...snapshot.lifeDay,
            sleptAt: parsed.payload.sleptAt,
            updatedAt: parsed.metadata.clientOccurredAt,
          },
        };
      },
      (parsed) => parsed.payload.lifeDayId,
    );
  }

  public repairPrevious(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    return this.queue(
      userId,
      'life_day.repair_previous',
      repairPreviousLifeDayCommandSchema,
      command,
      (snapshot, parsed) => {
        if (snapshot.lifeDay?.id !== parsed.payload.lifeDayId) {
          throw localError('invalid_transition', 'The local Life Day is not available to repair.');
        }
        return {
          ...snapshot,
          lifeDay: {
            ...snapshot.lifeDay,
            sleptAt: parsed.payload.sleptAt,
            updatedAt: parsed.metadata.clientOccurredAt,
          },
        };
      },
      (parsed) => parsed.payload.lifeDayId,
    );
  }

  public createTask(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    const temporaryTaskId = this.dependencies.temporaryTaskId();
    return this.queue(
      userId,
      'task.create',
      createTaskCommandSchema,
      command,
      (snapshot, parsed) => ({
        ...snapshot,
        tasks: [
          ...snapshot.tasks,
          {
            id: temporaryTaskId,
            lifeDayId: parsed.payload.lifeDayId,
            title: parsed.payload.title,
            description: parsed.payload.description,
            priority: parsed.payload.priority,
            status: 'planned',
            scheduledAt: parsed.payload.scheduledAt,
            scheduledTimezone: parsed.payload.scheduledTimezone,
            estimatedMinutes: parsed.payload.estimatedMinutes,
            position: parsed.payload.position,
            isTopThree: false,
            completedAt: null,
            // This is a local projection only. The authoritative server revision
            // remains absent until acknowledgement replaces this temporary record.
            revision: INITIAL_REVISION,
            createdAt: parsed.metadata.clientOccurredAt,
            updatedAt: parsed.metadata.clientOccurredAt,
          },
        ],
      }),
      () => temporaryTaskId,
      async (parsed) => {
        await this.dependencies.repository.registerTemporaryTask({
          userId,
          temporaryTaskId,
          createOperationId: parsed.metadata.operationId,
        });
      },
    );
  }

  public updateTask(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    return this.mutateTask(
      userId,
      'task.update',
      updateTaskCommandSchema,
      command,
      (task, parsed) => {
        if (parsed.metadata.baseRevision !== task.revision) {
          throw localError(
            'revision_conflict',
            'The local task has changed. Review the latest task before editing it again.',
          );
        }
        if (!isActiveTask(task)) {
          throw localError('invalid_transition', 'Only an active task can be edited.');
        }
        return {
          ...task,
          lifeDayId: parsed.payload.lifeDayId,
          title: parsed.payload.title,
          description: parsed.payload.description,
          priority: parsed.payload.priority,
          status: parsed.payload.status,
          scheduledAt: parsed.payload.scheduledAt,
          scheduledTimezone: parsed.payload.scheduledTimezone,
          estimatedMinutes: parsed.payload.estimatedMinutes,
          position: parsed.payload.position,
          // Advance the local projection predictably. A later queued edit can
          // depend on this command and send the revision the server will have
          // after this accepted update; a remote mismatch is still a conflict.
          revision: revisionSchema.parse(task.revision + 1),
          updatedAt: parsed.metadata.clientOccurredAt,
        };
      },
    );
  }

  public complete(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    return this.mutateTask(
      userId,
      'task.complete',
      completeTaskCommandSchema,
      command,
      (task, parsed) => {
        if (parsed.metadata.baseRevision !== task.revision) {
          throw localError(
            'revision_conflict',
            'The local task has changed. Review the latest task before completing it again.',
          );
        }
        const decision = decideTaskCompletion({ ...task, userId });
        if (decision.kind !== 'allowed') {
          throw localError(
            'invalid_transition',
            'The task cannot be completed from its current state.',
          );
        }
        return {
          ...task,
          status: 'completed',
          completedAt: parsed.payload.completedAt,
          revision: revisionSchema.parse(task.revision + 1),
          updatedAt: parsed.metadata.clientOccurredAt,
        };
      },
    );
  }

  public reorder(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    return this.mutateTask(
      userId,
      'task.reorder',
      reorderTaskCommandSchema,
      command,
      (task, parsed) => {
        if (parsed.metadata.baseRevision !== task.revision) {
          throw localError(
            'revision_conflict',
            'The local task has changed. Review the latest task before reordering it.',
          );
        }
        if (!isActiveTask(task)) {
          throw localError('invalid_transition', 'Only an active task can be reordered.');
        }
        return {
          ...task,
          position: parsed.payload.position,
          revision: revisionSchema.parse(task.revision + 1),
          updatedAt: parsed.metadata.clientOccurredAt,
        };
      },
    );
  }

  public topThree(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    return this.mutateTask(
      userId,
      'task.set_top_three',
      setTaskTopThreeCommandSchema,
      command,
      (task, parsed, snapshot) => {
        const topThreeCount = snapshot.tasks.filter(
          (candidate) =>
            candidate.lifeDayId === task.lifeDayId &&
            candidate.id !== task.id &&
            candidate.isTopThree &&
            isActiveTask(candidate),
        ).length;
        if (parsed.payload.isTopThree && !task.isTopThree && topThreeCount >= 3) {
          throw localError(
            'top_three_limit',
            'A Life Day can have at most three active Top 3 tasks.',
          );
        }
        return {
          ...task,
          isTopThree: parsed.payload.isTopThree,
          updatedAt: parsed.metadata.clientOccurredAt,
        };
      },
    );
  }

  public cancel(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    return this.mutateTask(
      userId,
      'task.cancel',
      cancelTaskCommandSchema,
      command,
      (task, parsed) => {
        if (parsed.metadata.baseRevision !== task.revision) {
          throw localError(
            'revision_conflict',
            'The local task has changed. Review the latest task before cancelling it.',
          );
        }
        if (task.status !== 'planned' && task.status !== 'in_progress') {
          throw localError(
            'invalid_transition',
            'Only a planned or in-progress task can be cancelled.',
          );
        }
        return {
          ...task,
          status: 'cancelled',
          isTopThree: false,
          revision: revisionSchema.parse(task.revision + 1),
          updatedAt: parsed.metadata.clientOccurredAt,
        };
      },
    );
  }

  public reschedule(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    return this.mutateTask(
      userId,
      'task.reschedule',
      rescheduleTaskCommandSchema,
      command,
      (task, parsed) => {
        if (parsed.metadata.baseRevision !== task.revision) {
          throw localError(
            'revision_conflict',
            'The local task has changed. Review the latest task before rescheduling it.',
          );
        }
        // This mirrors command_reschedule_task. In-progress tasks use the
        // separate unfinished-task-resolution command, which remains online-only.
        if (task.status !== 'planned' && task.status !== 'overdue') {
          throw localError(
            'invalid_transition',
            'Only a planned or overdue task can be rescheduled.',
          );
        }
        if (parsed.payload.scheduledAt === null || parsed.payload.scheduledTimezone === null) {
          throw localError(
            'validation_failed',
            'Rescheduling requires a scheduled time and IANA timezone.',
          );
        }
        return {
          ...task,
          status: 'planned',
          scheduledAt: parsed.payload.scheduledAt,
          scheduledTimezone: parsed.payload.scheduledTimezone,
          revision: revisionSchema.parse(task.revision + 1),
          updatedAt: parsed.metadata.clientOccurredAt,
        };
      },
    );
  }

  public reopen(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    return this.mutateTask(
      userId,
      'task.reopen',
      reopenTaskCommandSchema,
      command,
      (task, parsed) => {
        if (parsed.metadata.baseRevision !== task.revision) {
          throw localError(
            'revision_conflict',
            'The local task has changed. Review the latest task before reopening it again.',
          );
        }
        if (task.status !== 'completed') {
          throw localError('invalid_transition', 'Only a completed task can be reopened.');
        }
        return {
          ...task,
          status: 'planned',
          completedAt: null,
          lifeDayId: parsed.payload.lifeDayId,
          revision: revisionSchema.parse(task.revision + 1),
          updatedAt: parsed.metadata.clientOccurredAt,
        };
      },
    );
  }

  public resolve(userId: UserId, command: unknown): Promise<LocalCommandResult> {
    return this.mutateTask(
      userId,
      'task.resolve_unfinished',
      resolveUnfinishedTaskCommandSchema,
      command,
      (task, parsed) =>
        parsed.payload.resolution === 'overdue'
          ? {
              ...task,
              status: 'overdue',
              isTopThree: false,
              updatedAt: parsed.metadata.clientOccurredAt,
            }
          : {
              ...task,
              status: 'planned',
              lifeDayId: parsed.payload.targetLifeDayId,
              scheduledAt: parsed.payload.scheduledAt,
              scheduledTimezone: parsed.payload.scheduledTimezone,
              isTopThree: false,
              updatedAt: parsed.metadata.clientOccurredAt,
            },
    );
  }

  private mutateTask<Command extends TaskCommand>(
    userId: UserId,
    commandType: string,
    schema: CommandSchema<Command>,
    command: unknown,
    mutation: (task: TodayTaskRead, parsed: Command, snapshot: TodaySnapshot) => TodayTaskRead,
  ): Promise<LocalCommandResult> {
    return this.queue(
      userId,
      commandType,
      schema,
      command,
      (snapshot, parsed) => {
        const task = snapshot.tasks.find((candidate) => candidate.id === parsed.payload.taskId);
        if (task === undefined) {
          throw localError('invalid_transition', 'The local task is not available.');
        }
        const nextTasks = snapshot.tasks.map((candidate) =>
          candidate.id === task.id ? mutation(task, parsed, snapshot) : candidate,
        );
        return {
          ...snapshot,
          tasks: commandType === 'task.reorder' ? orderTasksByPosition(nextTasks) : nextTasks,
        };
      },
      (parsed) => parsed.payload.taskId,
    );
  }

  private async queue<Command extends ParsedCommand>(
    userId: UserId,
    commandType: string,
    schema: CommandSchema<Command>,
    command: unknown,
    mutation: (snapshot: TodaySnapshot, parsed: Command) => TodaySnapshot,
    targetId: (parsed: Command) => string | null = () => null,
    beforeInsert: (parsed: Command) => Promise<void> = async () => undefined,
  ): Promise<LocalCommandResult> {
    let parsed: Command;
    try {
      parsed = schema.parse(command);
    } catch {
      return {
        status: 'rejected',
        error: localError('validation_failed', 'The command is invalid.'),
      };
    }

    return this.dependencies.repository.transaction(async () => {
      const snapshot = await this.dependencies.repository.readSnapshot(userId);
      if (snapshot === null) {
        return {
          status: 'rejected',
          error: localError('invalid_transition', 'Today has not been hydrated locally.'),
        };
      }

      let nextSnapshot: TodaySnapshot;
      try {
        nextSnapshot = mutation(snapshot, parsed);
      } catch (error) {
        if (error instanceof LocalEngineError) {
          return { status: 'rejected', error };
        }
        throw error;
      }

      const entityId = targetId(parsed);
      const dependsOnOperationId =
        entityId === null
          ? null
          : await this.dependencies.repository.latestPendingOperation(userId, entityId);
      await this.dependencies.repository.replaceSnapshot(userId, nextSnapshot);
      await this.dependencies.repository.insertOutbox({
        operationId: parsed.metadata.operationId,
        userId,
        commandType,
        commandJson: JSON.stringify(parsed),
        expectedRevision: parsed.metadata.baseRevision,
        createdAt: this.dependencies.now(),
        localSequence: await this.dependencies.repository.nextSequence(userId),
        targetId: entityId,
        dependsOnOperationId,
      });
      await beforeInsert(parsed);
      return { status: 'queued', operationId: parsed.metadata.operationId, snapshot: nextSnapshot };
    });
  }
}

class LocalEngineError extends Error {
  public constructor(
    public readonly code: LocalCommandError['code'],
    message: string,
  ) {
    super(message);
  }
}

function localError(code: LocalCommandError['code'], message: string): LocalEngineError {
  return new LocalEngineError(code, message);
}

function hasUnresolvedTasks(snapshot: TodaySnapshot, lifeDayId: LifeDayId): boolean {
  return snapshot.tasks.some(
    (task) =>
      task.lifeDayId === lifeDayId && (task.status === 'planned' || task.status === 'in_progress'),
  );
}

function isActiveTask(task: TodayTaskRead): boolean {
  return task.status === 'planned' || task.status === 'in_progress' || task.status === 'overdue';
}
