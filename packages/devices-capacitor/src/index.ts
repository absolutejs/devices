import { App, type AppPlugin } from "@capacitor/app";
import { Browser, type BrowserPlugin } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import {
  Network,
  type ConnectionStatus,
  type NetworkPlugin,
} from "@capacitor/network";
import { Preferences, type PreferencesPlugin } from "@capacitor/preferences";
import {
  DeviceError,
  availableCapability,
  installDeviceAdapter,
  normalizeDeviceError,
  unavailableCapability,
  type DeviceAdapter,
  type DeviceClipboardCapability,
  type DeviceCameraCapability,
  type DeviceHapticsCapability,
  type DeviceLocationCapability,
  type DeviceNetworkStatus,
  type DevicePlatformInfo,
  type DevicePhotosCapability,
  type DeviceRestoredOperation,
  type DeviceSafeAreaInsets,
  type DeviceSecureStorageCapability,
  type DeviceShareCapability,
  type DeviceSubscription,
} from "@absolutejs/devices";
import { createCapacitorSecureStorage } from "./secureStorage";

export * from "./secureStorage";

const COARSE_TABLET_MIN_WIDTH = 768;
const DEFAULT_STORAGE_PREFIX = "absolutejs.devices.";
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

export type CapacitorRuntimeBindings = {
  getPlatform(): string;
  isNativePlatform(): boolean;
  isPluginAvailable(name: string): boolean;
};

export type CapacitorDeviceBindings = {
  app: AppPlugin;
  browser: BrowserPlugin;
  capacitor: CapacitorRuntimeBindings;
  network: NetworkPlugin;
  preferences: PreferencesPlugin;
};

export type CapacitorDeviceAdapterOptions = {
  bindings?: CapacitorDeviceBindings;
  camera?: DeviceCameraCapability;
  clipboard?: DeviceClipboardCapability;
  haptics?: DeviceHapticsCapability;
  location?: DeviceLocationCapability;
  photos?: DevicePhotosCapability;
  secureStorage?: DeviceSecureStorageCapability;
  share?: DeviceShareCapability;
  storagePrefix?: string;
};

const defaultBindings = (): CapacitorDeviceBindings => ({
  app: App,
  browser: Browser,
  capacitor: Capacitor,
  network: Network,
  preferences: Preferences,
});

const connectionStatus = (status: ConnectionStatus): DeviceNetworkStatus => ({
  connected: status.connected,
  connectionType:
    status.connectionType === "wifi" || status.connectionType === "cellular"
      ? status.connectionType
      : status.connected
        ? "unknown"
        : "none",
});

const os = (capacitor: CapacitorRuntimeBindings): DevicePlatformInfo["os"] => {
  const platform = capacitor.getPlatform();
  if (platform === "android" || platform === "ios") return platform;
  return "unknown";
};

const matches = (query: string) =>
  typeof matchMedia === "function" && matchMedia(query).matches;

const formFactor = (): DevicePlatformInfo["formFactor"] => {
  if (typeof screen === "undefined") return "unknown";
  if (!matches("(pointer: coarse)")) return "desktop";
  return Math.min(screen.width, screen.height) >= COARSE_TABLET_MIN_WIDTH
    ? "tablet"
    : "phone";
};

const safeAreaInsets = (): DeviceSafeAreaInsets => {
  const empty = { bottom: 0, left: 0, right: 0, top: 0 };
  if (typeof document === "undefined" || !document.body) return empty;
  const probe = document.createElement("div");
  probe.style.cssText = [
    "position:fixed",
    "visibility:hidden",
    "pointer-events:none",
    "padding-top:env(safe-area-inset-top, 0px)",
    "padding-right:env(safe-area-inset-right, 0px)",
    "padding-bottom:env(safe-area-inset-bottom, 0px)",
    "padding-left:env(safe-area-inset-left, 0px)",
  ].join(";");
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const insets = {
    bottom: Number.parseFloat(style.paddingBottom) || 0,
    left: Number.parseFloat(style.paddingLeft) || 0,
    right: Number.parseFloat(style.paddingRight) || 0,
    top: Number.parseFloat(style.paddingTop) || 0,
  };
  probe.remove();

  return insets;
};

