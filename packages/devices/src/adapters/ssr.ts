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
  camera: {
    capability: async () => ({
      available: false,
      reason: "unavailable",
      message: "Camera is unavailable during server rendering.",
    }),
    queryPermission: async () => ({ canRequest: false, state: "unavailable" }),
    requestPermission: async () => ({
      canRequest: false,
      state: "unavailable",
    }),
    takePhoto: async () => {
      throw unavailable("Camera");
    },
  },
  clipboard: {
    capability: async () => ({
      available: false,
      reason: "unavailable",
      message: "Clipboard is unavailable during server rendering.",
    }),
    readText: async () => {
      throw unavailable("Clipboard");
    },
    writeText: async () => {
      throw unavailable("Clipboard");
    },
  },
  documents: {
    capability: async () => ({
      available: false,
      reason: "unavailable",
      message: "Documents are unavailable during server rendering.",
    }),
    export: async () => {
      throw unavailable("Documents");
    },
    open: async () => {
      throw unavailable("Documents");
    },
    pick: async () => {
      throw unavailable("Documents");
    },
  },
  haptics: {
    capability: async () => ({
      available: false,
      reason: "unavailable",
      message: "Haptics are unavailable during server rendering.",
    }),
    impact: async () => undefined,
    notification: async () => undefined,
    selectionChanged: async () => undefined,
    vibrate: async () => undefined,
  },
  localNotifications: {
    cancel: async () => {
      throw unavailable("Local notifications");
    },
    capability: async () => ({
      available: false,
      reason: "unavailable",
      message: "Local notifications are unavailable during server rendering.",
    }),
    onAction: async () => noopSubscription(),
    onReceived: async () => noopSubscription(),
    pending: async () => [],
    queryPermission: async () => ({
      canRequest: false,
      state: "unavailable",
    }),
    requestPermission: async () => ({
      canRequest: false,
      state: "unavailable",
    }),
    schedule: async () => {
      throw unavailable("Local notifications");
    },
  },
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
  location: {
    capability: async () => ({
      available: false,
      reason: "unavailable",
      message: "Location is unavailable during server rendering.",
    }),
    current: async () => {
      throw unavailable("Location");
    },
    queryPermission: async () => ({
      canRequest: false,
      precision: "unknown",
      state: "unavailable",
    }),
    requestPermission: async () => ({
      canRequest: false,
      precision: "unknown",
      state: "unavailable",
    }),
    watch: async () => {
      throw unavailable("Location");
    },
  },
  network: {
    getStatus: async () => ({ connected: false, connectionType: "unknown" }),
    onChange: async () => noopSubscription(),
  },
  photos: {
    capability: async () => ({
      available: false,
      reason: "unavailable",
      message: "Photo picker is unavailable during server rendering.",
    }),
    pick: async () => {
      throw unavailable("Photo picker");
    },
  },
  share: {
    capability: async () => ({
      available: false,
      reason: "unavailable",
      message: "Sharing is unavailable during server rendering.",
    }),
    share: async () => {
      throw unavailable("Sharing");
    },
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
