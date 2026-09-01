import * as Location from "expo-location";
import {
  DeviceError,
  availableCapability,
  validateDeviceLocationOptions,
  type DeviceLocationCapability,
  type DeviceLocationPermissionStatus,
  type DeviceLocationPosition,
} from "@absolutejs/devices";
import { expoFailure, expoPermissionStatus, removable } from "./common";

export type ExpoLocationBindings = Pick<
  typeof Location,
  | "getCurrentPositionAsync"
  | "getForegroundPermissionsAsync"
  | "getLastKnownPositionAsync"
  | "requestForegroundPermissionsAsync"
  | "watchPositionAsync"
>;

const permission = (
  value: Location.LocationPermissionResponse,
): DeviceLocationPermissionStatus => {
  const normalized = expoPermissionStatus(value);
  const precision =
    value.ios?.accuracy === "full" || value.android?.accuracy === "fine"
      ? "precise"
      : value.ios?.accuracy === "reduced" || value.android?.accuracy === "coarse"
        ? "coarse"
        : "unknown";
  return { ...normalized, precision };
};

const position = (value: Location.LocationObject): DeviceLocationPosition => ({
  accuracyMeters: value.coords.accuracy ?? Number.POSITIVE_INFINITY,
  ...(value.coords.altitudeAccuracy === null
    ? {}
    : { altitudeAccuracyMeters: value.coords.altitudeAccuracy }),
  ...(value.coords.altitude === null
    ? {}
    : { altitudeMeters: value.coords.altitude }),
  ...(value.coords.heading === null
    ? {}
    : { headingDegrees: value.coords.heading }),
  latitude: value.coords.latitude,
  longitude: value.coords.longitude,
  native: value,
  ...(value.coords.speed === null
    ? {}
    : { speedMetersPerSecond: value.coords.speed }),
  timestampMs: value.timestamp,
});

const accuracy = (value: "balanced" | "high" | undefined) =>
  value === "high" ? Location.Accuracy.High : Location.Accuracy.Balanced;

const timeout = async <T>(operation: Promise<T>, timeoutMs?: number) => {
  if (timeoutMs === undefined) return operation;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new DeviceError(
                "temporarily-unavailable",
                "Native location request timed out.",
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const createExpoLocationCapability = (
  bindings: ExpoLocationBindings = Location,
): DeviceLocationCapability => ({
  capability: async () => availableCapability("native"),
  current: async (options) => {
    validateDeviceLocationOptions(options);
    try {
      if (options?.maximumAgeMs !== undefined) {
        const cached = await bindings.getLastKnownPositionAsync({
          maxAge: options.maximumAgeMs,
        });
        if (cached) return position(cached);
      }
      return position(
        await timeout(
          bindings.getCurrentPositionAsync({ accuracy: accuracy(options?.accuracy) }),
          options?.timeoutMs,
        ),
      );
    } catch (error) {
      if (error instanceof DeviceError) throw error;
      throw expoFailure(error, "Failed to read native location.");
    }
  },
  queryPermission: async () => {
    try {
      return permission(await bindings.getForegroundPermissionsAsync());
    } catch (error) {
      throw expoFailure(error, "Failed to read native location permission.");
    }
  },
  requestPermission: async (options) => {
    if (options?.precision && !["coarse", "precise"].includes(options.precision))
      throw new TypeError("Location precision must be coarse or precise.");
    try {
      return permission(await bindings.requestForegroundPermissionsAsync());
    } catch (error) {
      throw expoFailure(error, "Failed to request native location permission.");
    }
  },
  watch: async (listener, options) => {
    validateDeviceLocationOptions(options);
    try {
      const subscription = await bindings.watchPositionAsync(
        {
          accuracy: accuracy(options?.accuracy),
          ...(options?.minimumUpdateIntervalMs === undefined
            ? {}
            : { timeInterval: options.minimumUpdateIntervalMs }),
        },
        (value) => listener({ position: position(value), type: "position" }),
        (message) =>
          listener({
            error: new DeviceError("temporarily-unavailable", message),
            type: "error",
          }),
      );
      return removable(() => subscription.remove());
    } catch (error) {
      throw expoFailure(error, "Failed to watch native location.");
    }
  },
});
