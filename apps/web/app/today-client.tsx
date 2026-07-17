'use client';

import {
  createAuthAdapter,
  createLifeDayCommandAdapter,
  createTaskCommandAdapter,
  createTodayReadAdapter,
  type AuthSession,
} from '@personal-os/api-client';
import { parseWebEnvironment, requireSupabasePublicConfiguration } from '@personal-os/config';
import type { TodaySnapshot, TodayTaskRead } from '@personal-os/database-contracts';
import {
  groupPlannerTasks,
  taskPriorities,
  taskReasonCodes,
  type TaskPriority,
  type TaskReasonCode,
} from '@personal-os/domain';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { getWebSupabaseClient } from '../lib/supabase';

type TaskActionKind = 'cancel' | 'reschedule' | 'overdue';

interface TaskFormState {
  readonly title: string;
  readonly description: string;
  readonly priority: TaskPriority;
  readonly estimate: string;
  readonly isScheduled: boolean;
  readonly scheduledAt: string;
}

const emptyTaskForm: TaskFormState = {
  title: '',
  description: '',
  priority: 'progress',
  estimate: '',
  isScheduled: false,
  scheduledAt: '',
};

const now = () => new Date().toISOString();
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function deviceId() {
  const key = 'personal-os-device-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  window.localStorage.setItem(key, value);
  return value;
}