const callProvider = async <T>(
  message: string,
  operation: () => Promise<T>,
) => {
  try {
    return await operation();
  } catch (error) {
    throw normalizeDeviceError(error, { message });
  }
};

const removable = (
  remove: () => Promise<void>,
  message: string,
): DeviceSubscription => {
  let active = true;
  return async () => {
    if (!active) return;
    await callProvider(message, remove);
    active = false;
  };
};

const restoredOperation = (event: {
  data?: unknown;
  error?: { message: string };
  methodName: string;
  pluginId: string;
  success: boolean;
}): DeviceRestoredOperation => ({
  ...(event.data === undefined ? {} : { data: event.data }),
  ...(event.error === undefined
    ? {}
    : { error: { message: event.error.message } }),
  method: event.methodName,
  native: event,
  plugin: event.pluginId,
  success: event.success,
});

const requireStoragePrefix = (prefix: string) => {
  if (prefix.length === 0)
    throw new TypeError("Capacitor device storagePrefix cannot be empty.");
  return prefix;
};

const externalUrl = (value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new DeviceError("failed", "External URL is invalid.", { cause });
  }
  if (url.username || url.password)
    throw new DeviceError(
      "failed",
      "External URLs cannot contain embedded credentials.",
    );
  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol))
    throw new DeviceError(
      "failed",
      `External URL protocol ${url.protocol} is not allowed by the Capacitor browser adapter.`,
    );

  return url.href;
};

