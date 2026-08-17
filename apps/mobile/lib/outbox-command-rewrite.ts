import type { TaskId } from '@personal-os/domain';
import {
  cancelTaskCommandSchema,
  completeTaskCommandSchema,
  reorderTaskCommandSchema,
  reopenTaskCommandSchema,
  rescheduleTaskCommandSchema,
  resolveUnfinishedTaskCommandSchema,
  setTaskTopThreeCommandSchema,
  updateTaskCommandSchema,
} from '@personal-os/validation';

type TaskCommandWithTarget = {
  readonly payload: {
    readonly taskId: TaskId;
  };
};

type CommandSchema<Command extends TaskCommandWithTarget> = {
  parse(input: unknown): Command;
};

const taskCommandSchemas: Readonly<Record<string, CommandSchema<TaskCommandWithTarget>>> = {
  'task.update': updateTaskCommandSchema,
  'task.reorder': reorderTaskCommandSchema,
  'task.set_top_three': setTaskTopThreeCommandSchema,
  'task.complete': completeTaskCommandSchema,
  'task.reopen': reopenTaskCommandSchema,
  'task.reschedule': rescheduleTaskCommandSchema,
  'task.cancel': cancelTaskCommandSchema,
  'task.resolve_unfinished': resolveUnfinishedTaskCommandSchema,
};

/**
 * Replaces only the target task ID in a queued, validated task command. The
 * command envelope is reparsed before persistence so operation metadata and
 * unrelated UUID fields remain untouched.
 */
export function rewriteQueuedTaskCommand(
  commandType: string,
  commandJson: string,
  temporaryTaskId: TaskId,
  serverTaskId: TaskId,
): string {
  const schema = taskCommandSchemas[commandType];
  if (schema === undefined) {
    throw new Error(`Unsupported queued task command: ${commandType}`);
  }

  const command = schema.parse(JSON.parse(commandJson) as unknown);
  if (command.payload.taskId !== temporaryTaskId) {
    throw new Error('The queued command does not target the temporary task.');
  }

  return JSON.stringify({
    ...command,
    payload: {
      ...command.payload,
      taskId: serverTaskId,
    },
  });
}
