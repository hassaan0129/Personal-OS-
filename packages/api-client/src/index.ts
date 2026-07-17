import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';
import type { TodaySnapshot } from '@personal-os/database-contracts';
import type { CommandResult } from '@personal-os/sync-contracts';
import {
  cancelTaskCommandSchema,
  closeLifeDayCommandSchema,
  commandResultSchema,
  completeTaskCommandSchema,
  createTaskCommandSchema,
  emailPasswordCredentialsSchema,
  repairPreviousLifeDayCommandSchema,
  reorderTaskCommandSchema,
  rescheduleTaskCommandSchema,
  reopenTaskCommandSchema,
  resolveUnfinishedTaskCommandSchema,
  setTaskTopThreeCommandSchema,
  startLifeDayCommandSchema,
  currentLifeDayReadSchema,
  todayTaskReadSchema,
  todaySnapshotSchema,
  updateTaskCommandSchema,
} from '@personal-os/validation';
import { z } from 'zod';

export interface AuthSession {
  readonly accessToken: string;
  readonly user: { readonly id: string; readonly email: string | null };
}

export interface AuthActionResult {
  readonly session: AuthSession | null;
  readonly requiresEmailConfirmation: boolean;
}

interface AuthSessionSource {
  readonly access_token: string;
  readonly user: { readonly id: string; readonly email?: string | null };
}

interface AuthResponse {
  readonly data: { readonly session: AuthSessionSource | null };
  readonly error: { readonly message: string } | null;
}

interface AuthSubscription {
  readonly data: { readonly subscription: { readonly unsubscribe: () => void } };
}

export interface AuthClient {
  readonly auth: {
    getSession: () => PromiseLike<AuthResponse>;
    onAuthStateChange: (
      callback: (event: unknown, session: AuthSessionSource | null) => void,
    ) => AuthSubscription;
    signInWithPassword: (credentials: {
      readonly email: string;
      readonly password: string;
    }) => PromiseLike<AuthResponse>;
    signUp: (credentials: {
      readonly email: string;
      readonly password: string;
    }) => PromiseLike<AuthResponse>;
    signOut: () => PromiseLike<{ readonly error: { readonly message: string } | null }>;
  };
}

