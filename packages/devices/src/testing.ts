import type {
  DeviceAdapter,
  DeviceLifecycleState,
  DeviceNetworkStatus,
  DevicePlatformInfo,
} from "./contracts";

export type TestDeviceController = {
  adapter: DeviceAdapter;
  emitLifecycle(state: DeviceLifecycleState): void;
  emitLink(url: string): void;
  emitNetwork(status: DeviceNetworkStatus): void;
  storage: Map<string, string>;
};

export const createTestDeviceAdapter = (
  options: {
    launchUrl?: string | null;
    lifecycle?: DeviceLifecycleState;
    network?: DeviceNetworkStatus;
    platform?: Partial<DevicePlatformInfo>;
  } = {},
): TestDeviceController => {
  let lifecycleState = options.lifecycle ?? "active";
  let networkStatus = options.network ?? {
    connected: true,
    connectionType: "wifi",
  };
  const lifecycleListeners = new Set<(state: DeviceLifecycleState) => void>();
  const linkListeners = new Set<(url: string) => void>();
  const networkListeners = new Set<(status: DeviceNetworkStatus) => void>();
  const values = new Map<string, string>();
  const adapter: DeviceAdapter = {
    runtime: "test",
    platform: {
      getInfo: async () => ({
        formFactor: "phone",
        isNative: false,
        os: "unknown",
        runtime: "test",
        ...options.platform,
      }),
    },
    lifecycle: {
      getState: async () => lifecycleState,
      onChange: async (listener) => {
        lifecycleListeners.add(listener);
        return () => {
          lifecycleListeners.delete(listener);
        };
      },
    },
    links: {
      getLaunchUrl: async () => options.launchUrl ?? null,
      onOpen: async (listener) => {
        linkListeners.add(listener);
        return () => {
          linkListeners.delete(listener);
        };
      },
      openExternal: async () => undefined,
    },
    network: {
      getStatus: async () => networkStatus,
      onChange: async (listener) => {
        networkListeners.add(listener);
        return () => {
          networkListeners.delete(listener);
        };
      },
    },
    storage: {
      clear: async () => values.clear(),
      get: async (key) => values.get(key) ?? null,
      keys: async () => [...values.keys()],
      remove: async (key) => {
        values.delete(key);
      },
      set: async (key, value) => {
        values.set(key, value);
      },
    },
  };

  return {
    adapter,
    emitLifecycle: (state) => {
      lifecycleState = state;
      for (const listener of lifecycleListeners) listener(state);
    },
    emitLink: (url) => {
      for (const listener of linkListeners) listener(url);
    },
    emitNetwork: (status) => {
      networkStatus = status;
      for (const listener of networkListeners) listener(status);
    },
    storage: values,
  };
};
