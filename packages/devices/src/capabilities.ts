import {
  DeviceError,
  type DeviceCapabilityFidelity,
  type DeviceCapabilityStatus,
  type DeviceCapabilityUnavailableReason,
  type DeviceErrorCode,
  type DeviceRuntime,
  type DeviceShareContent,
} from "./contracts";

const SHARE_PROTOCOLS = new Set(["http:", "https:"]);

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
