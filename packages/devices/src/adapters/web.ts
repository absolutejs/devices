import {
  DeviceError,
  DEFAULT_DEVICE_DOCUMENT_MAX_BYTES,
  type DeviceAdapter,
  type DeviceDocument,
  type DeviceExportDocumentResult,
  type DeviceNetworkStatus,
  type DevicePlatformInfo,
  type DeviceSafeAreaInsets,
  type DeviceShareContent,
  type DevicePhoto,
  type DeviceLocationPermissionStatus,
  type DeviceLocationPosition,
  type DeviceLocationWatchOptions,
  type DeviceKeyboardState,
  type DeviceLocalNotification,
  type DevicePickDocumentsOptions,
  type DeviceWriteDocumentOptions,
} from "../contracts";
import {
  availableCapability,
  normalizeDeviceLocalNotification,
  normalizeDeviceShareContent,
  unavailableCapability,
  validateDeviceLocationOptions,
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

const editableElement = (value: Element | null) =>
  value instanceof HTMLInputElement ||
  value instanceof HTMLTextAreaElement ||
  (value instanceof HTMLElement && value.isContentEditable);

const webKeyboardState = (): DeviceKeyboardState => {
  const viewport = window.visualViewport;
  const heightPx = viewport
    ? Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
      )
    : 0;

  return {
    heightPx,
    visible: editableElement(document.activeElement) && heightPx > 50,
  };
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

const requireMaximumBytes = (value?: number) => {
  const maximumBytes = value ?? DEFAULT_DEVICE_DOCUMENT_MAX_BYTES;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new TypeError(
      "Document maximumBytes must be a positive safe integer.",
    );
  return maximumBytes;
};

const requireDocumentName = (name: string) => {
  if (
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    /[/\\\u0000-\u001f\u007f]/.test(name)
  )
    throw new TypeError("Document names must be safe leaf filenames.");
  return name;
};

const requireDocumentAccept = (accept?: string[]) => {
  if (accept === undefined) return undefined;
  if (
    accept.length === 0 ||
    accept.some(
      (value) =>
        !/^\.[a-z0-9]+$/i.test(value) &&
        !/^[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+*-]+)$/i.test(value),
    )
  )
    throw new TypeError(
      "Document accept entries must be MIME types or file extensions.",
    );
  return accept.join(",");
};

const requireDocumentLimit = (limit?: number) => {
  const value = limit ?? 1;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError("Document limit must be a positive safe integer.");
  return value;
};

const documentBlob = (options: DeviceWriteDocumentOptions) => {
  requireDocumentName(options.name);
  const mimeType =
    options.mimeType ??
    (options.content instanceof Blob && options.content.type
      ? options.content.type
      : typeof options.content === "string"
        ? "text/plain;charset=utf-8"
        : "application/octet-stream");
  const blob =
    options.content instanceof Blob
      ? options.content
      : new Blob([options.content], { type: mimeType });
  if (blob.size > requireMaximumBytes(options.maximumBytes))
    throw new DeviceError(
      "failed",
      `Document ${options.name} exceeds the configured byte limit.`,
    );
  return { blob, mimeType, name: options.name, sizeBytes: blob.size };
};

const releaseObjectUrl = (url: string) =>
  setTimeout(() => URL.revokeObjectURL(url), 0);

