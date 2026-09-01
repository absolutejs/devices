import {
  DeviceError,
  normalizeDeviceError,
  type DevicePermissionStatus,
  type DeviceSubscription,
} from "@absolutejs/devices";

export type ExpoPermissionResponse = {
  canAskAgain: boolean;
  granted: boolean;
  status: "denied" | "granted" | "undetermined";
};

export const expoPermissionStatus = (
  value: ExpoPermissionResponse,
  limited = false,
): DevicePermissionStatus => ({
  canRequest: !value.granted && value.canAskAgain,
  native: value,
  state: value.granted
    ? limited
      ? "limited"
      : "granted"
    : value.status === "undetermined"
      ? "prompt"
      : value.canAskAgain
        ? "denied"
        : "blocked",
});

export const expoFailure = (error: unknown, message: string) => {
  const code =
    typeof error === "object" && error !== null
      ? String(Reflect.get(error, "code") ?? "")
      : "";
  if (/cancel/iu.test(code) || /cancel/iu.test(String(error)))
    return new DeviceError("cancelled", message, { cause: error });
  if (/permission/iu.test(code))
    return new DeviceError("permission-denied", message, { cause: error });
  return normalizeDeviceError(error, { message });
};

export const removable = (remove: () => void | Promise<void>): DeviceSubscription => {
  let active = true;
  return async () => {
    if (!active) return;
    await remove();
    active = false;
  };
};

export const safeExternalUrl = (value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new DeviceError("failed", "External URL is invalid.", { cause });
  }
  if (
    url.username ||
    url.password ||
    (url.protocol !== "http:" && url.protocol !== "https:")
  )
    throw new DeviceError(
      "failed",
      "External URLs must be credential-free HTTP(S) URLs.",
    );
  return url.href;
};
