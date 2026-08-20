import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Network, type ConnectionStatus } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";
import type {
  DeviceAdapter,
  DeviceNetworkStatus,
  DevicePlatformInfo,
} from "@absolutejs/devices";

const connectionStatus = (status: ConnectionStatus): DeviceNetworkStatus => ({
  connected: status.connected,
  connectionType:
    status.connectionType === "wifi" || status.connectionType === "cellular"
      ? status.connectionType
      : status.connected
        ? "unknown"
        : "none",
});

const os = (): DevicePlatformInfo["os"] => {
  const platform = Capacitor.getPlatform();
  if (platform === "android" || platform === "ios") return platform;
  return "unknown";
};

const formFactor = (): DevicePlatformInfo["formFactor"] => {
  if (typeof matchMedia !== "function") return "unknown";
  if (!matchMedia("(pointer: coarse)").matches) return "desktop";
  return Math.min(screen.width, screen.height) >= 768 ? "tablet" : "phone";
};

export const createCapacitorDeviceAdapter = (): DeviceAdapter => ({
  runtime: "capacitor",
  platform: {
    getInfo: async () => {
      const info = await App.getInfo();
      return {
        appBuild: info.build,
        appVersion: info.version,
        formFactor: formFactor(),
        isNative: Capacitor.isNativePlatform(),
        language:
          typeof navigator === "undefined" ? undefined : navigator.language,
        locale: Intl.DateTimeFormat().resolvedOptions().locale,
        os: os(),
        runtime: "capacitor",
      };
    },
  },
  lifecycle: {
    getState: async () =>
      (await App.getState()).isActive ? "active" : "background",
    onChange: async (listener) => {
      const handle = await App.addListener("appStateChange", ({ isActive }) =>
        listener(isActive ? "active" : "background"),
      );
      return () => handle.remove();
    },
  },
  links: {
    getLaunchUrl: async () => (await App.getLaunchUrl())?.url ?? null,
    onOpen: async (listener) => {
      const handle = await App.addListener("appUrlOpen", ({ url }) =>
        listener(url),
      );
      return () => handle.remove();
    },
    openExternal: async (url) => Browser.open({ url }),
  },
  network: {
    getStatus: async () => connectionStatus(await Network.getStatus()),
    onChange: async (listener) => {
      const handle = await Network.addListener(
        "networkStatusChange",
        (status) => listener(connectionStatus(status)),
      );
      return () => handle.remove();
    },
  },
  storage: {
    clear: async () => Preferences.clear(),
    get: async (key) => (await Preferences.get({ key })).value,
    keys: async () => (await Preferences.keys()).keys,
    remove: async (key) => Preferences.remove({ key }),
    set: async (key, value) => Preferences.set({ key, value }),
  },
});
