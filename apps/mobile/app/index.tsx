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
import { ianaTimeZoneSchema, userIdSchema, utcTimestampSchema } from '@personal-os/validation';
import * as Network from 'expo-network';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getDeviceId, getSupabaseClient } from '../lib/supabase';
import { createTodaySyncController, isReachableNetworkState } from '../lib/today-sync-runtime';
import type { MobileTodayState } from '../lib/today-sync-controller';
import { TodayForegroundLifecycle } from '../lib/today-foreground-lifecycle';
import { positionForTaskMove, type TaskMoveDirection } from '../lib/task-order';
import { generateMobileUuid } from '../lib/uuid';

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
  const [rescheduleTimezone, setRescheduleTimezone] = useState(timezone());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [retryableCount, setRetryableCount] = useState(0);
  const [pendingTaskIds, setPendingTaskIds] = useState<readonly string[]>([]);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [issueDetails, setIssueDetails] = useState<MobileTodayState['issueDetails']>([]);
  const [showIssueDetails, setShowIssueDetails] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const configuration = useMemo(() => {
    try {
      return { client: getSupabaseClient(), error: null };
    } catch (cause) {
      return { client: null, error: errorMessage(cause) };
    }
  }, []);
  const authenticatedUserId = useMemo(
    () => (session ? userIdSchema.parse(session.user.id) : null),
    [session?.user.id],
  );
  const activeUserIdRef = useRef<typeof authenticatedUserId>(null);
  activeUserIdRef.current = authenticatedUserId;
  const client = configuration.client;
  const auth = useMemo(() => client && createAuthAdapter(client), [client]);
  const reads = useMemo(() => client && createTodayReadAdapter(client), [client]);
  const lifeDays = useMemo(() => client && createLifeDayCommandAdapter(client), [client]);
  const tasks = useMemo(() => client && createTaskCommandAdapter(client), [client]);
  const localToday = useMemo(
    () =>
      client && reads && authenticatedUserId ? createTodaySyncController(client, reads) : null,
    [authenticatedUserId, client, reads],
  );

  const applyLocalState = (state: MobileTodayState) => {
    setSnapshot(state.snapshot);
    setPendingCount(state.pendingCount);
    setRetryableCount(state.retryableCount);
    setPendingTaskIds(state.pendingTaskIds);
    setSyncMessage(state.issue?.safeMessage ?? state.transientMessage);
    setIssueDetails(state.issueDetails);
  };

  const refresh = async () => {
    if (localToday && authenticatedUserId) {
      applyLocalState(await localToday.synchronizeWhenOnline(authenticatedUserId));
      return;
    }
    if (reads) setSnapshot(await reads.getTodaySnapshot());
  };
  const metadata = async (commandName: string, baseRevision: number | null) => ({
    operationId: generateMobileUuid(),
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
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => active && setLoading(false));
    const unsubscribe = auth.subscribe((next) => {
      if (active) {
        setSession(next);
        if (!next) {
          setSnapshot(null);
          setPendingCount(0);
          setRetryableCount(0);
          setPendingTaskIds([]);
          setSyncMessage(null);
          setIssueDetails([]);
          setShowIssueDetails(false);
        }
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  useEffect(() => {
    if (!authenticatedUserId || !localToday) return;
    let active = true;
    setSnapshot(null);
    setPendingCount(0);
    setRetryableCount(0);
    setPendingTaskIds([]);
    setSyncMessage(null);
    setIssueDetails([]);
    setShowIssueDetails(false);
    const applyIfActive = (state: MobileTodayState) => {
      if (active) applyLocalState(state);
    };
    const hydrate = async () => {
      try {
        applyIfActive(await localToday.restore(authenticatedUserId));
        applyIfActive(await localToday.synchronizeWhenOnline(authenticatedUserId));
      } catch (cause) {
        if (!active) return;
        try {
          if (reads) setSnapshot(await reads.getTodaySnapshot());
        } catch {
          setError(errorMessage(cause));
        }
      }
    };
    void hydrate();
    const subscription = Network.addNetworkStateListener((networkState) => {
      if (!isReachableNetworkState(networkState)) return;
      void localToday
        .synchronizeWhenOnline(authenticatedUserId)
        .then(applyIfActive)
        .catch((cause: unknown) => active && setError(errorMessage(cause)));
    });
    const foregroundLifecycle = new TodayForegroundLifecycle({
      appState: AppState,
      userId: authenticatedUserId,
      isSessionCurrent: () => active && activeUserIdRef.current === authenticatedUserId,
      reconcile: (userId) => localToday.reconcileAfterForeground(userId),
      onState: applyIfActive,
      onError: (cause) => active && setError(errorMessage(cause)),
    });
    foregroundLifecycle.start();
    return () => {
      active = false;
      subscription.remove();
      foregroundLifecycle.dispose();
      localToday.stop();
    };
  }, [authenticatedUserId, localToday, reads]);

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
      if (!result.session && result.requiresEmailConfirmation)
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
  const validReschedule = () => {
    const scheduled = utcTimestampSchema.safeParse(scheduledAt);
    const selectedTimezone = ianaTimeZoneSchema.safeParse(rescheduleTimezone.trim());
    if (!scheduled.success || !selectedTimezone.success) return null;
    return { scheduledAt: scheduled.data, scheduledTimezone: selectedTimezone.data };
  };

  const queueTaskCreate = async (
    dayId: NonNullable<TodaySnapshot['lifeDay']>['id'],
    position: number,
    scheduled: string | null,
  ) => {
    if (!localToday || !authenticatedUserId) return null;
    const result = await localToday.createTask(authenticatedUserId, {
      metadata: await metadata('task.create', null),
      payload: {
        lifeDayId: dayId,
        title,
        description: description || null,
        priority,
        scheduledAt: scheduled,
        scheduledTimezone: scheduled ? timezone() : null,
        estimatedMinutes: estimate ? Number(estimate) : null,
        position,
      },
    });
    if (result.status === 'queued') applyLocalState(result.state);
    else if (result.status === 'rejected') setError(result.message);
    return result;
  };

  const queueTaskCompletion = async (
    task: TodayTaskRead,
    lifeDayId: TodayTaskRead['lifeDayId'],
  ) => {
    if (!localToday || !authenticatedUserId) return null;
    const result = await localToday.completeTask(authenticatedUserId, {
      metadata: await metadata('task.complete', task.revision),
      payload: {
        taskId: task.id,
        completedAt: now(),
        lifeDayId,
      },
    });
    if (result.status === 'queued') applyLocalState(result.state);
    else if (result.status === 'rejected') setError(result.message);
    return result;
  };

  const queueTaskUpdate = async (
    task: TodayTaskRead,
    lifeDayId: TodayTaskRead['lifeDayId'],
    scheduled: string | null,
  ) => {
    if (!localToday || !authenticatedUserId) return null;
    const result = await localToday.updateTask(authenticatedUserId, {
      metadata: await metadata('task.update', task.revision),
      payload: {
        taskId: task.id,
        lifeDayId,
        title,
        description: description || null,
        status:
          task.status === 'in_progress'
            ? 'in_progress'
            : task.status === 'overdue'
              ? 'overdue'
              : 'planned',
        priority,
        scheduledAt: scheduled,
        scheduledTimezone: scheduled ? timezone() : null,
        estimatedMinutes: estimate ? Number(estimate) : null,
        position: task.position,
      },
    });
    if (result.status === 'queued') applyLocalState(result.state);
    else if (result.status === 'rejected') setError(result.message);
    return result;
  };

  const queueTaskReorder = async (task: TodayTaskRead, position: number) => {
    if (!localToday || !authenticatedUserId) return null;
    const result = await localToday.reorderTask(authenticatedUserId, {
      metadata: await metadata('task.reorder', task.revision),
      payload: { taskId: task.id, position },
    });
    if (result.status === 'queued') applyLocalState(result.state);
    else if (result.status === 'rejected') setError(result.message);
    return result;
  };

  const queueTaskReopen = async (
    task: TodayTaskRead,
    lifeDayId: NonNullable<TodaySnapshot['lifeDay']>['id'],
  ) => {
    if (!localToday || !authenticatedUserId) return null;
    const result = await localToday.reopenTask(authenticatedUserId, {
      metadata: await metadata('task.reopen', task.revision),
      payload: { taskId: task.id, lifeDayId },
    });
    if (result.status === 'queued') applyLocalState(result.state);
    else if (result.status === 'rejected') setError(result.message);
    return result;
  };

  const queueTaskCancellation = async (task: TodayTaskRead) => {
    if (!localToday || !authenticatedUserId) return null;
    const note = reasonNote.trim();
    const result = await localToday.cancelTask(authenticatedUserId, {
      metadata: await metadata('task.cancel', task.revision),
      payload: {
        taskId: task.id,
        cancelledAt: now(),
        reason: { code: reasonCode, ...(note ? { note } : {}) },
      },
    });
    if (result.status === 'queued') applyLocalState(result.state);
    else if (result.status === 'rejected') setError(result.message);
    return result;
  };

  const queueTaskReschedule = async (
    task: TodayTaskRead,
    scheduled: { readonly scheduledAt: string; readonly scheduledTimezone: string },
  ) => {
    if (!localToday || !authenticatedUserId) return null;
    const note = reasonNote.trim();
    const result = await localToday.rescheduleTask(authenticatedUserId, {
      metadata: await metadata('task.reschedule', task.revision),
      payload: {
        taskId: task.id,
        scheduledAt: scheduled.scheduledAt,
        scheduledTimezone: scheduled.scheduledTimezone,
        reason: { code: reasonCode, ...(note ? { note } : {}) },
      },
    });
    if (result.status === 'queued') applyLocalState(result.state);
    else if (result.status === 'rejected') setError(result.message);
    return result;
  };

  const signOut = async () => {
    if (!auth || !authenticatedUserId) return;
    setBusy(true);
    setError(null);
    try {
      if (localToday) await localToday.stopAndClear(authenticatedUserId);
      await auth.signOut();
      setSession(null);
      setSnapshot(null);
      setPendingCount(0);
      setRetryableCount(0);
      setPendingTaskIds([]);
      setSyncMessage(null);
      setIssueDetails([]);
      setShowIssueDetails(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const runRecoveryAction = (actionToRun: () => Promise<MobileTodayState>) => {
    setSyncBusy(true);
    setError(null);
    void actionToRun()
      .then(applyLocalState)
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setSyncBusy(false));
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

  const visibleSnapshot =
    snapshot !== null && snapshot.profile.id === authenticatedUserId ? snapshot : null;
  const day = visibleSnapshot?.lifeDay ?? null;
  const maxPosition = Math.max(-1, ...(visibleSnapshot?.tasks.map((task) => task.position) ?? []));
  const unresolved =
    visibleSnapshot?.tasks.filter(
      (task) => task.status === 'planned' || task.status === 'in_progress',
    ) ?? [];

  const createOrEdit = () => {
    if (!day || !title.trim()) return;
    const scheduled = validScheduledAt();
    if (scheduledAt && scheduled === null) {
      setError('Use an ISO-8601 date and time or leave it empty for flexible work.');
      return;
    }
    if (editing) {
      setBusy(true);
      setError(null);
      void queueTaskUpdate(editing, day.id, scheduled)
        .then((result) => {
          if (result?.status === 'queued') clearTaskForm();
          if (result?.status !== 'unavailable') return;
          return run(async () =>
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
          ).then((onlineResult) => {
            if (onlineResult?.status === 'accepted') clearTaskForm();
          });
        })
        .catch((cause: unknown) => setError(errorMessage(cause)))
        .finally(() => setBusy(false));
    } else {
      setBusy(true);
      setError(null);
      void queueTaskCreate(day.id, maxPosition + 1, scheduled)
        .then((result) => {
          if (result?.status === 'queued') clearTaskForm();
          if (result?.status !== 'unavailable') return;
          return run(async () =>
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
          ).then((onlineResult) => {
            if (onlineResult?.status === 'accepted') clearTaskForm();
          });
        })
        .catch((cause: unknown) => setError(errorMessage(cause)))
        .finally(() => setBusy(false));
    }
  };

  const moveTask = (task: TodayTaskRead, direction: TaskMoveDirection) => {
    if (!visibleSnapshot) return;
    const position = positionForTaskMove(visibleSnapshot.tasks, task.id, direction);
    if (position === null) return;
    setBusy(true);
    setError(null);
    void queueTaskReorder(task, position)
      .then((result) => {
        if (result?.status !== 'unavailable') return;
        return run(async () =>
          tasks.reorder({
            metadata: await metadata('task.reorder', task.revision),
            payload: { taskId: task.id, position },
          }),
        );
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
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
      setBusy(true);
      setError(null);
      void queueTaskCancellation(action.task)
        .then((result) => {
          if (result?.status === 'queued') {
            setAction(null);
            return;
          }
          if (result?.status !== 'unavailable') return;
          return run(async () =>
            tasks.cancel({
              metadata: await metadata('task.cancel', action.task.revision),
              payload: {
                taskId: action.task.id,
                cancelledAt: now(),
                reason: {
                  code: reasonCode,
                  ...(reasonNote.trim() ? { note: reasonNote.trim() } : {}),
                },
              },
            }),
          ).then((onlineResult) => {
            if (onlineResult?.status === 'accepted') setAction(null);
          });
        })
        .catch((cause: unknown) => setError(errorMessage(cause)))
        .finally(() => setBusy(false));
      return;
    }
    const scheduled = validReschedule();
    if (!scheduled) {
      setError(
        'Rescheduling requires an ISO-8601 timestamp with an offset and a valid IANA timezone.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    void queueTaskReschedule(action.task, scheduled)
      .then((result) => {
        if (result?.status === 'queued') {
          setAction(null);
          return;
        }
        if (result?.status !== 'unavailable') return;
        return run(async () =>
          tasks.reschedule({
            metadata: await metadata('task.reschedule', action.task.revision),
            payload: {
              taskId: action.task.id,
              scheduledAt: scheduled.scheduledAt,
              scheduledTimezone: scheduled.scheduledTimezone,
              reason: {
                code: reasonCode,
                ...(reasonNote.trim() ? { note: reasonNote.trim() } : {}),
              },
            },
          }),
        ).then((onlineResult) => {
          if (onlineResult?.status === 'accepted') setAction(null);
        });
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{plannerMode ? 'Planner Mode' : 'Today'}</Text>
      <Text>{session.user.email ?? 'Signed in'}</Text>
      <Button
        disabled={busy || syncBusy}
        onPress={() => setPlannerMode((current) => !current)}
        title={plannerMode ? 'Exit Planner Mode' : 'Enter Planner Mode'}
      />
      <Button disabled={busy || syncBusy} onPress={signOut} title="Sign out" />
      <Button
        disabled={busy || syncBusy || !localToday || !authenticatedUserId}
        onPress={() =>
          localToday && authenticatedUserId
            ? runRecoveryAction(() => localToday.refreshToday(authenticatedUserId))
            : undefined
        }
        title={syncBusy ? 'Refreshing…' : 'Refresh Today'}
      />
      {retryableCount > 0 && (
        <Button
          disabled={busy || syncBusy || !localToday || !authenticatedUserId}
          onPress={() =>
            localToday && authenticatedUserId
              ? runRecoveryAction(() => localToday.retryPending(authenticatedUserId))
              : undefined
          }
          title={syncBusy ? 'Retrying…' : 'Retry pending changes'}
        />
      )}
      {pendingCount > 0 && (
        <Text accessibilityLabel={`${pendingCount} changes pending sync`} style={styles.pending}>
          Pending sync ({pendingCount})
        </Text>
      )}
      {syncMessage && (
        <Text accessibilityRole="alert" style={styles.error}>
          Sync needs attention: {syncMessage}
        </Text>
      )}
      {issueDetails.length > 0 && (
        <>
          <Button
            disabled={busy || syncBusy}
            onPress={() => setShowIssueDetails((shown) => !shown)}
            title={showIssueDetails ? 'Hide sync details' : 'Show sync details'}
          />
          {showIssueDetails && (
            <View style={styles.card}>
              <Text style={styles.heading}>Sync details</Text>
              {issueDetails.map((detail, index) => (
                <View
                  key={`${detail.operationType}-${detail.createdAt}-${index}`}
                  style={styles.details}
                >
                  <Text>{detail.operationType}</Text>
                  <Text>{detail.classification}</Text>
                  <Text>
                    {detail.safeErrorCode}: {detail.safeMessage}
                  </Text>
                  <Text>Created {new Date(detail.createdAt).toLocaleString()}</Text>
                  <Text>Attempts: {detail.attemptCount}</Text>
                  {detail.nextRetryAt && (
                    <Text>Next retry: {new Date(detail.nextRetryAt).toLocaleString()}</Text>
                  )}
                  {detail.blockedByPrerequisite && (
                    <Text>Blocked by an earlier queued change.</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </>
      )}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {!visibleSnapshot ? (
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
          {visibleSnapshot.tasks.map((task) => (
            <View key={task.id} style={styles.card}>
              {pendingTaskIds.includes(task.id) && <Text style={styles.pending}>Pending sync</Text>}
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
                  onPress={() => {
                    setBusy(true);
                    setError(null);
                    void queueTaskCompletion(task, day?.id ?? null)
                      .then((result) => {
                        if (result?.status !== 'unavailable') return;
                        return run(async () =>
                          tasks.complete({
                            metadata: await metadata('task.complete', task.revision),
                            payload: {
                              taskId: task.id,
                              completedAt: now(),
                              lifeDayId: day?.id ?? null,
                            },
                          }),
                        );
                      })
                      .catch((cause: unknown) => setError(errorMessage(cause)))
                      .finally(() => setBusy(false));
                  }}
                  title="Complete"
                />
              )}
              {plannerMode && task.status === 'completed' && day && (
                <Button
                  disabled={busy}
                  onPress={() => {
                    setBusy(true);
                    setError(null);
                    void queueTaskReopen(task, day.id)
                      .then((result) => {
                        if (result?.status !== 'unavailable') return;
                        return run(async () =>
                          tasks.reopen({
                            metadata: await metadata('task.reopen', task.revision),
                            payload: { taskId: task.id, lifeDayId: day.id },
                          }),
                        );
                      })
                      .catch((cause: unknown) => setError(errorMessage(cause)))
                      .finally(() => setBusy(false));
                  }}
                  title="Reopen"
                />
              )}
              {plannerMode && !['completed', 'cancelled', 'archived'].includes(task.status) && (
                <View style={styles.actions}>
                  <View style={styles.row}>
                    <Button
                      disabled={
                        busy || positionForTaskMove(visibleSnapshot.tasks, task.id, 'up') === null
                      }
                      onPress={() => moveTask(task, 'up')}
                      title="Move Up"
                    />
                    <Button
                      disabled={
                        busy || positionForTaskMove(visibleSnapshot.tasks, task.id, 'down') === null
                      }
                      onPress={() => moveTask(task, 'down')}
                      title="Move Down"
                    />
                  </View>
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
                    disabled={busy || pendingTaskIds.includes(task.id)}
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
                  {['planned', 'overdue'].includes(task.status) && (
                    <Button
                      disabled={busy}
                      onPress={() => {
                        setScheduledAt(task.scheduledAt ?? '');
                        setRescheduleTimezone(task.scheduledTimezone ?? timezone());
                        setAction({ task, kind: 'reschedule' });
                      }}
                      title="Reschedule"
                    />
                  )}
                  <Button
                    disabled={busy || pendingTaskIds.includes(task.id)}
                    onPress={() => setAction({ task, kind: 'overdue' })}
                    title="Keep overdue"
                  />
                  {['planned', 'in_progress'].includes(task.status) && (
                    <Button
                      disabled={busy}
                      onPress={() => setAction({ task, kind: 'cancel' })}
                      title="Cancel"
                    />
                  )}
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
                <>
                  <TextInput
                    accessibilityLabel="Reschedule ISO time"
                    onChangeText={setScheduledAt}
                    placeholder="ISO-8601 timestamp, e.g. 2026-07-30T09:00:00Z"
                    style={styles.input}
                    value={scheduledAt}
                  />
                  <TextInput
                    accessibilityLabel="Reschedule IANA timezone"
                    autoCapitalize="none"
                    onChangeText={setRescheduleTimezone}
                    placeholder="IANA timezone, e.g. Asia/Karachi"
                    style={styles.input}
                    value={rescheduleTimezone}
                  />
                </>
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
  details: { gap: 4 },
  heading: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  input: { borderColor: '#777', borderWidth: 1, padding: 10 },
  pending: { color: '#7a4b00', fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  taskTitle: { fontSize: 16, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '700' },
});