export class ApiClientError extends Error {
  public constructor(
    public readonly code: 'configuration' | 'transport' | 'invalid_response',
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface RpcClient {
  rpc(
    functionName: string,
    parameters?: Readonly<Record<string, unknown>>,
  ): PromiseLike<{ readonly data: unknown; readonly error: { readonly message: string } | null }>;
}

export function createSupabaseClient(
  url: string,
  publishableKey: string,
  options?: SupabaseClientOptions<'public'>,
): SupabaseClient {
  return createClient(url, publishableKey, options);
}

function toAuthSession(session: AuthSessionSource | null): AuthSession | null {
  if (session === null) return null;
  return {
    accessToken: session.access_token,
    user: { id: session.user.id, email: session.user.email ?? null },
  };
}

function transportError(message: string): ApiClientError {
  return new ApiClientError('transport', message || 'The request could not be completed.');
}

function parseResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new ApiClientError('invalid_response', 'The server returned an invalid response.');
  return parsed.data;
}

async function callRpc<T>(
  client: RpcClient,
  functionName: string,
  parameters: Readonly<Record<string, unknown>>,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await client.rpc(functionName, parameters);
  if (response.error !== null) throw transportError(response.error.message);
  return parseResponse(schema, response.data);
}

export function createAuthAdapter(client: AuthClient) {
  return {
    async getSession(): Promise<AuthSession | null> {
      const response = await client.auth.getSession();
      if (response.error !== null) throw transportError(response.error.message);
      return toAuthSession(response.data.session);
    },
    subscribe(onSession: (session: AuthSession | null) => void): () => void {
      const { data } = client.auth.onAuthStateChange((_event, session) =>
        onSession(toAuthSession(session)),
      );
      return () => data.subscription.unsubscribe();
    },
    async signIn(input: unknown): Promise<AuthActionResult> {
      const credentials = emailPasswordCredentialsSchema.parse(input);
      const response = await client.auth.signInWithPassword(credentials);
      if (response.error !== null) throw transportError(response.error.message);
      return { session: toAuthSession(response.data.session), requiresEmailConfirmation: false };
    },
    async signUp(input: unknown): Promise<AuthActionResult> {
      const credentials = emailPasswordCredentialsSchema.parse(input);
      const response = await client.auth.signUp(credentials);
      if (response.error !== null) throw transportError(response.error.message);
      return {
        session: toAuthSession(response.data.session),
        requiresEmailConfirmation: response.data.session === null,
      };
    },
    async signOut(): Promise<void> {
      const response = await client.auth.signOut();
      if (response.error !== null) throw transportError(response.error.message);
    },
  };
}

export function createTodayReadAdapter(client: RpcClient) {
  return {
    getCurrentLifeDay: () =>
      callRpc(client, 'get_current_life_day', {}, currentLifeDayReadSchema.nullable()),
    getTodayTasks: () => callRpc(client, 'get_today_tasks', {}, z.array(todayTaskReadSchema)),
    getTodaySnapshot: (): Promise<TodaySnapshot> =>
      callRpc(client, 'get_today_snapshot', {}, todaySnapshotSchema),
  };
}

type StartLifeDayCommand = z.input<typeof startLifeDayCommandSchema>;
type CloseLifeDayCommand = z.input<typeof closeLifeDayCommandSchema>;
type RepairLifeDayCommand = z.input<typeof repairPreviousLifeDayCommandSchema>;
type CreateTaskCommand = z.input<typeof createTaskCommandSchema>;
type UpdateTaskCommand = z.input<typeof updateTaskCommandSchema>;
type CompleteTaskCommand = z.input<typeof completeTaskCommandSchema>;
type RescheduleTaskCommand = z.input<typeof rescheduleTaskCommandSchema>;
type CancelTaskCommand = z.input<typeof cancelTaskCommandSchema>;
type ReorderTaskCommand = z.input<typeof reorderTaskCommandSchema>;
type SetTaskTopThreeCommand = z.input<typeof setTaskTopThreeCommandSchema>;
type ReopenTaskCommand = z.input<typeof reopenTaskCommandSchema>;
type ResolveUnfinishedTaskCommand = z.input<typeof resolveUnfinishedTaskCommandSchema>;

export function createLifeDayCommandAdapter(client: RpcClient) {
  return {
    async start(input: StartLifeDayCommand): Promise<CommandResult> {
      const command = startLifeDayCommandSchema.parse(input);
      return callRpc(
        client,
        'command_start_life_day',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_woke_at: command.payload.wokeAt,
          p_timezone: command.payload.timezone,
        },
        commandResultSchema,
      );
    },
    async close(input: CloseLifeDayCommand): Promise<CommandResult> {
      const command = closeLifeDayCommandSchema.parse(input);
      return callRpc(
        client,
        'command_close_life_day',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_life_day_id: command.payload.lifeDayId,
          p_slept_at: command.payload.sleptAt,
          p_timezone: command.payload.timezone,
        },
        commandResultSchema,
      );
    },
    async repairPrevious(input: RepairLifeDayCommand): Promise<CommandResult> {
      const command = repairPreviousLifeDayCommandSchema.parse(input);
      return callRpc(
        client,
        'command_repair_previous_life_day',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_life_day_id: command.payload.lifeDayId,
          p_slept_at: command.payload.sleptAt,
          p_timezone: command.payload.timezone,
          p_reason_code: command.payload.reason.code,
          p_reason_note: command.payload.reason.note ?? null,
        },
        commandResultSchema,
      );
    },
  };
}

