import type { CommandMetadata, Revision } from '@personal-os/domain';

export interface CommandEnvelope<Payload> {
  readonly metadata: CommandMetadata;
  readonly payload: Payload;
}

export type CommandErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'invalid_timezone'
  | 'repair_required'
  | 'unresolved_tasks'
  | 'revision_conflict'
  | 'invalid_transition'
  | 'top_three_limit';

export interface SafeCommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
}

export interface CommandEntity {
  readonly type: 'life_day' | 'task';
  readonly id: string;
  readonly revision: Revision;
  readonly data: Readonly<Record<string, unknown>>;
}

interface CommandResultBase {
  readonly operationId: CommandMetadata['operationId'];
  readonly syncCursor: number | null;
}

export interface AcceptedCommandResult extends CommandResultBase {
  readonly status: 'accepted' | 'duplicate_accepted';
  readonly entity: CommandEntity;
}

export interface ConflictCommandResult extends CommandResultBase {
  readonly status: 'conflict';
  readonly error: SafeCommandError;
  readonly entity: CommandEntity | null;
}

export interface RejectedCommandResult extends CommandResultBase {
  readonly status: 'rejected';
  readonly error: SafeCommandError;
  readonly entity: null;
}

export type CommandResult = AcceptedCommandResult | ConflictCommandResult | RejectedCommandResult;
