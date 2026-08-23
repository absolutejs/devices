import type {
  DeviceAdapter,
  DeviceBackEvent,
  DeviceLifecycleState,
  DeviceNetworkStatus,
  DevicePermissionCapability,
  DevicePermissionStatus,
  DevicePlatformInfo,
  DeviceRestoredOperation,
} from "./contracts";
import { availableCapability } from "./capabilities";
export * from "./conformance";

export type TestDeviceController = {
  adapter: DeviceAdapter;
  emitBack(event?: DeviceBackEvent): void;
  emitLifecycle(state: DeviceLifecycleState): void;
  emitLink(url: string): void;
  emitNetwork(status: DeviceNetworkStatus): void;
  emitRestoredOperation(operation: DeviceRestoredOperation): void;
  openedExternalUrls: string[];
  secureStorage: Map<string, string>;
  storage: Map<string, string>;
};

export type TestPermissionController = {
  permission: DevicePermissionCapability;
  readonly requests: number;
  setStatus(status: DevicePermissionStatus): void;
};

export const createTestPermission = (
  initial: DevicePermissionStatus = { canRequest: true, state: "prompt" },
  requested: DevicePermissionStatus = {
    canRequest: false,
    state: "granted",
  },
): TestPermissionController => {
  let status = initial;
  let requests = 0;
  const controller: TestPermissionController = {
    permission: {
      queryPermission: async () => status,
      requestPermission: async () => {
        requests += 1;
        status = requested;
        return status;
      },
    },
    get requests() {
      return requests;
    },
    setStatus: (next) => {
      status = next;
    },
  };

  return controller;
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
  const resumeListeners = new Set<() => void>();
  const restoredListeners = new Set<
    (operation: DeviceRestoredOperation) => void
  >();
  const backListeners = new Set<(event: DeviceBackEvent) => void>();
  const linkListeners = new Set<(url: string) => void>();
  const networkListeners = new Set<(status: DeviceNetworkStatus) => void>();
  const values = new Map<string, string>();
  const secureValues = new Map<string, string>();
  const openedExternalUrls: string[] = [];
  const adapter: DeviceAdapter = {
    runtime: "test",
    back: {
      capability: async () => availableCapability("emulated"),
      onPress: async (listener) => {
        backListeners.add(listener);
        return () => {
          backListeners.delete(listener);
        };
      },
    },
    platform: {
      getInfo: async () => ({
        formFactor: "phone",
        isNative: false,
        os: "unknown",
        prefersReducedMotion: false,
        runtime: "test",
        safeAreaInsets: { bottom: 0, left: 0, right: 0, top: 0 },
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
      onRestoredOperation: async (listener) => {
        restoredListeners.add(listener);
        return () => {
          restoredListeners.delete(listener);
        };
      },
      onResume: async (listener) => {
        resumeListeners.add(listener);
        return () => {
          resumeListeners.delete(listener);
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
      openExternal: async (url) => {
        openedExternalUrls.push(url);
      },
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
    secureStorage: {
      capability: async () => availableCapability("emulated"),
      clear: async () => secureValues.clear(),
      get: async (key) => secureValues.get(key) ?? null,
      keys: async () => [...secureValues.keys()],
      remove: async (key) => {
        secureValues.delete(key);
      },
      set: async (key, value) => {
        secureValues.set(key, value);
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
    emitBack: (event = { canGoBack: false }) => {
      for (const listener of backListeners) listener(event);
    },
    emitLifecycle: (state) => {
      lifecycleState = state;
      for (const listener of lifecycleListeners) listener(state);
      if (state === "active")
        for (const listener of resumeListeners) listener();
    },
    emitLink: (url) => {
      for (const listener of linkListeners) listener(url);
    },
    emitNetwork: (status) => {
      networkStatus = status;
      for (const listener of networkListeners) listener(status);
    },
    emitRestoredOperation: (operation) => {
      for (const listener of restoredListeners) listener(operation);
    },
    openedExternalUrls,
    secureStorage: secureValues,
    storage: values,
  };
};
