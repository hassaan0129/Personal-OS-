import {
  createAuthAdapter,
  createLifeDayCommandAdapter,
  createTaskCommandAdapter,
  createTodayReadAdapter,
  type AuthSession,
} from '@personal-os/api-client';
import type { TodaySnapshot } from '@personal-os/database-contracts';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getDeviceId, getSupabaseClient } from '../lib/supabase';

const now = () => new Date().toISOString();
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function TodayScreen() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [title, setTitle] = useState('');
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
      if (active) setSession(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

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
      else if (result.requiresEmailConfirmation) setError('Check your email to finish signing up.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const run = async (
    action: () => Promise<{
      readonly status: string;
      readonly error?: { readonly message: string };
    }>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.status !== 'accepted' && result.status !== 'duplicate_accepted')
        setError(result.error?.message ?? 'The command was not accepted.');
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
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
        <Text accessibilityRole="header" style={styles.title}>
          Personal OS
        </Text>
        <Text>{error ?? configuration.error ?? 'Local Supabase is not configured.'}</Text>
      </View>
    );
  if (!session)
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>
          Personal OS
        </Text>
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
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Today
      </Text>
      <Text>{session.user.email ?? 'Signed in'}</Text>
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
                      metadata: {
                        operationId: globalThis.crypto.randomUUID(),
                        deviceId: await getDeviceId(),
                        schemaVersion: 1,
                        commandName: 'life_day.sleep',
                        baseRevision: day.revision,
                        clientOccurredAt: now(),
                        clientTimezone: timezone(),
                      },
                      payload: { lifeDayId: day.id, sleptAt: now(), timezone: timezone() },
                    }),
                  )
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
                      metadata: {
                        operationId: globalThis.crypto.randomUUID(),
                        deviceId: await getDeviceId(),
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
                title="I’m Awake"
              />
            </>
          )}
          <Text style={styles.heading}>Tasks</Text>
          {day && (
            <>
              <TextInput
                accessibilityLabel="New task"
                onChangeText={setTitle}
                placeholder="New task"
                style={styles.input}
                value={title}
              />
              <Button
                disabled={busy || !title.trim()}
                onPress={() =>
                  run(async () =>
                    tasks.create({
                      metadata: {
                        operationId: globalThis.crypto.randomUUID(),
                        deviceId: await getDeviceId(),
                        schemaVersion: 1,
                        commandName: 'task.create',
                        baseRevision: null,
                        clientOccurredAt: now(),
                        clientTimezone: timezone(),
                      },
                      payload: {
                        lifeDayId: day.id,
                        title,
                        description: null,
                        priority: 'progress',
                        scheduledAt: null,
                        scheduledTimezone: null,
                        estimatedMinutes: null,
                        position: snapshot.tasks.length,
                      },
                    }),
                  ).then(() => setTitle(''))
                }
                title="Create task"
              />
            </>
          )}
          {snapshot.tasks.map((task) => (
            <View key={task.id} style={styles.task}>
              <Text>
                {task.title} · {task.priority}
              </Text>
              <Text>
                {task.status}
                {task.estimatedMinutes ? ` · ${task.estimatedMinutes} min` : ''}
              </Text>
              {task.status === 'planned' && (
                <Button
                  disabled={busy}
                  onPress={() =>
                    run(async () =>
                      tasks.complete({
                        metadata: {
                          operationId: globalThis.crypto.randomUUID(),
                          deviceId: await getDeviceId(),
                          schemaVersion: 1,
                          commandName: 'task.complete',
                          baseRevision: task.revision,
                          clientOccurredAt: now(),
                          clientTimezone: timezone(),
                        },
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
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 24 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  error: { color: '#a00' },
  heading: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  input: { borderColor: '#777', borderWidth: 1, padding: 10 },
  task: { borderColor: '#ddd', borderWidth: 1, gap: 4, padding: 12 },
  title: { fontSize: 28, fontWeight: '700' },
});
