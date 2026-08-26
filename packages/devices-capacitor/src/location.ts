import { Capacitor } from "@capacitor/core";
import {
  Geolocation,
  type GeolocationPlugin,
  type PermissionStatus,
  type Position,
  type PositionOptions,
} from "@capacitor/geolocation";
import {
  DeviceError,
  availableCapability,
  normalizeDeviceError,
  unavailableCapability,
  validateDeviceLocationOptions,
  type DeviceLocationCapability,
  type DeviceLocationPermissionStatus,
  type DeviceLocationPosition,
  type DeviceLocationWatchOptions,
} from "@absolutejs/devices";
import type { CapacitorRuntimeBindings } from "./index";

export type CapacitorLocationBindings = {
  capacitor: CapacitorRuntimeBindings;
  geolocation: GeolocationPlugin;
};

const defaultBindings = (): CapacitorLocationBindings => ({
  capacitor: Capacitor,
  geolocation: Geolocation,
});

const installed = (bindings: CapacitorLocationBindings) =>
  bindings.capacitor.isNativePlatform() &&
  bindings.capacitor.isPluginAvailable("Geolocation");

const requireInstalled = (bindings: CapacitorLocationBindings) => {
  if (!installed(bindings))
    throw new DeviceError(
      "unsupported",
      "The Capacitor Geolocation plugin is not installed.",
    );
};

const permissionStatus = (
  status: PermissionStatus,
): DeviceLocationPermissionStatus => {
  if (status.location === "granted")
    return {
      canRequest: false,
      native: status,
      precision: "precise",
      state: "granted",
    };
  if (status.coarseLocation === "granted")
    return {
      canRequest: false,
      native: status,
      precision: "coarse",
      state: "granted",
    };
  const state =
    status.location === "prompt-with-rationale" ||
    status.coarseLocation === "prompt-with-rationale"
      ? "prompt"
      : status.location;
  return {
    canRequest: state === "prompt",
    native: status,
    precision: "unknown",
    state,
  };
};

const nativeFailure = (error: unknown, message: string) => {
  const code =
    typeof error === "object" && error !== null
      ? String(Reflect.get(error, "code") ?? "")
      : "";
  if (code === "OS-PLUG-GLOC-0003" || code === "OS-PLUG-GLOC-0009")
    return new DeviceError("permission-denied", "Location access was denied.", {
      cause: error,
    });
  if (code === "OS-PLUG-GLOC-0008")
    return new DeviceError(
      "permission-blocked",
      "Location access is blocked by system policy.",
      { cause: error },
    );
  if (code === "OS-PLUG-GLOC-0007")
    return new DeviceError(
      "unavailable",
      "System location services are disabled.",
      { cause: error },
    );
  if (
    code === "OS-PLUG-GLOC-0010" ||
    code === "OS-PLUG-GLOC-0014" ||
    code === "OS-PLUG-GLOC-0015" ||
    code === "OS-PLUG-GLOC-0016" ||
    code === "OS-PLUG-GLOC-0017"
  )
    return new DeviceError("temporarily-unavailable", message, {
      cause: error,
    });

  return normalizeDeviceError(error, { message });
};

const optionalFinite = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const position = (value: Position): DeviceLocationPosition => {
  const { coords } = value;
  if (
    !Number.isFinite(coords.latitude) ||
    !Number.isFinite(coords.longitude) ||
    !Number.isFinite(coords.accuracy) ||
    !Number.isFinite(value.timestamp)
  )
    throw new DeviceError(
      "failed",
      "The native provider returned an invalid location position.",
    );
  const altitudeAccuracyMeters = optionalFinite(coords.altitudeAccuracy);
  const altitudeMeters = optionalFinite(coords.altitude);
  const headingDegrees = optionalFinite(coords.heading);
  const speedMetersPerSecond = optionalFinite(coords.speed);

  return {
    accuracyMeters: coords.accuracy,
    ...(altitudeAccuracyMeters === undefined ? {} : { altitudeAccuracyMeters }),
    ...(altitudeMeters === undefined ? {} : { altitudeMeters }),
    ...(headingDegrees === undefined ? {} : { headingDegrees }),
    latitude: coords.latitude,
    longitude: coords.longitude,
    native: value,
    ...(speedMetersPerSecond === undefined ? {} : { speedMetersPerSecond }),
    timestampMs: value.timestamp,
  };
};

const providerOptions = (
  options?: DeviceLocationWatchOptions,
): PositionOptions => {
  validateDeviceLocationOptions(options);
  return {
    enableHighAccuracy: options?.accuracy === "high",
    enableLocationFallback: true,
    ...(options?.intervalMs === undefined
      ? {}
      : { interval: options.intervalMs }),
    ...(options?.maximumAgeMs === undefined
      ? {}
      : { maximumAge: options.maximumAgeMs }),
    ...(options?.minimumUpdateIntervalMs === undefined
      ? {}
      : { minimumUpdateInterval: options.minimumUpdateIntervalMs }),
    ...(options?.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
  };
};

export const createCapacitorLocationCapability = (
  bindings: CapacitorLocationBindings = defaultBindings(),
): DeviceLocationCapability => {
  const queryPermission = async () => {
    requireInstalled(bindings);
    try {
      return permissionStatus(await bindings.geolocation.checkPermissions());
    } catch (error) {
      throw nativeFailure(error, "Failed to read native location permission.");
    }
  };

  return {
    capability: async () =>
      installed(bindings)
        ? availableCapability("native")
        : unavailableCapability(
            "unsupported",
            "The Capacitor Geolocation plugin is not installed.",
          ),
    current: async (options) => {
      requireInstalled(bindings);
      try {
        return position(
          await bindings.geolocation.getCurrentPosition(
            providerOptions(options),
          ),
        );
      } catch (error) {
        throw nativeFailure(error, "Failed to read the current location.");
      }
    },
    queryPermission,
    requestPermission: async (options) => {
      requireInstalled(bindings);
      const precision = options?.precision ?? "precise";
      if (precision !== "coarse" && precision !== "precise")
        throw new TypeError(
          "Location permission precision must be coarse or precise.",
        );
      try {
        return permissionStatus(
          await bindings.geolocation.requestPermissions({
            permissions: [
              precision === "coarse" ? "coarseLocation" : "location",
            ],
          }),
        );
      } catch (error) {
        throw nativeFailure(error, "Failed to request location permission.");
      }
    },
    watch: async (listener, options) => {
      requireInstalled(bindings);
      let active = true;
      let id: string;
      try {
        id = await bindings.geolocation.watchPosition(
          providerOptions(options),
          (value, error) => {
            if (!active) return;
            if (error || value === null) {
              listener({
                error: nativeFailure(error, "A native location update failed."),
                type: "error",
              });
              return;
            }
            try {
              listener({ position: position(value), type: "position" });
            } catch (cause) {
              listener({
                error: nativeFailure(cause, "A native location update failed."),
                type: "error",
              });
            }
          },
        );
      } catch (error) {
        throw nativeFailure(error, "Failed to start native location updates.");
      }
      return async () => {
        if (!active) return;
        active = false;
        try {
          await bindings.geolocation.clearWatch({ id });
        } catch (error) {
          active = true;
          throw nativeFailure(error, "Failed to stop native location updates.");
        }
      };
    },
  };
};
