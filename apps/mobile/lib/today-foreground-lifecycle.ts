import type { UserId } from '@personal-os/domain';

export type MobileAppState = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export interface AppStateSubscription {
  remove(): void;
}

export interface AppStateSource {
  readonly currentState: MobileAppState | null;
  addEventListener(
    event: 'change',
    listener: (state: MobileAppState) => void,
  ): AppStateSubscription;
}

export interface TodayForegroundLifecycleDependencies<State> {
  readonly appState: AppStateSource;
  readonly userId: UserId;
  readonly isSessionCurrent: () => boolean;
  readonly reconcile: (userId: UserId) => Promise<State>;
  readonly onState: (state: State) => void;
  readonly onError: (error: unknown) => void;
}

/**
 * Runs one guarded reconciliation when this authenticated app session returns
 * to the foreground. It owns no product state and never starts a polling loop.
 */
export class TodayForegroundLifecycle<State> {
  private currentState: MobileAppState;
  private subscription: AppStateSubscription | null = null;
  private disposed = false;
  private reconciliation: Promise<void> | null = null;

  public constructor(private readonly dependencies: TodayForegroundLifecycleDependencies<State>) {
    this.currentState = dependencies.appState.currentState ?? 'unknown';
  }

  public start(): void {
    if (this.subscription !== null || this.disposed) return;
    this.subscription = this.dependencies.appState.addEventListener('change', (nextState) => {
      const previousState = this.currentState;
      this.currentState = nextState;
      if (nextState !== 'active' || previousState === 'active') return;
      void this.reconcileOnce();
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.subscription?.remove();
    this.subscription = null;
  }

  private async reconcileOnce(): Promise<void> {
    if (this.disposed || this.reconciliation !== null || !this.dependencies.isSessionCurrent())
      return;
    const reconciliation = (async () => {
      try {
        const state = await this.dependencies.reconcile(this.dependencies.userId);
        if (!this.disposed && this.dependencies.isSessionCurrent())
          this.dependencies.onState(state);
      } catch (error) {
        if (!this.disposed && this.dependencies.isSessionCurrent())
          this.dependencies.onError(error);
      }
    })();
    this.reconciliation = reconciliation;
    try {
      await reconciliation;
    } finally {
      if (this.reconciliation === reconciliation) this.reconciliation = null;
    }
  }
}
