import {
  DeviceError,
  type DeviceAdapter,
  type DeviceNetworkStatus,
  type DevicePlatformInfo,
  type DeviceSafeAreaInsets,
  type DeviceShareContent,
} from "../contracts";
import {
  availableCapability,
  normalizeDeviceShareContent,
  unavailableCapability,
} from "../capabilities";

const COARSE_TABLET_MIN_WIDTH = 768;

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

const safeAreaInsets = (): DeviceSafeAreaInsets => {
  if (!document.body) return { bottom: 0, left: 0, right: 0, top: 0 };
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

const matches = (query: string) =>
  typeof matchMedia === "function" && matchMedia(query).matches;

const requireStorage = () => {
  try {
    return window.localStorage;
  } catch (cause) {
    throw new DeviceError("unavailable", "Browser storage is unavailable.", {
      cause,
    });
  }
};

const webFailure = (error: unknown, message: string) => {
  const name =
    typeof error === "object" && error !== null
      ? Reflect.get(error, "name")
      : undefined;
  if (name === "AbortError")
    return new DeviceError("cancelled", "The device action was cancelled.", {
      cause: error,
    });
  if (name === "NotAllowedError")
    return new DeviceError("permission-denied", message, { cause: error });

  return new DeviceError("failed", message, { cause: error });
};

const webOperation = async <T>(
  message: string,
  operation: () => Promise<T>,
) => {
  try {
    return await operation();
  } catch (error) {
    throw webFailure(error, message);
  }
};

const clipboardStatus = (operation: "read" | "write") => {
  const method = operation === "read" ? "readText" : "writeText";
  return typeof navigator.clipboard?.[method] === "function"
    ? availableCapability("web")
    : unavailableCapability(
        "unsupported",
        `Clipboard ${operation} is not supported by this browser context.`,
      );
};

const shareStatus = (content?: DeviceShareContent) => {
  if (typeof navigator.share !== "function")
    return unavailableCapability(
      "unsupported",
      "The Web Share API is not supported by this browser.",
    );
  if (content && typeof navigator.canShare === "function") {
    const normalized = normalizeDeviceShareContent(content);
    if (!navigator.canShare(normalized))
      return unavailableCapability(
        "unsupported",
        "This browser cannot share the requested content.",
      );
  }

  return availableCapability("web");
};

const vibrate = (durationMs: number) => {
  if (typeof navigator.vibrate === "function") navigator.vibrate(durationMs);
};

export const createWebDeviceAdapter = (): DeviceAdapter => ({
  runtime: "web",
  clipboard: {
    capability: async (operation = "write") => clipboardStatus(operation),
    readText: async () => {
      if (!clipboardStatus("read").available)
        throw new DeviceError("unsupported", "Clipboard read is unavailable.");
      return webOperation("Browser clipboard read was denied.", () =>
        navigator.clipboard.readText(),
      );
    },
    writeText: async (value) => {
      if (!clipboardStatus("write").available)
        throw new DeviceError("unsupported", "Clipboard write is unavailable.");
      await webOperation("Browser clipboard write was denied.", () =>
        navigator.clipboard.writeText(value),
      );
    },
  },
  haptics: {
    capability: async () =>
      typeof navigator.vibrate === "function"
        ? availableCapability("web")
        : unavailableCapability(
            "unsupported",
            "Vibration feedback is not supported by this browser.",
          ),
    impact: async (style = "medium") =>
      vibrate(style === "light" ? 8 : style === "heavy" ? 24 : 14),
    notification: async (type = "success") =>
      vibrate(type === "error" ? 40 : type === "warning" ? 28 : 18),
    selectionChanged: async () => vibrate(6),
    vibrate: async (durationMs = 300) => vibrate(durationMs),
  },
  platform: {
    getInfo: async () => ({
      formFactor: matches("(pointer: coarse)")
        ? innerWidth >= COARSE_TABLET_MIN_WIDTH
          ? "tablet"
          : "phone"
        : "desktop",
      isNative: false,
      language: navigator.language,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      os: detectOs(),
      prefersReducedMotion: matches("(prefers-reduced-motion: reduce)"),
      runtime: "web",
      safeAreaInsets: safeAreaInsets(),
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
    onRestoredOperation: async () => () => undefined,
    onResume: async (listener) => {
      const handler = () => {
        if (document.visibilityState === "visible") listener();
      };
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    },
  },
  links: {
    getLaunchUrl: async () => location.href,
    onOpen: async (listener) => {
      let lastUrl = location.href;
      const handler = () => {
        if (location.href === lastUrl) return;
        lastUrl = location.href;
        listener(lastUrl);
      };
      addEventListener("popstate", handler);
      addEventListener("hashchange", handler);
      return () => {
        removeEventListener("popstate", handler);
        removeEventListener("hashchange", handler);
      };
    },
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
  share: {
    capability: async (content) => shareStatus(content),
    share: async (content) => {
      const normalized = normalizeDeviceShareContent(content);
      if (!shareStatus(normalized).available)
        throw new DeviceError("unsupported", "Web sharing is unavailable.");
      await webOperation("Browser sharing failed.", () =>
        navigator.share(normalized),
      );
      return {};
    },
  },
  storage: {
    clear: async () => requireStorage().clear(),
    get: async (key) => requireStorage().getItem(key),
    keys: async () => {
      const storage = requireStorage();
      return Array.from({ length: storage.length }, (_, index) =>
        storage.key(index),
      ).filter((key): key is string => key !== null);
    },
    remove: async (key) => requireStorage().removeItem(key),
    set: async (key, value) => requireStorage().setItem(key, value),
  },
});
