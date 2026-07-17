'use client';

import {
  createAuthAdapter,
  createLifeDayCommandAdapter,
  createTaskCommandAdapter,
  createTodayReadAdapter,
  type AuthSession,
} from '@personal-os/api-client';
import { parseWebEnvironment, requireSupabasePublicConfiguration } from '@personal-os/config';
import type { TodaySnapshot } from '@personal-os/database-contracts';
import {
  taskPriorities,
  taskReasonCodes,
  type TaskPriority,
  type TaskReasonCode,
} from '@personal-os/domain';
import { useEffect, useMemo, useState } from 'react';

import { getWebSupabaseClient } from '../lib/supabase';

function now() {
  return new Date().toISOString();
}
function timezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
function deviceId() {
  const key = 'personal-os-device-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  window.localStorage.setItem(key, value);
  return value;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function isTaskPriority(value: string): value is TaskPriority {
  return taskPriorities.some((priority) => priority === value);
}

export default function TodayClient() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('progress');
  const [estimate, setEstimate] = useState('');

  const configuration = useMemo(() => {
    try {
      return {
        value: requireSupabasePublicConfiguration(
          parseWebEnvironment({
            NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
            NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          }),
        ),
        error: null,
      };
    } catch (cause) {
      return { value: null, error: message(cause) };
    }
  }, []);
  const client = useMemo(
    () => (configuration.value === null ? null : getWebSupabaseClient(configuration.value)),
    [configuration],
  );

  const auth = useMemo(() => client && createAuthAdapter(client), [client]);
  const reads = useMemo(() => client && createTodayReadAdapter(client), [client]);
  const lifeDays = useMemo(() => client && createLifeDayCommandAdapter(client), [client]);
  const tasks = useMemo(() => client && createTaskCommandAdapter(client), [client]);

  async function refresh() {
    if (!reads) return;
    setSnapshot(await reads.getTodaySnapshot());
  }

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    let active = true;
    auth
      .getSession()
      .then(async (next) => {
        if (!active) return;
        setSession(next);
        if (next) await refresh();
      })
      .catch((cause: unknown) => setError(message(cause)))
      .finally(() => active && setLoading(false));
    const unsubscribe = auth.subscribe((next) => {
      if (active) setSession(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  function promptForTaskReason(
    promptText: string,
  ): { readonly code: TaskReasonCode; readonly note?: string } | null {
    const code = window.prompt(promptText)?.trim();
    if (code === undefined || code === '') return null;
    const validCode = taskReasonCodes.find(
      (candidate): candidate is TaskReasonCode => candidate === code,
    );
    if (validCode === undefined) {
      setError('Choose one of the listed structured reason codes.');
      return null;
    }
    const note = validCode === 'other' ? window.prompt('Explain the reason')?.trim() : undefined;
    if (validCode === 'other' && !note) {
      setError('A note is required when the reason is other.');
      return null;
    }
    return note === undefined ? { code: validCode } : { code: validCode, note };
  }

  async function authenticate(kind: 'signIn' | 'signUp') {
    if (!auth) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        kind === 'signIn'
          ? await auth.signIn({ email, password })
          : await auth.signUp({ email, password });
      if (result.requiresEmailConfirmation) setError('Check your email to finish signing up.');
      setSession(result.session);
      if (result.session) await refresh();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function run(
    action: () => Promise<{
      readonly status: string;
      readonly error?: { readonly code: string; readonly message: string };
    }>,
  ) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.status === 'conflict' && result.error?.code === 'repair_required')
        setError('A previous Life Day is still open. Repair it explicitly before waking.');
      else if (result.status !== 'accepted' && result.status !== 'duplicate_accepted')
        setError(result.error?.message ?? 'The command was not accepted.');
      await refresh();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <main>
        <p>Restoring your session…</p>
      </main>
    );
  if (!client || !auth || !reads || !lifeDays || !tasks)
    return (
      <main>
        <h1>Personal OS</h1>
        <p role="alert">{error ?? configuration.error ?? 'Local Supabase is not configured.'}</p>
      </main>
    );
  if (!session)
    return (
      <main>
        <section>
          <h1>Personal OS</h1>
          <p>Sign in to Today.</p>
          <label>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          <div>
            <button disabled={busy} onClick={() => authenticate('signIn')}>
              Sign in
            </button>
            <button disabled={busy} onClick={() => authenticate('signUp')}>
              Sign up
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </section>
      </main>
    );
  const active = snapshot?.lifeDay ?? null;
  return (
    <main>
      <section>
        <header>
          <div>
            <h1>Today</h1>
            <p>{session.user.email ?? 'Signed in'}</p>
          </div>
          <button disabled={busy} onClick={() => auth.signOut()}>
            Sign out
          </button>
        </header>
        {error && <p role="alert">{error}</p>}
        {!snapshot ? (
          <p>Loading Today…</p>
        ) : (
          <>
            <section>
              <h2>Life Day</h2>
              {active ? (
                <>
                  <p>
                    Active since {new Date(active.wokeAt).toLocaleString()} ({active.timezone}).
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        lifeDays.close({
                          metadata: {
                            operationId: crypto.randomUUID(),
                            deviceId: deviceId(),
                            schemaVersion: 1,
                            commandName: 'life_day.sleep',
                            baseRevision: active.revision,
                            clientOccurredAt: now(),
                            clientTimezone: timezone(),
                          },
                          payload: { lifeDayId: active.id, sleptAt: now(), timezone: timezone() },
                        }),
                      )
                    }
                  >
                    I’m Going to Sleep
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        lifeDays.repairPrevious({
                          metadata: {
                            operationId: crypto.randomUUID(),
                            deviceId: deviceId(),
                            schemaVersion: 1,
                            commandName: 'life_day.repair',
                            baseRevision: active.revision,
                            clientOccurredAt: now(),
                            clientTimezone: timezone(),
                          },
                          payload: {
                            lifeDayId: active.id,
                            sleptAt: now(),
                            timezone: timezone(),
                            reason: { code: 'forgot_to_record_sleep' },
                          },
                        }),
                      )
                    }
                  >
                    Repair previous Life Day
                  </button>
                </>
              ) : (
                <>
                  <p>No active Life Day.</p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        lifeDays.start({
                          metadata: {
                            operationId: crypto.randomUUID(),
                            deviceId: deviceId(),
                            schemaVersion: 1,
                            commandName: 'life_day.wake',
                            baseRevision: null,
                            clientOccurredAt: now(),
                            clientTimezone: timezone(),
                          },
                          payload: { wokeAt: now(), timezone: timezone() },
                        }),
                      )
                    }
                  >
                    I’m Awake
                  </button>
                </>
              )}
            </section>
            <section>
              <h2>Tasks</h2>
              {active && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!title.trim()) return;
                    run(() =>
                      tasks.create({
                        metadata: {
                          operationId: crypto.randomUUID(),
                          deviceId: deviceId(),
                          schemaVersion: 1,
                          commandName: 'task.create',
                          baseRevision: null,
                          clientOccurredAt: now(),
                          clientTimezone: timezone(),
                        },
                        payload: {
                          lifeDayId: active.id,
                          title,
                          description: null,
                          priority,
                          scheduledAt: null,
                          scheduledTimezone: null,
                          estimatedMinutes: estimate ? Number(estimate) : null,
                          position: snapshot.tasks.length,
                        },
                      }),
                    ).then(() => {
                      setTitle('');
                      setEstimate('');
                    });
                  }}
                >
                  <label>
                    New task
                    <input value={title} onChange={(event) => setTitle(event.target.value)} />
                  </label>
                  <label>
                    Priority
                    <select
                      value={priority}
                      onChange={(event) => {
                        if (isTaskPriority(event.target.value)) setPriority(event.target.value);
                      }}
                    >
                      <option value="non_negotiable">Non-negotiable</option>
                      <option value="progress">Progress</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </label>
                  <label>
                    Estimated minutes
                    <input
                      value={estimate}
                      onChange={(event) => setEstimate(event.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                  <button disabled={busy}>Create task</button>
                </form>
              )}
              {snapshot.tasks.length === 0 ? (
                <p>No tasks for this Life Day.</p>
              ) : (
                <ul>
                  {snapshot.tasks.map((task) => (
                    <li key={task.id}>
                      <strong>{task.title}</strong> — {task.priority}
                      {task.scheduledAt ? ` · ${new Date(task.scheduledAt).toLocaleString()}` : ''}
                      {task.estimatedMinutes ? ` · ${task.estimatedMinutes} min` : ''}
                      <p>Status: {task.status}</p>
                      {task.status !== 'completed' &&
                        task.status !== 'cancelled' &&
                        task.status !== 'archived' && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() =>
                                run(() =>
                                  tasks.complete({
                                    metadata: {
                                      operationId: crypto.randomUUID(),
                                      deviceId: deviceId(),
                                      schemaVersion: 1,
                                      commandName: 'task.complete',
                                      baseRevision: task.revision,
                                      clientOccurredAt: now(),
                                      clientTimezone: timezone(),
                                    },
                                    payload: {
                                      taskId: task.id,
                                      completedAt: now(),
                                      lifeDayId: active?.id ?? null,
                                    },
                                  }),
                                )
                              }
                            >
                              Complete
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => {
                                const reason = promptForTaskReason(
                                  'Cancellation reason: user_rescheduled, capacity_limit, external_change, no_longer_relevant, duplicate, or other',
                                );
                                if (!reason) return;
                                run(() =>
                                  tasks.cancel({
                                    metadata: {
                                      operationId: crypto.randomUUID(),
                                      deviceId: deviceId(),
                                      schemaVersion: 1,
                                      commandName: 'task.cancel',
                                      baseRevision: task.revision,
                                      clientOccurredAt: now(),
                                      clientTimezone: timezone(),
                                    },
                                    payload: {
                                      taskId: task.id,
                                      cancelledAt: now(),
                                      reason,
                                    },
                                  }),
                                );
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => {
                                const when = window.prompt('New scheduled time in ISO-8601 UTC');
                                const reason = promptForTaskReason(
                                  'Reschedule reason: user_rescheduled, capacity_limit, external_change, no_longer_relevant, duplicate, or other',
                                );
                                if (!when || !reason) return;
                                run(() =>
                                  tasks.reschedule({
                                    metadata: {
                                      operationId: crypto.randomUUID(),
                                      deviceId: deviceId(),
                                      schemaVersion: 1,
                                      commandName: 'task.reschedule',
                                      baseRevision: task.revision,
                                      clientOccurredAt: now(),
                                      clientTimezone: timezone(),
                                    },
                                    payload: {
                                      taskId: task.id,
                                      scheduledAt: when,
                                      scheduledTimezone: timezone(),
                                      reason,
                                    },
                                  }),
                                );
                              }}
                            >
                              Reschedule
                            </button>
                          </>
                        )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
