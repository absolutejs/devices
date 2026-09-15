import type {
  DeviceRestoredOperation,
  DeviceSubscription,
} from "@absolutejs/devices";

/** Internal optional-capability hook; kept separate to avoid eager native imports. */
export const EXPO_RESTORED_OPERATION_SOURCE: unique symbol = Symbol.for(
  "@absolutejs/devices-expo/restored-operation-source",
) as never;

export const EXPO_ABANDONED_OPERATION_SOURCE: unique symbol = Symbol.for(
  "@absolutejs/devices-expo/abandoned-operation-source",
) as never;

export type ExpoRestoredOperationSource = {
  [EXPO_RESTORED_OPERATION_SOURCE](): Promise<DeviceRestoredOperation | null>;
  [EXPO_ABANDONED_OPERATION_SOURCE]?(): Promise<DeviceRestoredOperation | null>;
};

const RESTORATION_POLL_INTERVAL_MS = 250;
const RESTORATION_POLL_ATTEMPTS = 120;

const delay = (durationMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, durationMs));

export const expoRestoredOperationSource = (
  value: unknown,
): ExpoRestoredOperationSource | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const source = value as Partial<ExpoRestoredOperationSource>;
  return typeof source[EXPO_RESTORED_OPERATION_SOURCE] === "function"
    ? (source as ExpoRestoredOperationSource)
    : undefined;
};

export const takeExpoRestoredOperation = (value: unknown) =>
  expoRestoredOperationSource(value)?.[EXPO_RESTORED_OPERATION_SOURCE]() ??
  Promise.resolve(null);

const takeAbandonedExpoOperation = (value: unknown) => {
  const source = expoRestoredOperationSource(value);
  return source?.[EXPO_ABANDONED_OPERATION_SOURCE]?.() ?? Promise.resolve(null);
};

export const createExpoRestoredOperationLifecycle = (
  value: unknown,
  enabled: boolean,
  timing: {
    pollAttempts?: number;
    pollIntervalMs?: number;
  } = {},
): {
  check(): Promise<void>;
  onRestoredOperation(
    listener: (operation: DeviceRestoredOperation) => void,
  ): Promise<DeviceSubscription>;
} => {
  const pollAttempts = timing.pollAttempts ?? RESTORATION_POLL_ATTEMPTS;
  const pollIntervalMs = timing.pollIntervalMs ?? RESTORATION_POLL_INTERVAL_MS;
  const source = expoRestoredOperationSource(value);
  const listeners = new Map<
    (operation: DeviceRestoredOperation) => void,
    boolean
  >();
  let restored: DeviceRestoredOperation | null | undefined;
  let read: Promise<void> | undefined;
  let polling: Promise<void> | undefined;
  const deliver = () => {
    if (!restored) return;
    for (const [listener, delivered] of listeners) {
      if (delivered) continue;
      listeners.set(listener, true);
      listener(restored);
    }
  };
  const start = () => {
    if (restored) {
      deliver();
      return Promise.resolve();
    }
    return (read ??= (async () => {
      restored =
        enabled && source ? await takeExpoRestoredOperation(source) : null;
      deliver();
    })().finally(() => {
      read = undefined;
    }));
  };
  const startRecoveryWindow = () =>
    (polling ??= (async () => {
      for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        await start();
        if (restored || listeners.size === 0) return;
        await delay(pollIntervalMs);
      }
      if (!restored && listeners.size > 0) {
        restored =
          enabled && source ? await takeAbandonedExpoOperation(source) : null;
        deliver();
      }
    })().finally(() => {
      polling = undefined;
    }));

  return {
    check: start,
    onRestoredOperation: async (listener) => {
      listeners.set(listener, false);
      void startRecoveryWindow();
      return async () => {
        listeners.delete(listener);
      };
    },
  };
};
