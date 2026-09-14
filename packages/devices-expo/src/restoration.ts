import type {
  DeviceRestoredOperation,
  DeviceSubscription,
} from "@absolutejs/devices";

/** Internal optional-capability hook; kept separate to avoid eager native imports. */
export const EXPO_RESTORED_OPERATION_SOURCE: unique symbol = Symbol.for(
  "@absolutejs/devices-expo/restored-operation-source",
) as never;

export type ExpoRestoredOperationSource = {
  [EXPO_RESTORED_OPERATION_SOURCE](): Promise<DeviceRestoredOperation | null>;
};

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

export const createExpoRestoredOperationLifecycle = (
  value: unknown,
  enabled: boolean,
): {
  onRestoredOperation(
    listener: (operation: DeviceRestoredOperation) => void,
  ): Promise<DeviceSubscription>;
} => {
  const source = expoRestoredOperationSource(value);
  const listeners = new Map<
    (operation: DeviceRestoredOperation) => void,
    boolean
  >();
  let restored: DeviceRestoredOperation | null | undefined;
  let read: Promise<void> | undefined;
  const start = () =>
    (read ??= (async () => {
      restored = enabled && source ? await takeExpoRestoredOperation(source) : null;
      if (!restored) return;
      for (const [listener, delivered] of listeners) {
        if (delivered) continue;
        listeners.set(listener, true);
        listener(restored);
      }
    })());

  return {
    onRestoredOperation: async (listener) => {
      listeners.set(listener, false);
      void start();
      if (restored) {
        listeners.set(listener, true);
        queueMicrotask(() => {
          if (listeners.has(listener)) listener(restored!);
        });
      }
      return async () => {
        listeners.delete(listener);
      };
    },
  };
};
