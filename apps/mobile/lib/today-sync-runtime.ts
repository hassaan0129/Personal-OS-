import type { RpcClient } from '@personal-os/api-client';
import { createRpcOutboxTransport, MobileOutboxProcessor } from './outbox-processor';
import { taskIdSchema } from '@personal-os/validation';
import * as Network from 'expo-network';

import { LocalCommandEngine } from './local-command-engine';
import {
  clearUserLocalData,
  createLocalCommandRepository,
  createLocalOutboxRepository,
  initializeLocalStore,
  makeRetryableOperationsDue,
  mergeAuthoritativeTodaySnapshot,
  readCachedSnapshot,
  readLocalOutboxPresentation,
  replaceCachedSnapshot,
} from './local-store';
import { TodaySyncController, type TodaySnapshotReader } from './today-sync-controller';
import { generateMobileUuid } from './uuid';

function isOnline(): Promise<boolean> {
  return Network.getNetworkStateAsync().then(
    (state) => state.isConnected === true && state.isInternetReachable !== false,
  );
}

/** Creates one short-lived controller for an authenticated mobile session. */
export function createTodaySyncController(
  client: RpcClient,
  reader: TodaySnapshotReader,
): TodaySyncController {
  const commandRepository = createLocalCommandRepository();
  const engine = new LocalCommandEngine({
    repository: commandRepository,
    now: () => new Date().toISOString(),
    temporaryTaskId: () => taskIdSchema.parse(generateMobileUuid()),
  });

  return new TodaySyncController({
    cache: {
      initialize: initializeLocalStore,
      readSnapshot: readCachedSnapshot,
      replaceSnapshot: replaceCachedSnapshot,
      mergeAuthoritativeSnapshot: mergeAuthoritativeTodaySnapshot,
      readPresentation: readLocalOutboxPresentation,
      makeRetryableOperationsDue,
      clearUserData: clearUserLocalData,
    },
    engine,
    processor: new MobileOutboxProcessor(
      createLocalOutboxRepository(),
      createRpcOutboxTransport(client),
    ),
    reader,
    isOnline,
  });
}

export function isReachableNetworkState(state: Network.NetworkState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}