function toLocalDateTime(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toUtcDateTime(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function reasonIsValid(code: TaskReasonCode, note: string): boolean {
  return code !== 'other' || Boolean(note.trim());
}

function taskFormFrom(task: TodayTaskRead): TaskFormState {
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    estimate: task.estimatedMinutes?.toString() ?? '',
    isScheduled: task.scheduledAt !== null,
    scheduledAt: toLocalDateTime(task.scheduledAt),
  };
}

function isEditable(task: TodayTaskRead): boolean {
  return !['completed', 'cancelled', 'archived'].includes(task.status);
}

export default function TodayClient({
  initialPlannerMode = false,
}: {
  readonly initialPlannerMode?: boolean;
}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [plannerMode, setPlannerMode] = useState(initialPlannerMode);
  const [newTask, setNewTask] = useState<TaskFormState>(emptyTaskForm);
  const [editing, setEditing] = useState<TodayTaskRead | null>(null);
  const [editTask, setEditTask] = useState<TaskFormState>(emptyTaskForm);
  const [action, setAction] = useState<{
    readonly task: TodayTaskRead;
    readonly kind: TaskActionKind;
  } | null>(null);
  const [reasonCode, setReasonCode] = useState<TaskReasonCode>('capacity_limit');
  const [reasonNote, setReasonNote] = useState('');
  const [rescheduleAt, setRescheduleAt] = useState('');

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
      return { value: null, error: errorMessage(cause) };
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
    if (reads) setSnapshot(await reads.getTodaySnapshot());
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
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => active && setLoading(false));
    const unsubscribe = auth.subscribe((next) => {
      if (active) {
        setSession(next);
        if (next === null) setSnapshot(null);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  async function run(
    command: () => Promise<{
      readonly status: string;
      readonly error?: { readonly code: string; readonly message: string };
    }>,
  ) {
    setBusy(true);
    setError(null);
    try {
      const result = await command();
      if (result.status === 'conflict' && result.error?.code === 'repair_required')
        setError('A previous Life Day is still open. Repair it explicitly before waking.');
      else if (result.status === 'conflict' && result.error?.code === 'revision_conflict')
        setError(
          'This item changed. Today was refreshed; review the latest version before retrying.',
        );
      else if (result.status !== 'accepted' && result.status !== 'duplicate_accepted')
        setError(result.error?.message ?? 'The command was not accepted.');
      await refresh();
      return result;
    } catch (cause) {
      setError(errorMessage(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function metadata(commandName: string, baseRevision: number | null) {
    return {
      operationId: crypto.randomUUID(),
      deviceId: deviceId(),
      schemaVersion: 1,
      commandName,
      baseRevision,
      clientOccurredAt: now(),
      clientTimezone: timezone(),
    };
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
      setSession(result.session);
      if (result.session) await refresh();
      else if (result.requiresEmailConfirmation)
        setError('Check local Mailpit to confirm your email before signing in.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <main className="app-shell">
        <p>Restoring your session…</p>
      </main>
    );
  if (!client || !auth || !reads || !lifeDays || !tasks)
    return (
      <main className="app-shell">
        <p role="alert">{error ?? configuration.error ?? 'Local Supabase is not configured.'}</p>
      </main>
    );
  const taskCommands = tasks;
  if (!session)
    return (
      <main className="app-shell auth-shell">
        <section className="panel auth-panel">
          <p className="eyebrow">Personal OS</p>
          <h1>Sign in to Today</h1>
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
          <div className="button-row">
            <button disabled={busy} onClick={() => authenticate('signIn')}>
              Sign in
            </button>
            <button className="secondary" disabled={busy} onClick={() => authenticate('signUp')}>
              Sign up
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
      </main>
    );

  const day = snapshot?.lifeDay ?? null;
  const groups = groupPlannerTasks(snapshot?.tasks ?? []);
  const maxPosition = Math.max(-1, ...(snapshot?.tasks.map((task) => task.position) ?? []));
  const unresolved = groups.unresolved;

  function createTask() {
    if (!day || !newTask.title.trim()) return;
    const scheduledAt = newTask.isScheduled ? toUtcDateTime(newTask.scheduledAt) : null;
    if (newTask.isScheduled && scheduledAt === null) {
      setError('Choose a valid scheduled date and time.');
      return;
    }
    run(() =>
      taskCommands.create({
        metadata: metadata('task.create', null),
        payload: {
          lifeDayId: day.id,
          title: newTask.title,
          description: newTask.description || null,
          priority: newTask.priority,
          scheduledAt,
          scheduledTimezone: scheduledAt === null ? null : timezone(),
          estimatedMinutes: newTask.estimate ? Number(newTask.estimate) : null,
          position: maxPosition + 1,
        },
      }),
    ).then((result) => {
      if (result?.status === 'accepted') setNewTask(emptyTaskForm);
    });
  }

  function saveEdit() {
    if (!editing || !day || !editTask.title.trim()) return;
    const scheduledAt = editTask.isScheduled ? toUtcDateTime(editTask.scheduledAt) : null;
    if (editTask.isScheduled && scheduledAt === null) {
      setError('Choose a valid scheduled date and time.');
      return;
    }
    run(() =>
      taskCommands.update({
        metadata: metadata('task.update', editing.revision),
        payload: {
          taskId: editing.id,
          lifeDayId: day.id,
          title: editTask.title,
          description: editTask.description || null,
          status:
            editing.status === 'in_progress'
              ? 'in_progress'
              : editing.status === 'overdue'
                ? 'overdue'
                : 'planned',
          priority: editTask.priority,
          scheduledAt,
          scheduledTimezone: scheduledAt === null ? null : timezone(),
          estimatedMinutes: editTask.estimate ? Number(editTask.estimate) : null,
          position: editing.position,
        },
      }),
    ).then((result) => {
      if (result?.status === 'accepted') setEditing(null);
    });
  }

  function resolveAction() {
    if (!action) return;
    if (action.kind === 'overdue') {
      run(() =>
        taskCommands.resolveUnfinished({
          metadata: metadata('task.resolve_unfinished', action.task.revision),
          payload: { taskId: action.task.id, resolution: 'overdue' },
        }),
      ).then((result) => {
        if (result?.status === 'accepted') setAction(null);
      });
      return;
    }
    if (!reasonIsValid(reasonCode, reasonNote)) {
      setError('Add a note when the reason is other.');
      return;
    }
    if (action.kind === 'cancel') {
      run(() =>
        taskCommands.cancel({
          metadata: metadata('task.cancel', action.task.revision),
          payload: {
            taskId: action.task.id,
            cancelledAt: now(),
            reason: { code: reasonCode, ...(reasonNote.trim() ? { note: reasonNote.trim() } : {}) },
          },
        }),
      ).then((result) => {
        if (result?.status === 'accepted') setAction(null);
      });
      return;
    }
    const scheduledAt = toUtcDateTime(rescheduleAt);
    if (scheduledAt === null) {
      setError('Choose a future date and time for rescheduling.');
      return;
    }
    run(() =>
      taskCommands.resolveUnfinished({
        metadata: metadata('task.resolve_unfinished', action.task.revision),
        payload: {
          taskId: action.task.id,
          resolution: 'reschedule',
          targetLifeDayId: null,
          scheduledAt,
          scheduledTimezone: timezone(),
          reason: { code: reasonCode, ...(reasonNote.trim() ? { note: reasonNote.trim() } : {}) },
        },
      }),
    ).then((result) => {
      if (result?.status === 'accepted') setAction(null);
    });
  }

  function taskRow(task: TodayTaskRead, showPlannerControls: boolean) {
    const currentIndex = snapshot?.tasks.findIndex((candidate) => candidate.id === task.id) ?? -1;
    const before = snapshot?.tasks[currentIndex - 1];
    const after = snapshot?.tasks[currentIndex + 1];
    return (
      <article className="task-card" key={task.id}>
        <div className="task-heading">
          <div>
            <h3>{task.title}</h3>
            <p>
              {task.priority.replace('_', ' ')} · {task.status}
              {task.isTopThree ? ' · Top 3' : ''}
            </p>
          </div>
          <span>r{task.revision}</span>
        </div>
        {task.description && <p>{task.description}</p>}
        <p className="task-meta">
          {task.scheduledAt
            ? `Scheduled ${new Date(task.scheduledAt).toLocaleString()}`
            : 'Flexible'}
          {task.estimatedMinutes ? ` · ${task.estimatedMinutes} min` : ''}
        </p>
        <div className="button-row">
          {isEditable(task) && (
            <button
              disabled={busy}
              onClick={() =>
                run(() =>
                  taskCommands.complete({
                    metadata: metadata('task.complete', task.revision),
                    payload: { taskId: task.id, completedAt: now(), lifeDayId: day?.id ?? null },
                  }),
                )
              }
            >
              Complete
            </button>
          )}
          {task.status === 'completed' && day && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                run(() =>
                  taskCommands.reopen({
                    metadata: metadata('task.reopen', task.revision),
                    payload: { taskId: task.id, lifeDayId: day.id },
                  }),
                )
              }
            >
              Move back to planned
            </button>
          )}
          {showPlannerControls && isEditable(task) && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(task);
                  setEditTask(taskFormFrom(task));
                }}
              >
                Edit
              </button>
              <button
                className="secondary"
                disabled={busy || before === undefined}
                onClick={() =>
                  before &&
                  run(() =>
                    taskCommands.reorder({
                      metadata: metadata('task.reorder', task.revision),
                      payload: { taskId: task.id, position: before.position - 0.5 },
                    }),
                  )
                }
              >
                ↑
              </button>
              <button
                className="secondary"
                disabled={busy || after === undefined}
                onClick={() =>
                  after &&
                  run(() =>
                    taskCommands.reorder({
                      metadata: metadata('task.reorder', task.revision),
                      payload: { taskId: task.id, position: after.position + 0.5 },
                    }),
                  )
                }
              >
                ↓
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    taskCommands.setTopThree({
                      metadata: metadata('task.set_top_three', task.revision),
                      payload: { taskId: task.id, isTopThree: !task.isTopThree },
                    }),
                  )
                }
              >
                {task.isTopThree ? 'Remove Top 3' : 'Make Top 3'}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setAction({ task, kind: 'reschedule' });
                  setRescheduleAt(toLocalDateTime(task.scheduledAt));
                }}
              >
                Reschedule
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => setAction({ task, kind: 'cancel' })}
              >
                Cancel
              </button>
            </>
          )}
        </div>
        {action?.task.id === task.id && (
          <section className="action-panel">
            <h4>
              {action.kind === 'overdue'
                ? 'Keep overdue'
                : action.kind === 'cancel'
                  ? 'Cancel task'
                  : 'Reschedule task'}
            </h4>
            {action.kind === 'reschedule' && (
              <label>
                New date and time
                <input
                  type="datetime-local"
                  value={rescheduleAt}
                  onChange={(event) => setRescheduleAt(event.target.value)}
                />
              </label>
            )}
            {action.kind !== 'overdue' && (
              <>
                <label>
                  Reason
                  <select
                    value={reasonCode}
                    onChange={(event) => setReasonCode(event.target.value as TaskReasonCode)}
                  >
                    {taskReasonCodes.map((code) => (
                      <option key={code} value={code}>
                        {code.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                {reasonCode === 'other' && (
                  <label>
                    Explanation
                    <input
                      value={reasonNote}
                      onChange={(event) => setReasonNote(event.target.value)}
                    />
                  </label>
                )}
              </>
            )}
            <div className="button-row">
              <button disabled={busy} onClick={resolveAction}>
                {action.kind === 'overdue'
                  ? 'Keep overdue'
                  : action.kind === 'cancel'
                    ? 'Cancel task'
                    : 'Confirm reschedule'}
              </button>
              <button className="secondary" disabled={busy} onClick={() => setAction(null)}>
                Back
              </button>
            </div>
          </section>
        )}
      </article>
    );
  }

  return (
    <main className="app-shell">
      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              Personal OS · {plannerMode ? 'Planner Mode' : 'Execution Mode'}
            </p>
            <h1>{plannerMode ? 'Plan this Life Day' : 'Today'}</h1>
            <p>{session.user.email ?? 'Signed in'}</p>
          </div>
          <div className="button-row">
            <a className="link-button" href={plannerMode ? '/' : '/planner'}>
              {plannerMode ? 'Execution Mode' : 'Planner Mode'}
            </a>
            <button className="secondary" disabled={busy} onClick={() => auth.signOut()}>
              Sign out
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!snapshot ? (
          <p>Loading Today…</p>
        ) : (
          <>
            <section className="panel life-day-panel">
              <div>
                <p className="eyebrow">Life Day</p>
                {day ? (
                  <>
                    <h2>Active since {new Date(day.wokeAt).toLocaleString()}</h2>
                    <p>{day.timezone}</p>
                  </>
                ) : (
                  <>
                    <h2>No active Life Day</h2>
                    <p>Start one before planning tasks.</p>
                  </>
                )}
              </div>
              {day ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      lifeDays.close({
                        metadata: metadata('life_day.sleep', day.revision),
                        payload: { lifeDayId: day.id, sleptAt: now(), timezone: timezone() },
                      }),
                    ).then((result) => {
                      if (result?.error?.code === 'unresolved_tasks') setPlannerMode(true);
                    })
                  }
                >
                  I’m Going to Sleep
                </button>
              ) : (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      lifeDays.start({
                        metadata: metadata('life_day.wake', null),
                        payload: { wokeAt: now(), timezone: timezone() },
                      }),
                    )
                  }
                >
                  I’m Awake
                </button>
              )}
            </section>
            {day && plannerMode && (
              <section className="panel">
                <p className="eyebrow">Planner Mode</p>
                <h2>Create task</h2>
                <TaskFields value={newTask} onChange={setNewTask} />
                <button disabled={busy || !newTask.title.trim()} onClick={createTask}>
                  Create task
                </button>
              </section>
            )}
            {editing && (
              <section className="panel">
                <p className="eyebrow">Planner Mode</p>
                <h2>Edit {editing.title}</h2>
                <TaskFields value={editTask} onChange={setEditTask} />
                <div className="button-row">
                  <button disabled={busy || !editTask.title.trim()} onClick={saveEdit}>
                    Save task
                  </button>
                  <button className="secondary" disabled={busy} onClick={() => setEditing(null)}>
                    Cancel editing
                  </button>
                </div>
              </section>
            )}
            {!plannerMode && (
              <div className="today-grid">
                <TaskSection
                  title="Top 3"
                  empty="No active Top 3 tasks."
                  tasks={groups.topThree}
                  render={(task) => taskRow(task, false)}
                />
                <TaskSection
                  title="Scheduled timeline"
                  empty="No scheduled tasks."
                  tasks={groups.scheduled}
                  render={(task) => taskRow(task, false)}
                />
                <TaskSection
                  title="Flexible tasks"
                  empty="No flexible tasks."
                  tasks={groups.flexible}
                  render={(task) => taskRow(task, false)}
                />
                <TaskSection
                  title="Overdue"
                  empty="Nothing overdue."
                  tasks={groups.overdue}
                  render={(task) => taskRow(task, false)}
                />
                <TaskSection
                  title="Completed"
                  empty="Nothing completed yet."
                  tasks={groups.completed}
                  render={(task) => taskRow(task, false)}
                />
              </div>
            )}
            {plannerMode && (
              <section className="panel">
                <p className="eyebrow">All tasks</p>
                <h2>Arrange and resolve</h2>
                {snapshot.tasks.length === 0 ? (
                  <p>No tasks for this Life Day.</p>
                ) : (
                  snapshot.tasks.map((task) => taskRow(task, true))
                )}
              </section>
            )}
            {day && unresolved.length > 0 && plannerMode && (
              <section className="panel resolution-panel">
                <p className="eyebrow">Before sleep</p>
                <h2>
                  Resolve {unresolved.length} unfinished task{unresolved.length === 1 ? '' : 's'}
                </h2>
                <p>
                  Each planned or in-progress task must be rescheduled, kept overdue, or cancelled
                  before this Life Day can close.
                </p>
                {unresolved.map((task) => (
                  <div className="resolve-row" key={task.id}>
                    <span>{task.title}</span>
                    <div className="button-row">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          setAction({ task, kind: 'reschedule' });
                          setRescheduleAt(toLocalDateTime(task.scheduledAt));
                        }}
                      >
                        Reschedule
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => setAction({ task, kind: 'overdue' })}
                      >
                        Keep overdue
                      </button>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => setAction({ task, kind: 'cancel' })}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function TaskFields({
  value,
  onChange,
}: {
  readonly value: TaskFormState;
  readonly onChange: (value: TaskFormState) => void;
}) {
  return (
    <div className="task-fields">
      <label>
        Title
        <input
          value={value.title}
          onChange={(event) => onChange({ ...value, title: event.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </label>
      <label>
        Priority
        <select
          value={value.priority}
          onChange={(event) => onChange({ ...value, priority: event.target.value as TaskPriority })}
        >
          {taskPriorities.map((priority) => (
            <option key={priority} value={priority}>
              {priority.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label>
        Estimated minutes
        <input
          inputMode="numeric"
          value={value.estimate}
          onChange={(event) => onChange({ ...value, estimate: event.target.value })}
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={value.isScheduled}
          onChange={(event) => onChange({ ...value, isScheduled: event.target.checked })}
        />
        Scheduled task
      </label>
      {value.isScheduled && (
        <label>
          Scheduled date and time
          <input
            type="datetime-local"
            value={value.scheduledAt}
            onChange={(event) => onChange({ ...value, scheduledAt: event.target.value })}
          />
        </label>
      )}
    </div>
  );
}

function TaskSection({
  title,
  empty,
  tasks,
  render,
}: {
  readonly title: string;
  readonly empty: string;
  readonly tasks: readonly TodayTaskRead[];
  readonly render: (task: TodayTaskRead) => ReactNode;
}) {
  return (
    <section className="panel">
      <p className="eyebrow">Today</p>
      <h2>{title}</h2>
      {tasks.length === 0 ? <p>{empty}</p> : tasks.map(render)}
    </section>
  );
}
