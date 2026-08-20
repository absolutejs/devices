import {
  DeviceError,
  type DeviceAdapter,
  type DeviceNetworkStatus,
  type DevicePlatformInfo,
} from "../contracts";

const detectOs = (): DevicePlatformInfo["os"] => {
  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(platform)) return "ios";
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac")) return "macos";
  if (platform.includes("linux")) return "linux";
  return "unknown";
};

const networkStatus = (): DeviceNetworkStatus => {
  const connection = Reflect.get(navigator, "connection") as
    { type?: string } | undefined;
  const type = connection?.type;
  const connectionType =
    type === "wifi" || type === "cellular" || type === "ethernet"
      ? type
      : navigator.onLine
        ? "unknown"
        : "none";
  return { connected: navigator.onLine, connectionType };
};

const requireStorage = () => {
  try {
    return window.localStorage;
  } catch (cause) {
    throw new DeviceError("unavailable", "Browser storage is unavailable.", {
      cause,
    });
  }
};

export const createWebDeviceAdapter = (): DeviceAdapter => ({
  runtime: "web",
  platform: {
    getInfo: async () => ({
      formFactor: matchMedia("(pointer: coarse)").matches
        ? innerWidth >= 768
          ? "tablet"
          : "phone"
        : "desktop",
      isNative: false,
      language: navigator.language,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      os: detectOs(),
      runtime: "web",
    }),
  },
  lifecycle: {
    getState: async () =>
      document.visibilityState === "visible" ? "active" : "background",
    onChange: async (listener) => {
      const handler = () =>
        listener(
          document.visibilityState === "visible" ? "active" : "background",
        );
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    },
  },
  links: {
    getLaunchUrl: async () => null,
    onOpen: async () => () => undefined,
    openExternal: async (url) => {
      const parsed = new URL(url);
      if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
        throw new DeviceError(
          "failed",
          `External URL protocol ${parsed.protocol} is not allowed.`,
        );
      }
      window.open(parsed.href, "_blank", "noopener,noreferrer");
    },
  },
  network: {
    getStatus: async () => networkStatus(),
    onChange: async (listener) => {
      const handler = () => listener(networkStatus());
      addEventListener("online", handler);
      addEventListener("offline", handler);
      return () => {
        removeEventListener("online", handler);
        removeEventListener("offline", handler);
      };
    },
  },
  storage: {
    clear: async () => requireStorage().clear(),
    get: async (key) => requireStorage().getItem(key),
    keys: async () => Object.keys(requireStorage()),
    remove: async (key) => requireStorage().removeItem(key),
    set: async (key, value) => requireStorage().setItem(key, value),
  },
});
