import {
  DeviceError,
  type DeviceCapabilityFidelity,
  type DeviceCapabilityStatus,
  type DeviceCapabilityUnavailableReason,
  type DeviceErrorCode,
  type DeviceRuntime,
} from "./contracts";

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
