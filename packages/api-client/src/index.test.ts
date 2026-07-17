import { describe, expect, it } from 'vitest';

import {
  ApiClientError,
  createAuthAdapter,
  createLifeDayCommandAdapter,
  createTaskCommandAdapter,
  createTodayReadAdapter,
  type AuthClient,
  type RpcClient,
} from './index';

const ids = {
  operation: '10000000-0000-4000-8000-000000000001',
  device: '10000000-0000-4000-8000-000000000002',
  lifeDay: '10000000-0000-4000-8000-000000000003',
  task: '10000000-0000-4000-8000-000000000004',
  user: '10000000-0000-4000-8000-000000000005',
};

const timestamp = '2026-07-18T00:00:00.000Z';
const metadata = {
  operationId: ids.operation,
  deviceId: ids.device,
  schemaVersion: 1,
  baseRevision: null,
  clientOccurredAt: timestamp,
  clientTimezone: 'UTC',
};

const snapshot = {
  profile: {
    id: ids.user,
    homeTimezone: 'UTC',
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  lifeDay: null,
  tasks: [],
};

function rpcResponse(data: unknown): RpcClient {
  return { rpc: async () => ({ data, error: null }) };
}

describe('authentication adapter', () => {
  it('restores and publishes a mapped auth session', async () => {
    const listeners: Array<
      (
        event: unknown,
        session: { access_token: string; user: { id: string; email?: string | null } } | null,
      ) => void
    > = [];
    let unsubscribed = false;
    const sourceSession = {
      access_token: 'local-access-token',
      user: { id: ids.user, email: 'person@example.test' },
    };
    const client: AuthClient = {
      auth: {
        getSession: async () => ({ data: { session: sourceSession }, error: null }),
        onAuthStateChange: (callback) => {
          listeners.push(callback);
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  unsubscribed = true;
                },
              },
            },
          };
        },
        signInWithPassword: async () => ({ data: { session: sourceSession }, error: null }),
        signUp: async () => ({ data: { session: sourceSession }, error: null }),
        signOut: async () => ({ error: null }),
      },
    };
    const adapter = createAuthAdapter(client);
    const seen: string[] = [];

    await expect(adapter.getSession()).resolves.toMatchObject({ user: { id: ids.user } });
    const unsubscribe = adapter.subscribe((session) => seen.push(session?.user.id ?? 'signed-out'));
    listeners.forEach((listener) => listener('SIGNED_OUT', null));
    unsubscribe();

    expect(seen).toEqual(['signed-out']);
    expect(unsubscribed).toBe(true);
  });

  it('validates credentials before calling the auth provider', async () => {
    let called = false;
    const client: AuthClient = {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        signInWithPassword: async () => {
          called = true;
          return { data: { session: null }, error: null };
        },
        signUp: async () => ({ data: { session: null }, error: null }),
        signOut: async () => ({ error: null }),
      },
    };

    await expect(
      createAuthAdapter(client).signIn({ email: 'not-an-email', password: 'short' }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });
});

describe('Today read adapter', () => {
  it('validates a safe Today snapshot response', async () => {
    await expect(createTodayReadAdapter(rpcResponse(snapshot)).getTodaySnapshot()).resolves.toEqual(
      snapshot,
    );
  });

  it('rejects an invalid RPC response shape', async () => {
    await expect(
      createTodayReadAdapter(rpcResponse({ tasks: [] })).getTodaySnapshot(),
    ).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe('command adapters', () => {
  it('maps a Life Day wake command to the command RPC', async () => {
    let request: {
      readonly functionName: string;
      readonly parameters: Readonly<Record<string, unknown>>;
    } | null = null;
    const client: RpcClient = {
      rpc: async (functionName, parameters) => {
        request = { functionName, parameters: parameters ?? {} };
        return {
          data: {
            operationId: ids.operation,
            status: 'accepted',
            entity: { type: 'life_day', id: ids.lifeDay, revision: 1, data: {} },
            syncCursor: 1,
          },
          error: null,
        };
      },
    };

    await createLifeDayCommandAdapter(client).start({
      metadata: { ...metadata, commandName: 'life_day.wake' },
      payload: { wokeAt: timestamp, timezone: 'UTC' },
    });

    expect(request).toMatchObject({
      functionName: 'command_start_life_day',
      parameters: { p_operation_id: ids.operation, p_woke_at: timestamp, p_timezone: 'UTC' },
    });
  });

  it('maps task creation and completion through their command RPCs', async () => {
    const functionNames: string[] = [];
    const client: RpcClient = {
      rpc: async (functionName) => {
        functionNames.push(functionName);
        return {
          data: {
            operationId: ids.operation,
            status: 'accepted',
            entity: { type: 'task', id: ids.task, revision: 1, data: {} },
            syncCursor: 1,
          },
          error: null,
        };
      },
    };
    const tasks = createTaskCommandAdapter(client);

    await tasks.create({
      metadata: { ...metadata, commandName: 'task.create' },
      payload: {
        lifeDayId: ids.lifeDay,
        title: 'Adapter test task',
        description: null,
        priority: 'progress',
        scheduledAt: null,
        scheduledTimezone: null,
        estimatedMinutes: null,
        position: 0,
      },
    });
    await tasks.complete({
      metadata: { ...metadata, commandName: 'task.complete', baseRevision: 1 },
      payload: { taskId: ids.task, completedAt: timestamp, lifeDayId: ids.lifeDay },
    });

    expect(functionNames).toEqual(['command_create_task', 'command_complete_task']);
  });

  it('preserves a repair-required or revision-conflict result for UI recovery', async () => {
    const client = rpcResponse({
      operationId: ids.operation,
      status: 'conflict',
      error: { code: 'repair_required', message: 'Repair the existing Life Day first.' },
      entity: null,
      syncCursor: 4,
    });

    await expect(
      createLifeDayCommandAdapter(client).start({
        metadata: { ...metadata, commandName: 'life_day.wake' },
        payload: { wokeAt: timestamp, timezone: 'UTC' },
      }),
    ).resolves.toMatchObject({ status: 'conflict', error: { code: 'repair_required' } });
  });
});