export const createCapacitorDeviceAdapter = (
  options: CapacitorDeviceAdapterOptions = {},
): DeviceAdapter => {
  const bindings = options.bindings ?? defaultBindings();
  const prefix = requireStoragePrefix(
    options.storagePrefix ?? DEFAULT_STORAGE_PREFIX,
  );
  const storageKey = (key: string) => `${prefix}${key}`;
  const ownKeys = async () =>
    (await bindings.preferences.keys()).keys.filter((key) =>
      key.startsWith(prefix),
    );
  const secureStorage =
    options.secureStorage ??
    (bindings.capacitor.isNativePlatform() &&
    bindings.capacitor.isPluginAvailable("AbsoluteSecureStorage")
      ? createCapacitorSecureStorage()
      : undefined);

  return {
    runtime: "capacitor",
    back: {
      capability: async () =>
        bindings.capacitor.isNativePlatform() &&
        bindings.capacitor.getPlatform() === "android" &&
        bindings.capacitor.isPluginAvailable("App")
          ? availableCapability("native", { platform: "android" })
          : unavailableCapability(
              "unsupported",
              "Hardware back-button interception is available only on Android.",
            ),
      onPress: async (listener) => {
        if (
          !bindings.capacitor.isNativePlatform() ||
          bindings.capacitor.getPlatform() !== "android" ||
          !bindings.capacitor.isPluginAvailable("App")
        )
          return () => undefined;
        const handle = await callProvider(
          "Failed to subscribe to the Android back button.",
          () =>
            bindings.app.addListener("backButton", (event) =>
              listener({ canGoBack: event.canGoBack, native: event }),
            ),
        );
        try {
          await callProvider(
            "Failed to enable Android back-button interception.",
            () => bindings.app.toggleBackButtonHandler({ enabled: true }),
          );
        } catch (error) {
          await handle.remove().catch(() => undefined);
          throw error;
        }
        return removable(
          () => handle.remove(),
          "Failed to remove the Android back-button listener.",
        );
      },
    },
    ...(options.clipboard === undefined
      ? {}
      : { clipboard: options.clipboard }),
    ...(options.camera === undefined ? {} : { camera: options.camera }),
    ...(options.haptics === undefined ? {} : { haptics: options.haptics }),
    platform: {
      getInfo: async () => {
        const info = await callProvider(
          "Failed to read native application information.",
          () => bindings.app.getInfo(),
        );
        let language =
          typeof navigator === "undefined" ? undefined : navigator.language;
        try {
          language = (await bindings.app.getAppLanguage()).value || language;
        } catch {
          // Language is optional metadata; navigator remains a valid fallback.
        }
        return {
          appBuild: info.build,
          appVersion: info.version,
          formFactor: formFactor(),
          isNative: bindings.capacitor.isNativePlatform(),
          ...(language === undefined ? {} : { language }),
          locale: Intl.DateTimeFormat().resolvedOptions().locale,
          os: os(bindings.capacitor),
          prefersReducedMotion: matches("(prefers-reduced-motion: reduce)"),
          runtime: "capacitor",
          safeAreaInsets: safeAreaInsets(),
        };
      },
    },
    ...(options.photos === undefined ? {} : { photos: options.photos }),
    lifecycle: {
      getState: async () =>
        (
          await callProvider("Failed to read native application state.", () =>
            bindings.app.getState(),
          )
        ).isActive
          ? "active"
          : "background",
      onChange: async (listener) => {
        const handle = await callProvider(
          "Failed to subscribe to native application state.",
          () =>
            bindings.app.addListener("appStateChange", ({ isActive }) =>
              listener(isActive ? "active" : "background"),
            ),
        );
        return removable(
          () => handle.remove(),
          "Failed to remove the native application-state listener.",
        );
      },
      onRestoredOperation: async (listener) => {
        const handle = await callProvider(
          "Failed to subscribe to restored native operations.",
          () =>
            bindings.app.addListener("appRestoredResult", (event) =>
              listener(restoredOperation(event)),
            ),
        );
        return removable(
          () => handle.remove(),
          "Failed to remove the restored-operation listener.",
        );
      },
      onResume: async (listener) => {
        const handle = await callProvider(
          "Failed to subscribe to native resume events.",
          () => bindings.app.addListener("resume", listener),
        );
        return removable(
          () => handle.remove(),
          "Failed to remove the native resume listener.",
        );
      },
    },
    links: {
      getLaunchUrl: async () =>
        (
          await callProvider("Failed to read the native launch URL.", () =>
            bindings.app.getLaunchUrl(),
          )
        )?.url ?? null,
      onOpen: async (listener) => {
        const handle = await callProvider(
          "Failed to subscribe to native link events.",
          () =>
            bindings.app.addListener("appUrlOpen", ({ url }) => listener(url)),
        );
        return removable(
          () => handle.remove(),
          "Failed to remove the native link listener.",
        );
      },
      openExternal: async (url) =>
        callProvider("Failed to open the external URL.", () =>
          bindings.browser.open({ url: externalUrl(url) }),
        ),
    },
    ...(options.location === undefined ? {} : { location: options.location }),
    network: {
      getStatus: async () =>
        connectionStatus(
          await callProvider("Failed to read native network status.", () =>
            bindings.network.getStatus(),
          ),
        ),
      onChange: async (listener) => {
        const handle = await callProvider(
          "Failed to subscribe to native network changes.",
          () =>
            bindings.network.addListener("networkStatusChange", (status) =>
              listener(connectionStatus(status)),
            ),
        );
        return removable(
          () => handle.remove(),
          "Failed to remove the native network listener.",
        );
      },
    },
    ...(secureStorage === undefined ? {} : { secureStorage }),
    ...(options.share === undefined ? {} : { share: options.share }),
    storage: {
      clear: async () =>
        callProvider("Failed to clear native preferences.", async () => {
          const keys = await ownKeys();
          await Promise.all(
            keys.map((key) => bindings.preferences.remove({ key })),
          );
        }),
      get: async (key) =>
        (
          await callProvider("Failed to read a native preference.", () =>
            bindings.preferences.get({ key: storageKey(key) }),
          )
        ).value,
      keys: async () =>
        (await callProvider("Failed to list native preferences.", ownKeys)).map(
          (key) => key.slice(prefix.length),
        ),
      remove: async (key) =>
        callProvider("Failed to remove a native preference.", () =>
          bindings.preferences.remove({ key: storageKey(key) }),
        ),
      set: async (key, value) =>
        callProvider("Failed to write a native preference.", () =>
          bindings.preferences.set({ key: storageKey(key), value }),
        ),
    },
  };
};

export const installCapacitorDeviceAdapter = (
  options?: CapacitorDeviceAdapterOptions,
) => installDeviceAdapter(createCapacitorDeviceAdapter(options));

export const installCapacitorDeviceAdapterIfNative = (
  options: CapacitorDeviceAdapterOptions = {},
) => {
  const bindings = options.bindings ?? defaultBindings();
  if (!bindings.capacitor.isNativePlatform()) return null;

  return installCapacitorDeviceAdapter({ ...options, bindings });
};