export function createTaskCommandAdapter(client: RpcClient) {
  return {
    async create(input: CreateTaskCommand): Promise<CommandResult> {
      const command = createTaskCommandSchema.parse(input);
      return callRpc(
        client,
        'command_create_task',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_life_day_id: command.payload.lifeDayId,
          p_title: command.payload.title,
          p_description: command.payload.description,
          p_priority: command.payload.priority,
          p_scheduled_at: command.payload.scheduledAt,
          p_scheduled_timezone: command.payload.scheduledTimezone,
          p_estimated_minutes: command.payload.estimatedMinutes,
          p_position: command.payload.position,
        },
        commandResultSchema,
      );
    },
    async update(input: UpdateTaskCommand): Promise<CommandResult> {
      const command = updateTaskCommandSchema.parse(input);
      return callRpc(
        client,
        'command_update_task',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_task_id: command.payload.taskId,
          p_life_day_id: command.payload.lifeDayId,
          p_title: command.payload.title,
          p_description: command.payload.description,
          p_status: command.payload.status,
          p_priority: command.payload.priority,
          p_scheduled_at: command.payload.scheduledAt,
          p_scheduled_timezone: command.payload.scheduledTimezone,
          p_estimated_minutes: command.payload.estimatedMinutes,
          p_position: command.payload.position,
        },
        commandResultSchema,
      );
    },
    async complete(input: CompleteTaskCommand): Promise<CommandResult> {
      const command = completeTaskCommandSchema.parse(input);
      return callRpc(
        client,
        'command_complete_task',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_task_id: command.payload.taskId,
          p_completed_at: command.payload.completedAt,
          p_life_day_id: command.payload.lifeDayId,
        },
        commandResultSchema,
      );
    },
    async reschedule(input: RescheduleTaskCommand): Promise<CommandResult> {
      const command = rescheduleTaskCommandSchema.parse(input);
      return callRpc(
        client,
        'command_reschedule_task',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_task_id: command.payload.taskId,
          p_scheduled_at: command.payload.scheduledAt,
          p_scheduled_timezone: command.payload.scheduledTimezone,
          p_reason_code: command.payload.reason.code,
          p_reason_note: command.payload.reason.note ?? null,
        },
        commandResultSchema,
      );
    },
    async cancel(input: CancelTaskCommand): Promise<CommandResult> {
      const command = cancelTaskCommandSchema.parse(input);
      return callRpc(
        client,
        'command_cancel_task',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_task_id: command.payload.taskId,
          p_cancelled_at: command.payload.cancelledAt,
          p_reason_code: command.payload.reason.code,
          p_reason_note: command.payload.reason.note ?? null,
        },
        commandResultSchema,
      );
    },
    async reorder(input: ReorderTaskCommand): Promise<CommandResult> {
      const command = reorderTaskCommandSchema.parse(input);
      return callRpc(
        client,
        'command_reorder_task',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_task_id: command.payload.taskId,
          p_position: command.payload.position,
        },
        commandResultSchema,
      );
    },
    async setTopThree(input: SetTaskTopThreeCommand): Promise<CommandResult> {
      const command = setTaskTopThreeCommandSchema.parse(input);
      return callRpc(
        client,
        'command_set_task_top_three',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_task_id: command.payload.taskId,
          p_is_top_three: command.payload.isTopThree,
        },
        commandResultSchema,
      );
    },
    async reopen(input: ReopenTaskCommand): Promise<CommandResult> {
      const command = reopenTaskCommandSchema.parse(input);
      return callRpc(
        client,
        'command_reopen_task',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_task_id: command.payload.taskId,
          p_life_day_id: command.payload.lifeDayId,
        },
        commandResultSchema,
      );
    },
    async resolveUnfinished(input: ResolveUnfinishedTaskCommand): Promise<CommandResult> {
      const command = resolveUnfinishedTaskCommandSchema.parse(input);
      const payload = command.payload;
      return callRpc(
        client,
        'command_resolve_unfinished_task',
        {
          p_operation_id: command.metadata.operationId,
          p_device_id: command.metadata.deviceId,
          p_expected_revision: command.metadata.baseRevision,
          p_client_occurred_at: command.metadata.clientOccurredAt,
          p_client_timezone: command.metadata.clientTimezone,
          p_task_id: payload.taskId,
          p_resolution: payload.resolution,
          p_target_life_day_id:
            payload.resolution === 'reschedule' ? payload.targetLifeDayId : null,
          p_scheduled_at: payload.resolution === 'reschedule' ? payload.scheduledAt : null,
          p_scheduled_timezone:
            payload.resolution === 'reschedule' ? payload.scheduledTimezone : null,
          p_reason_code: payload.resolution === 'reschedule' ? payload.reason.code : null,
          p_reason_note: payload.resolution === 'reschedule' ? (payload.reason.note ?? null) : null,
        },
        commandResultSchema,
      );
    },
  };
}
