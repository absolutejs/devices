import {
  DeviceError,
  type DeviceCapabilityFidelity,
  type DeviceCapabilityStatus,
  type DeviceCapabilityUnavailableReason,
  type DeviceErrorCode,
  type DeviceLocalNotification,
  type DeviceScheduleLocalNotification,
  type DeviceLocationOptions,
  type DeviceLocationWatchOptions,
  type DeviceRuntime,
  type DeviceShareContent,
} from "./contracts";

const SHARE_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_NOTIFICATION_ID = 2_147_483_647;
const MAX_NOTIFICATION_DATA_BYTES = 16 * 1024;

export const availableCapability = (
  fidelity: DeviceCapabilityFidelity,
  native?: unknown,
): DeviceCapabilityStatus => ({
  available: true,
  fidelity,
  ...(native === undefined ? {} : { native }),
});

export const unavailableCapability = (
  reason: DeviceCapabilityUnavailableReason,
  message?: string,
  native?: unknown,
): DeviceCapabilityStatus => ({
  available: false,
  reason,
  ...(message === undefined ? {} : { message }),
  ...(native === undefined ? {} : { native }),
});

export const isDeviceError = (error: unknown): error is DeviceError =>
  error instanceof DeviceError;

export const normalizeDeviceError = (
  error: unknown,
  options: {
    code?: DeviceErrorCode;
    message: string;
  },
) =>
  isDeviceError(error)
    ? error
    : new DeviceError(options.code ?? "failed", options.message, {
        cause: error,
      });

const requireFiniteNonNegative = (value: number, field: string) => {
  if (!Number.isFinite(value) || value < 0)
    throw new TypeError(`${field} must be a finite non-negative number.`);
};

const requireFinitePositive = (value: number, field: string) => {
  if (!Number.isFinite(value) || value <= 0)
    throw new TypeError(`${field} must be a finite positive number.`);
};

export const validateDeviceLocationOptions = (
  options?: DeviceLocationOptions | DeviceLocationWatchOptions,
) => {
  const watchOptions = options as DeviceLocationWatchOptions | undefined;
  if (options?.maximumAgeMs !== undefined)
    requireFiniteNonNegative(options.maximumAgeMs, "Location maximumAgeMs");
  if (options?.timeoutMs !== undefined)
    requireFinitePositive(options.timeoutMs, "Location timeoutMs");
  if (watchOptions?.intervalMs !== undefined)
    requireFinitePositive(watchOptions.intervalMs, "Location intervalMs");
  if (watchOptions?.minimumUpdateIntervalMs !== undefined)
    requireFinitePositive(
      watchOptions.minimumUpdateIntervalMs,
      "Location minimumUpdateIntervalMs",
    );

  return options;
};

export const normalizeDeviceLocalNotification = (
  notification: DeviceScheduleLocalNotification,
): DeviceLocalNotification => {
  if (
    !Number.isSafeInteger(notification.id) ||
    notification.id < 1 ||
    notification.id > MAX_NOTIFICATION_ID
  )
    throw new TypeError(
      `Local notification id must be an integer from 1 to ${MAX_NOTIFICATION_ID}.`,
    );
  if (
    typeof notification.title !== "string" ||
    notification.title.trim().length === 0 ||
    notification.title.length > 200
  )
    throw new TypeError(
      "Local notification title must contain 1 to 200 characters.",
    );
  if (
    typeof notification.body !== "string" ||
    notification.body.trim().length === 0 ||
    notification.body.length > 4_000
  )
    throw new TypeError(
      "Local notification body must contain 1 to 4000 characters.",
    );
  if (
    notification.scheduledAtMs !== undefined &&
    (!Number.isFinite(notification.scheduledAtMs) ||
      Number.isNaN(new Date(notification.scheduledAtMs).getTime()))
  )
    throw new TypeError(
      "Local notification scheduledAtMs must be a valid Unix timestamp.",
    );

  let data: Record<string, string> | undefined;
  if (notification.data !== undefined) {
    const prototype = Object.getPrototypeOf(notification.data);
    if (
      typeof notification.data !== "object" ||
      notification.data === null ||
      (prototype !== Object.prototype && prototype !== null)
    )
      throw new TypeError(
        "Local notification data must be a plain string record.",
      );
    const entries = Object.entries(notification.data);
    if (
      entries.length > 32 ||
      entries.some(
        ([key, value]) =>
          key.length === 0 ||
          key.length > 128 ||
          typeof value !== "string" ||
          value.length > 4_000,
      )
    )
      throw new TypeError(
        "Local notification data supports up to 32 non-empty keys and string values up to 4000 characters.",
      );
    data = Object.fromEntries(entries);
    if (
      new TextEncoder().encode(JSON.stringify(data)).byteLength >
      MAX_NOTIFICATION_DATA_BYTES
    )
      throw new TypeError("Local notification data cannot exceed 16 KiB.");
  }

  return {
    body: notification.body,
    ...(data === undefined ? {} : { data }),
    id: notification.id,
    ...(notification.scheduledAtMs === undefined
      ? {}
      : { scheduledAtMs: notification.scheduledAtMs }),
    title: notification.title,
  };
};

export const runtimeCapability = (
  runtime: DeviceRuntime,
): DeviceCapabilityStatus => {
  if (runtime === "ssr")
    return unavailableCapability(
      "unavailable",
      "Device capabilities are unavailable during server rendering.",
    );
  if (runtime === "web") return availableCapability("web");
  if (runtime === "test") return availableCapability("emulated");

  return availableCapability("native");
};

export const normalizeDeviceShareContent = (
  content: DeviceShareContent,
): DeviceShareContent => {
  const normalized = Object.fromEntries(
    Object.entries(content).filter(
      ([, value]) => typeof value === "string" && value.length > 0,
    ),
  ) as DeviceShareContent;
  if (Object.keys(normalized).length === 0)
    throw new TypeError("Device share content cannot be empty.");
  if (normalized.url) {
    const url = new URL(normalized.url);
    if (url.username || url.password || !SHARE_PROTOCOLS.has(url.protocol))
      throw new TypeError(
        "Device share URLs must be credential-free HTTP(S) URLs.",
      );
    normalized.url = url.href;
  }

  return normalized;
};
