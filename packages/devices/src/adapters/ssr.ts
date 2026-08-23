import {
  DeviceError,
  type DeviceAdapter,
  type DeviceSubscription,
} from "../contracts";

const noopSubscription = (): DeviceSubscription => () => undefined;
const unavailable = (capability: string) =>
  new DeviceError(
    "unavailable",
    `${capability} is unavailable during server rendering.`,
  );

export const createSsrDeviceAdapter = (): DeviceAdapter => ({
  runtime: "ssr",
  platform: {
    getInfo: async () => ({
      formFactor: "unknown",
      isNative: false,
      os: "unknown",
      prefersReducedMotion: false,
      runtime: "ssr",
      safeAreaInsets: { bottom: 0, left: 0, right: 0, top: 0 },
    }),
  },
  lifecycle: {
    getState: async () => "inactive",
    onChange: async () => noopSubscription(),
    onRestoredOperation: async () => noopSubscription(),
    onResume: async () => noopSubscription(),
  },
  links: {
    getLaunchUrl: async () => null,
    onOpen: async () => noopSubscription(),
    openExternal: async () => {
      throw unavailable("External links");
    },
  },
  network: {
    getStatus: async () => ({ connected: false, connectionType: "unknown" }),
    onChange: async () => noopSubscription(),
  },
  storage: {
    clear: async () => {
      throw unavailable("Storage");
    },
    get: async () => null,
    keys: async () => [],
    remove: async () => {
      throw unavailable("Storage");
    },
    set: async () => {
      throw unavailable("Storage");
    },
  },
});
