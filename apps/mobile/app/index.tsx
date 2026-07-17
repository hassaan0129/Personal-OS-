import {
  createAuthAdapter,
  createLifeDayCommandAdapter,
  createTaskCommandAdapter,
  createTodayReadAdapter,
  type AuthSession,
} from '@personal-os/api-client';
import type { TodaySnapshot, TodayTaskRead } from '@personal-os/database-contracts';
import {
  taskPriorities,
  taskReasonCodes,
  type TaskPriority,
  type TaskReasonCode,
} from '@personal-os/domain';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getDeviceId, getSupabaseClient } from '../lib/supabase';

type PlannerAction = 'cancel' | 'reschedule' | 'overdue';

const now = () => new Date().toISOString();
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const isTaskReasonCode = (value: string): value is TaskReasonCode =>
  taskReasonCodes.includes(value as TaskReasonCode);

export default function TodayScreen() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('progress');
  const [estimate, setEstimate] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [plannerMode, setPlannerMode] = useState(false);
  const [editing, setEditing] = useState<TodayTaskRead | null>(null);
  const [action, setAction] = useState<{
    readonly task: TodayTaskRead;
    readonly kind: PlannerAction;
  } | null>(null);
  const [reasonCode, setReasonCode] = useState<TaskReasonCode>('capacity_limit');
  const [reasonNote, setReasonNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configuration = useMemo(() => {
    try {
      return { client: getSupabaseClient(), error: null };
    } catch (cause) {
      return { client: null, error: errorMessage(cause) };
    }
  }, []);
  const client = configuration.client;
  const auth = useMemo(() => client && createAuthAdapter(client), [client]);
  const reads = useMemo(() => client && createTodayReadAdapter(client), [client]);
  const lifeDays = useMemo(() => client && createLifeDayCommandAdapter(client), [client]);
  const tasks = useMemo(() => client && createTaskCommandAdapter(client), [client]);

  const refresh = async () => {
    if (reads) setSnapshot(await reads.getTodaySnapshot());
  };
  const metadata = async (commandName: string, baseRevision: number | null) => ({
    operationId: globalThis.crypto.randomUUID(),
    deviceId: await getDeviceId(),
    schemaVersion: 1,
    commandName,
    baseRevision,
    clientOccurredAt: now(),
    clientTimezone: timezone(),
  });

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
        if (!next) setSnapshot(null);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  const run = async (
    command: () => Promise<{
      readonly status: string;
      readonly error?: { readonly code: string; readonly message: string };
    }>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const result = await command();
      if (result.status === 'conflict' && result.error?.code === 'revision_conflict')
        setError('This item changed. The latest Today state was loaded.');
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
  };

  const authenticate = async (kind: 'signIn' | 'signUp') => {
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
        setError('Confirm the account through local Mailpit, then sign in.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const clearTaskForm = () => {
    setTitle('');
    setDescription('');
    setPriority('progress');
    setEstimate('');
    setScheduledAt('');
    setEditing(null);
  };
  const validScheduledAt = () => {
    if (!scheduledAt) return null;
    const date = new Date(scheduledAt);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
  };

  if (loading)
    return (
      <View style={styles.center}>
        <Text>Restoring your session…</Text>
        <StatusBar style="auto" />
      </View>
    );
  if (!client || !auth || !reads || !lifeDays || !tasks)
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Personal OS</Text>
        <Text>{error ?? configuration.error ?? 'Local Supabase is not configured.'}</Text>
      </View>
    );
  if (!session)
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Personal OS</Text>
        <Text>Sign in to Today.</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          style={styles.input}
          value={email}
        />
        <TextInput
          accessibilityLabel="Password"
          autoCapitalize="none"
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <Button disabled={busy} onPress={() => authenticate('signIn')} title="Sign in" />
        <Button disabled={busy} onPress={() => authenticate('signUp')} title="Sign up" />
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
      </ScrollView>
    );

  const day = snapshot?.lifeDay ?? null;
  const maxPosition = Math.max(-1, ...(snapshot?.tasks.map((task) => task.position) ?? []));
  const unresolved =
    snapshot?.tasks.filter((task) => task.status === 'planned' || task.status === 'in_progress') ??
    [];

  const createOrEdit = () => {
    if (!day || !title.trim()) return;
    const scheduled = validScheduledAt();
    if (scheduledAt && scheduled === null) {
      setError('Use an ISO-8601 date and time or leave it empty for flexible work.');
      return;
    }
    if (editing) {
      run(async () =>
        tasks.update({
          metadata: await metadata('task.update', editing.revision),
          payload: {
            taskId: editing.id,
            lifeDayId: day.id,
            title,
            description: description || null,
            status:
              editing.status === 'in_progress'
                ? 'in_progress'
                : editing.status === 'overdue'
                  ? 'overdue'
                  : 'planned',
            priority,
            scheduledAt: scheduled,
            scheduledTimezone: scheduled ? timezone() : null,
            estimatedMinutes: estimate ? Number(estimate) : null,
            position: editing.position,
          },
        }),
      ).then((result) => {
        if (result?.status === 'accepted') clearTaskForm();
      });
    } else {
      run(async () =>
        tasks.create({
          metadata: await metadata('task.create', null),
          payload: {
            lifeDayId: day.id,
            title,
            description: description || null,
            priority,
            scheduledAt: scheduled,
            scheduledTimezone: scheduled ? timezone() : null,
            estimatedMinutes: estimate ? Number(estimate) : null,
            position: maxPosition + 1,
          },
        }),
      ).then((result) => {
        if (result?.status === 'accepted') clearTaskForm();
      });
    }
  };

  const performAction = () => {
    if (!action) return;
    if (action.kind === 'overdue') {
      run(async () =>
        tasks.resolveUnfinished({
          metadata: await metadata('task.resolve_unfinished', action.task.revision),
          payload: { taskId: action.task.id, resolution: 'overdue' },
        }),
      ).then((result) => {
        if (result?.status === 'accepted') setAction(null);
      });
      return;
    }
    if (!isTaskReasonCode(reasonCode) || (reasonCode === 'other' && !reasonNote.trim())) {
      setError('Choose a reason and explain other.');
      return;
    }
    if (action.kind === 'cancel') {
      run(async () =>
        tasks.cancel({
          metadata: await metadata('task.cancel', action.task.revision),
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
    const scheduled = validScheduledAt();
    if (!scheduled) {
      setError('Rescheduling requires an ISO-8601 date and time.');
      return;
    }
    run(async () =>
      tasks.resolveUnfinished({
        metadata: await metadata('task.resolve_unfinished', action.task.revision),
        payload: {
          taskId: action.task.id,
          resolution: 'reschedule',
          targetLifeDayId: null,
          scheduledAt: scheduled,
          scheduledTimezone: timezone(),
          reason: { code: reasonCode, ...(reasonNote.trim() ? { note: reasonNote.trim() } : {}) },
        },
      }),
    ).then((result) => {
      if (result?.status === 'accepted') setAction(null);
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{plannerMode ? 'Planner Mode' : 'Today'}</Text>
      <Text>{session.user.email ?? 'Signed in'}</Text>
      <Button
        disabled={busy}
        onPress={() => setPlannerMode((current) => !current)}
        title={plannerMode ? 'Exit Planner Mode' : 'Enter Planner Mode'}
      />
      <Button disabled={busy} onPress={() => auth.signOut()} title="Sign out" />
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {!snapshot ? (
        <Text>Loading Today…</Text>
      ) : (
        <>
          <Text style={styles.heading}>Life Day</Text>
          {day ? (
            <>
              <Text>Active since {new Date(day.wokeAt).toLocaleString()}</Text>
              <Button
                disabled={busy}
                onPress={() =>
                  run(async () =>
                    lifeDays.close({
                      metadata: await metadata('life_day.sleep', day.revision),
                      payload: { lifeDayId: day.id, sleptAt: now(), timezone: timezone() },
                    }),
                  ).then((result) => {
                    if (result?.error?.code === 'unresolved_tasks') setPlannerMode(true);
                  })
                }
                title="I’m Going to Sleep"
              />
            </>
          ) : (
            <>
              <Text>No active Life Day.</Text>
              <Button
                disabled={busy}
                onPress={() =>
                  run(async () =>
                    lifeDays.start({
                      metadata: await metadata('life_day.wake', null),
                      payload: { wokeAt: now(), timezone: timezone() },
                    }),
                  )
                }
                title="I’m Awake"
              />
            </>
          )}
          {day && plannerMode && (
            <View style={styles.card}>
              <Text style={styles.heading}>{editing ? 'Edit task' : 'Create task'}</Text>
              <TextInput
                accessibilityLabel="Task title"
                onChangeText={setTitle}
                placeholder="Task title"
                style={styles.input}
                value={title}
              />
              <TextInput
                accessibilityLabel="Task description"
                multiline
                onChangeText={setDescription}
                placeholder="Optional description"
                style={styles.input}
                value={description}
              />
              <Text>Priority</Text>
              <View style={styles.row}>
                {taskPriorities.map((candidate) => (
                  <Button
                    key={candidate}
                    disabled={busy || priority === candidate}
                    onPress={() => setPriority(candidate)}
                    title={candidate.replace('_', ' ')}
                  />
                ))}
              </View>
              <TextInput
                accessibilityLabel="Estimated minutes"
                keyboardType="numeric"
                onChangeText={setEstimate}
                placeholder="Estimated minutes"
                style={styles.input}
                value={estimate}
              />
              <TextInput
                accessibilityLabel="Scheduled ISO time"
                onChangeText={setScheduledAt}
                placeholder="Optional ISO time (flexible if empty)"
                style={styles.input}
                value={scheduledAt}
              />
              <Button
                disabled={busy || !title.trim()}
                onPress={createOrEdit}
                title={editing ? 'Save task' : 'Create task'}
              />
              {editing && <Button disabled={busy} onPress={clearTaskForm} title="Cancel editing" />}
            </View>
          )}
          <Text style={styles.heading}>
            {plannerMode ? 'All Life Day tasks' : 'Execution tasks'}
          </Text>
          {snapshot.tasks.map((task) => (
            <View key={task.id} style={styles.card}>
              <Text style={styles.taskTitle}>
                {task.title}
                {task.isTopThree ? ' · Top 3' : ''}
              </Text>
              <Text>
                {task.status} · {task.priority}
                {task.estimatedMinutes ? ` · ${task.estimatedMinutes} min` : ''}
              </Text>
              <Text>
                {task.scheduledAt ? new Date(task.scheduledAt).toLocaleString() : 'Flexible'}
              </Text>
              {!['completed', 'cancelled', 'archived'].includes(task.status) && (
                <Button
                  disabled={busy}
                  onPress={() =>
                    run(async () =>
                      tasks.complete({
                        metadata: await metadata('task.complete', task.revision),
                        payload: {
                          taskId: task.id,
                          completedAt: now(),
                          lifeDayId: day?.id ?? null,
                        },
                      }),
                    )
                  }
                  title="Complete"
                />
              )}
              {plannerMode && !['completed', 'cancelled', 'archived'].includes(task.status) && (
                <View style={styles.actions}>
                  <Button
                    disabled={busy}
                    onPress={() => {
                      setEditing(task);
                      setTitle(task.title);
                      setDescription(task.description ?? '');
                      setPriority(task.priority);
                      setEstimate(task.estimatedMinutes?.toString() ?? '');
                      setScheduledAt(task.scheduledAt ?? '');
                    }}
                    title="Edit"
                  />
                  <Button
                    disabled={busy}
                    onPress={() =>
                      run(async () =>
                        tasks.setTopThree({
                          metadata: await metadata('task.set_top_three', task.revision),
                          payload: { taskId: task.id, isTopThree: !task.isTopThree },
                        }),
                      )
                    }
                    title={task.isTopThree ? 'Remove Top 3' : 'Make Top 3'}
                  />
                  <Button
                    disabled={busy}
                    onPress={() => setAction({ task, kind: 'reschedule' })}
                    title="Reschedule"
                  />
                  <Button
                    disabled={busy}
                    onPress={() => setAction({ task, kind: 'overdue' })}
                    title="Keep overdue"
                  />
                  <Button
                    disabled={busy}
                    onPress={() => setAction({ task, kind: 'cancel' })}
                    title="Cancel"
                  />
                </View>
              )}
            </View>
          ))}
          {plannerMode && unresolved.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.heading}>Before sleep</Text>
              <Text>
                Resolve each planned or in-progress task by rescheduling, keeping it overdue, or
                cancelling with a reason.
              </Text>
            </View>
          )}
          {action && (
            <View style={styles.card}>
              <Text style={styles.heading}>
                {action.kind === 'overdue'
                  ? 'Keep overdue'
                  : action.kind === 'cancel'
                    ? 'Cancel task'
                    : 'Reschedule task'}
                : {action.task.title}
              </Text>
              {action.kind === 'reschedule' && (
                <TextInput
                  accessibilityLabel="Reschedule ISO time"
                  onChangeText={setScheduledAt}
                  placeholder="ISO date and time"
                  style={styles.input}
                  value={scheduledAt}
                />
              )}
              {action.kind !== 'overdue' && (
                <>
                  <Text>Reason</Text>
                  <View style={styles.row}>
                    {taskReasonCodes.map((candidate) => (
                      <Button
                        key={candidate}
                        disabled={busy || reasonCode === candidate}
                        onPress={() => setReasonCode(candidate)}
                        title={candidate.replace('_', ' ')}
                      />
                    ))}
                  </View>
                  {reasonCode === 'other' && (
                    <TextInput
                      accessibilityLabel="Reason note"
                      onChangeText={setReasonNote}
                      placeholder="Explain other"
                      style={styles.input}
                      value={reasonNote}
                    />
                  )}
                </>
              )}
              <Button disabled={busy} onPress={performAction} title="Confirm" />
              <Button disabled={busy} onPress={() => setAction(null)} title="Back" />
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 6 },
  card: { borderColor: '#d9e2dc', borderWidth: 1, gap: 8, padding: 12 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  container: { gap: 12, padding: 24 },
  error: { color: '#a00' },
  heading: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  input: { borderColor: '#777', borderWidth: 1, padding: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  taskTitle: { fontSize: 16, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '700' },
});