const pickDocuments = async (
  options: DevicePickDocumentsOptions = {},
): Promise<DeviceDocument[]> => {
  if (typeof document === "undefined" || !document.body)
    throw new DeviceError(
      "unsupported",
      "Browser document selection is unavailable.",
    );
  const limit = requireDocumentLimit(options.limit);
  const maximumBytes = requireMaximumBytes(options.maximumBytes);
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = limit > 1;
  input.style.display = "none";
  const accept = requireDocumentAccept(options.accept);
  if (accept) input.accept = accept;
  document.body.append(input);
  try {
    const files = await new Promise<File[]>((resolve, reject) => {
      const cleanup = () => {
        input.removeEventListener("change", changed);
        input.removeEventListener("cancel", cancelled);
      };
      const changed = () => {
        cleanup();
        resolve(Array.from(input.files ?? []));
      };
      const cancelled = () => {
        cleanup();
        resolve([]);
      };
      input.addEventListener("change", changed, { once: true });
      input.addEventListener("cancel", cancelled, { once: true });
      try {
        input.click();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
    if (files.length === 0)
      throw new DeviceError("cancelled", "Document selection was cancelled.");
    const selected = files.slice(0, limit);
    const oversized = selected.find((file) => file.size > maximumBytes);
    if (oversized)
      throw new DeviceError(
        "failed",
        `Document ${oversized.name} exceeds the configured byte limit.`,
      );
    return selected.map((file) => ({
      blob: file,
      ...(Number.isFinite(file.lastModified)
        ? { lastModifiedMs: file.lastModified }
        : {}),
      mimeType: file.type || "application/octet-stream",
      name: file.name,
      sizeBytes: file.size,
    }));
  } finally {
    input.remove();
  }
};

const locationFailure = (error: unknown) => {
  const code =
    typeof error === "object" && error !== null
      ? Reflect.get(error, "code")
      : undefined;
  if (code === 1)
    return new DeviceError(
      "permission-denied",
      "Browser location permission was denied.",
      { cause: error },
    );
  if (code === 2)
    return new DeviceError(
      "temporarily-unavailable",
      "The browser could not determine the current location.",
      { cause: error },
    );
  if (code === 3)
    return new DeviceError(
      "temporarily-unavailable",
      "The browser location request timed out.",
      { cause: error },
    );

  return webFailure(error, "Browser location failed.");
};

const locationPosition = (
  value: GeolocationPosition,
): DeviceLocationPosition => {
  const { coords } = value;
  if (
    !Number.isFinite(coords.latitude) ||
    !Number.isFinite(coords.longitude) ||
    !Number.isFinite(coords.accuracy) ||
    !Number.isFinite(value.timestamp)
  )
    throw new DeviceError(
      "failed",
      "The browser returned an invalid location position.",
    );

  return {
    accuracyMeters: coords.accuracy,
    ...(coords.altitudeAccuracy === null
      ? {}
      : { altitudeAccuracyMeters: coords.altitudeAccuracy }),
    ...(coords.altitude === null ? {} : { altitudeMeters: coords.altitude }),
    ...(coords.heading === null ? {} : { headingDegrees: coords.heading }),
    latitude: coords.latitude,
    longitude: coords.longitude,
    native: value,
    ...(coords.speed === null ? {} : { speedMetersPerSecond: coords.speed }),
    timestampMs: value.timestamp,
  };
};

const webLocationOptions = (
  options?: DeviceLocationWatchOptions,
): PositionOptions => ({
  enableHighAccuracy: options?.accuracy === "high",
  ...(options?.maximumAgeMs === undefined
    ? {}
    : { maximumAge: options.maximumAgeMs }),
  ...(options?.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
});

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

const requirePhotoOptions = (options?: {
  limit?: number;
  transform?: { height: number; quality?: number; width: number };
}) => {
  if (
    options?.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit < 1)
  )
    throw new TypeError("Photo picker limit must be a positive integer.");
  const transform = options?.transform;
  if (
    transform &&
    (!Number.isInteger(transform.width) ||
      transform.width < 1 ||
      !Number.isInteger(transform.height) ||
      transform.height < 1 ||
      (transform.quality !== undefined &&
        (!Number.isInteger(transform.quality) ||
          transform.quality < 0 ||
          transform.quality > 100)))
  )
    throw new TypeError(
      "Photo transforms require positive integer dimensions and quality from 0 to 100.",
    );
};

const pickImages = async (options: {
  capture?: "environment" | "user";
  limit?: number;
  multiple?: boolean;
}): Promise<DevicePhoto[]> => {
  if (
    typeof document === "undefined" ||
    typeof URL.createObjectURL !== "function"
  )
    throw new DeviceError(
      "unsupported",
      "Browser photo selection is unavailable.",
    );
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = options.multiple ?? false;
  if (options.capture) input.setAttribute("capture", options.capture);
  input.style.display = "none";
  document.body?.append(input);
  try {
    const files = await new Promise<File[]>((resolve, reject) => {
      const finish = (selected: File[]) => {
        input.removeEventListener("change", changed);
        input.removeEventListener("cancel", cancelled);
        resolve(selected);
      };
      const changed = () => finish(Array.from(input.files ?? []));
      const cancelled = () => finish([]);
      input.addEventListener("change", changed, { once: true });
      input.addEventListener("cancel", cancelled, { once: true });
      try {
        input.click();
      } catch (error) {
        reject(error);
      }
    });
    if (files.length === 0)
      throw new DeviceError("cancelled", "Photo selection was cancelled.");
    return files.slice(0, options.limit).map((file) => ({
      ...(file.type ? { format: file.type.replace(/^image\//, "") } : {}),
      name: file.name,
      sizeBytes: file.size,
      webPath: URL.createObjectURL(file),
    }));
  } finally {
    input.remove();
  }
};

export const createWebDeviceAdapter = (): DeviceAdapter => {
  let cameraAuthorized = false;
  let locationAuthorized = false;
  const notificationActions = new Set<
    (action: {
      actionId: string;
      notification: DeviceLocalNotification;
    }) => void
  >();
  const notificationReceived = new Set<
    (notification: DeviceLocalNotification) => void
  >();
  const pendingNotifications = new Map<
    number,
    {
      notification: DeviceLocalNotification;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const notificationPermission = () => {
    if (typeof Notification === "undefined")
      return { canRequest: false, state: "unavailable" as const };
    return Notification.permission === "granted"
      ? { canRequest: false, state: "granted" as const }
      : Notification.permission === "denied"
        ? { canRequest: false, state: "denied" as const }
        : { canRequest: true, state: "prompt" as const };
  };

  const showNotification = (notification: DeviceLocalNotification) => {
    let displayed: Notification;
    try {
      displayed = new Notification(notification.title, {
        body: notification.body,
        data: notification.data,
        tag: `absolutejs:${notification.id}`,
      });
    } catch (error) {
      throw webFailure(error, "Browser notification display failed.");
    }
    for (const listener of notificationReceived) listener(notification);
    displayed.onclick = () => {
      for (const listener of notificationActions)
        listener({ actionId: "tap", notification });
      window.focus();
    };
  };

  const queryLocationPermission =
    async (): Promise<DeviceLocationPermissionStatus> => {
      if (typeof navigator.geolocation === "undefined")
        return {
          canRequest: false,
          precision: "unknown",
          state: "unavailable",
        };
      if (locationAuthorized)
        return { canRequest: false, precision: "unknown", state: "granted" };
      if (typeof navigator.permissions?.query !== "function")
        return { canRequest: true, precision: "unknown", state: "prompt" };
      try {
        const status = await navigator.permissions.query({
          name: "geolocation",
        });
        return {
          canRequest: status.state === "prompt",
          precision: "unknown",
          state: status.state,
        };
      } catch {
        return { canRequest: true, precision: "unknown", state: "prompt" };
      }
    };

  const currentLocation = async (options?: DeviceLocationWatchOptions) => {
    validateDeviceLocationOptions(options);
    if (typeof navigator.geolocation === "undefined")
      throw new DeviceError(
        "unsupported",
        "Browser geolocation is unavailable.",
      );
    return new Promise<DeviceLocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (position) => {
          try {
            resolve(locationPosition(position));
          } catch (error) {
            reject(error);
          }
        },
        (error) => reject(locationFailure(error)),
        webLocationOptions(options),
      ),
    );
  };

  return {
    runtime: "web",
    camera: {
      capability: async () =>
        typeof document !== "undefined"
          ? availableCapability("web")
          : unavailableCapability(
              "unsupported",
              "Browser camera capture is unavailable.",
            ),
      // File-input capture is item-scoped rather than a durable browser grant. We
      // still preserve the facade's explicit-request invariant for portable code.
      queryPermission: async () => ({
        canRequest: !cameraAuthorized,
        state: cameraAuthorized ? "granted" : "prompt",
      }),
      requestPermission: async () => {
        cameraAuthorized = true;
        return { canRequest: false, state: "granted" };
      },
      takePhoto: async (options) => {
        requirePhotoOptions(options);
        return (
          await pickImages({
            capture: options?.direction === "front" ? "user" : "environment",
          })
        )[0]!;
      },
    },
    clipboard: {
      capability: async (operation = "write") => clipboardStatus(operation),
      readText: async () => {
        if (!clipboardStatus("read").available)
          throw new DeviceError(
            "unsupported",
            "Clipboard read is unavailable.",
          );
        return webOperation("Browser clipboard read was denied.", () =>
          navigator.clipboard.readText(),
        );
      },
      writeText: async (value) => {
        if (!clipboardStatus("write").available)
          throw new DeviceError(
            "unsupported",
            "Clipboard write is unavailable.",
          );
        await webOperation("Browser clipboard write was denied.", () =>
          navigator.clipboard.writeText(value),
        );
      },
    },
    documents: {
      capability: async () =>
        typeof document !== "undefined" &&
        typeof URL.createObjectURL === "function"
          ? availableCapability("web")
          : unavailableCapability(
              "unsupported",
              "Browser document handling is unavailable.",
            ),
      export: async (options): Promise<DeviceExportDocumentResult> => {
        const result = documentBlob(options);
        const url = URL.createObjectURL(result.blob);
        try {
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = result.name;
          anchor.rel = "noopener";
          anchor.click();
          return {
            mimeType: result.mimeType,
            name: result.name,
            sizeBytes: result.sizeBytes,
          };
        } finally {
          releaseObjectUrl(url);
        }
      },
      open: async (options) => {
        const result = documentBlob(options);
        const url = URL.createObjectURL(result.blob);
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (opened === null) {
          URL.revokeObjectURL(url);
          throw new DeviceError(
            "failed",
            "The browser blocked the document preview window.",
          );
        }
        releaseObjectUrl(url);
      },
      pick: pickDocuments,
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
    keyboard: {
      capability: async () =>
        typeof window.visualViewport === "undefined"
          ? unavailableCapability(
              "unsupported",
              "This browser does not expose keyboard viewport changes.",
            )
          : availableCapability("web"),
      dismiss: async () => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
      },
      getState: async () => webKeyboardState(),
      onChange: async (listener) => {
        let previous = webKeyboardState();
        const emit = () => {
          const next = webKeyboardState();
          if (
            next.visible === previous.visible &&
            next.heightPx === previous.heightPx
          )
            return;
          previous = next;
          listener(next);
        };
        window.visualViewport?.addEventListener("resize", emit);
        document.addEventListener("focusin", emit);
        document.addEventListener("focusout", emit);
        return () => {
          window.visualViewport?.removeEventListener("resize", emit);
          document.removeEventListener("focusin", emit);
          document.removeEventListener("focusout", emit);
        };
      },
    },
    localNotifications: {
      cancel: async (ids) => {
        for (const id of ids) {
          const pending = pendingNotifications.get(id);
          if (!pending) continue;
          clearTimeout(pending.timer);
          pendingNotifications.delete(id);
        }
      },
      capability: async () =>
        typeof Notification === "undefined"
          ? unavailableCapability(
              "unsupported",
              "Browser notifications are unavailable.",
            )
          : availableCapability("emulated", {
              durableScheduling: false,
              maximumDelayMs: 2_147_483_647,
            }),
      onAction: async (listener) => {
        notificationActions.add(listener);
        return () => {
          notificationActions.delete(listener);
        };
      },
      onReceived: async (listener) => {
        notificationReceived.add(listener);
        return () => {
          notificationReceived.delete(listener);
        };
      },
      pending: async () =>
        Array.from(
          pendingNotifications.values(),
          ({ notification }) => notification,
        ),
      queryPermission: async () => notificationPermission(),
      requestPermission: async () => {
        if (typeof Notification === "undefined")
          return { canRequest: false, state: "unavailable" };
        try {
          await Notification.requestPermission();
          return notificationPermission();
        } catch (error) {
          throw webFailure(error, "Browser notification permission failed.");
        }
      },
      schedule: async (input) => {
        const permission = notificationPermission();
        if (permission.state !== "granted")
          throw new DeviceError(
            permission.state === "denied"
              ? "permission-denied"
              : permission.state === "unavailable"
                ? "unavailable"
                : "permission-required",
            "Notification permission must be explicitly granted before scheduling.",
          );
        const notification = normalizeDeviceLocalNotification(input);
        const delay = Math.max(
          0,
          (notification.scheduledAtMs ?? Date.now()) - Date.now(),
        );
        if (delay > 2_147_483_647)
          throw new DeviceError(
            "unsupported",
            "Browser notification scheduling cannot exceed 24 days and is not durable across reloads.",
          );
        const existing = pendingNotifications.get(notification.id);
        if (existing) clearTimeout(existing.timer);
        if (delay === 0) {
          pendingNotifications.delete(notification.id);
          showNotification(notification);
          return notification;
        }
        const timer = setTimeout(() => {
          pendingNotifications.delete(notification.id);
          showNotification(notification);
        }, delay);
        pendingNotifications.set(notification.id, { notification, timer });
        return notification;
      },
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
    location: {
      capability: async () =>
        typeof navigator.geolocation === "undefined"
          ? unavailableCapability(
              "unsupported",
              "Browser geolocation is unavailable.",
            )
          : availableCapability("web"),
      current: currentLocation,
      queryPermission: queryLocationPermission,
      requestPermission: async () => {
        await currentLocation();
        locationAuthorized = true;
        const status = await queryLocationPermission();
        return { ...status, state: "granted" };
      },
      watch: async (listener, options) => {
        validateDeviceLocationOptions(options);
        if (typeof navigator.geolocation === "undefined")
          throw new DeviceError(
            "unsupported",
            "Browser geolocation is unavailable.",
          );
        let active = true;
        const id = navigator.geolocation.watchPosition(
          (position) => {
            if (!active) return;
            try {
              listener({
                position: locationPosition(position),
                type: "position",
              });
            } catch (error) {
              listener({ error: locationFailure(error), type: "error" });
            }
          },
          (error) => {
            if (active)
              listener({ error: locationFailure(error), type: "error" });
          },
          webLocationOptions(options),
        );
        return () => {
          if (!active) return;
          active = false;
          navigator.geolocation.clearWatch(id);
        };
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
    photos: {
      capability: async () =>
        typeof document !== "undefined"
          ? availableCapability("web")
          : unavailableCapability(
              "unsupported",
              "Browser photo selection is unavailable.",
            ),
      pick: async (options) => {
        requirePhotoOptions(options);
        return pickImages({
          limit: options?.limit,
          multiple: options?.limit !== 1,
        });
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
    systemBars: {
      capability: async (operation = "appearance") =>
        operation === "appearance"
          ? availableCapability("emulated", {
              targetedBars: false,
            })
          : unavailableCapability(
              "unsupported",
              "Browser chrome visibility cannot be controlled reliably.",
            ),
      setAppearance: async (appearance) => {
        document.documentElement.style.colorScheme =
          appearance === "automatic"
            ? "normal"
            : appearance === "light"
              ? "dark"
              : "light";
      },
      setVisible: async () => {
        throw new DeviceError(
          "unsupported",
          "Browser chrome visibility cannot be controlled reliably.",
        );
      },
    },
  };
};
