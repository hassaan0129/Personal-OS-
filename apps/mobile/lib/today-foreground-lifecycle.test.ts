import { userIdSchema } from '@personal-os/validation';
import { describe, expect, it } from 'vitest';

import {
  TodayForegroundLifecycle,
  type AppStateSource,
  type MobileAppState,
} from './today-foreground-lifecycle';

const userId = userIdSchema.parse('11111111-1111-4111-8111-111111111111');

class FakeAppState implements AppStateSource {
  public currentState: MobileAppState | null = 'background';
  public removed = false;
  private listener: ((state: MobileAppState) => void) | null = null;

  public addEventListener(
    _event: 'change',
    listener: (state: MobileAppState) => void,
  ): { remove(): void } {
    this.listener = listener;
    return { remove: () => (this.removed = true) };
  }

  public emit(state: MobileAppState): void {
    this.listener?.(state);
  }
}

describe('TodayForegroundLifecycle', () => {
  it('reconciles once for a background-to-active transition and ignores repeated active events', async () => {
    const appState = new FakeAppState();
    const reconciled: string[] = [];
    const applied: string[] = [];
    const lifecycle = new TodayForegroundLifecycle({
      appState,
      userId,
      isSessionCurrent: () => true,
      reconcile: async () => {
        reconciled.push('reconciled');
        return 'state';
      },
      onState: (state) => applied.push(state),
      onError: () => undefined,
    });

    lifecycle.start();
    appState.emit('active');
    appState.emit('active');
    await Promise.resolve();
    await Promise.resolve();

    expect(reconciled).toEqual(['reconciled']);
    expect(applied).toEqual(['state']);
  });

  it('does not reconcile an old account and removes the listener on dispose', async () => {
    const appState = new FakeAppState();
    const reconciled: string[] = [];
    const applied: string[] = [];
    const lifecycle = new TodayForegroundLifecycle({
      appState,
      userId,
      isSessionCurrent: () => false,
      reconcile: async () => {
        reconciled.push('old user');
        return 'state';
      },
      onState: (state) => applied.push(state),
      onError: () => undefined,
    });

    lifecycle.start();
    appState.emit('active');
    await Promise.resolve();
    lifecycle.dispose();
    appState.emit('background');
    appState.emit('active');
    await Promise.resolve();

    expect(reconciled).toEqual([]);
    expect(applied).toEqual([]);
    expect(appState.removed).toBe(true);
  });

  it('does not apply a stale asynchronous reconciliation result after unmount', async () => {
    const appState = new FakeAppState();
    let release!: () => void;
    const applied: string[] = [];
    const lifecycle = new TodayForegroundLifecycle({
      appState,
      userId,
      isSessionCurrent: () => true,
      reconcile: () =>
        new Promise<string>((resolve) => {
          release = () => resolve('state');
        }),
      onState: (state) => applied.push(state),
      onError: () => undefined,
    });

    lifecycle.start();
    appState.emit('active');
    await Promise.resolve();
    lifecycle.dispose();
    release();
    await Promise.resolve();
    await Promise.resolve();

    expect(applied).toEqual([]);
  });
});
