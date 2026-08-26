import {
  Camera,
  CameraDirection,
  MediaTypeSelection,
  type CameraPermissionState,
  type CameraPlugin,
  type MediaResult,
} from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import {
  DeviceError,
  availableCapability,
  normalizeDeviceError,
  unavailableCapability,
  type DeviceCameraCapability,
  type DevicePermissionStatus,
  type DevicePhoto,
  type DevicePhotosCapability,
  type DevicePhotoTransform,
} from "@absolutejs/devices";
import type { CapacitorRuntimeBindings } from "./index";

export type CapacitorCameraBindings = {
  camera: CameraPlugin;
  capacitor: CapacitorRuntimeBindings & {
    convertFileSrc?(path: string): string;
  };
};

const defaultBindings = (): CapacitorCameraBindings => ({
  camera: Camera,
  capacitor: Capacitor,
});

const installed = (bindings: CapacitorCameraBindings) =>
  bindings.capacitor.isNativePlatform() &&
  bindings.capacitor.isPluginAvailable("Camera");

const requireInstalled = (bindings: CapacitorCameraBindings) => {
  if (!installed(bindings))
    throw new DeviceError(
      "unsupported",
      "The Capacitor Camera plugin is not installed.",
    );
};

const permissionStatus = (
  state: CameraPermissionState,
): DevicePermissionStatus => ({
  canRequest: state === "prompt" || state === "prompt-with-rationale",
  state:
    state === "prompt-with-rationale"
      ? "prompt"
      : state === "limited"
        ? "limited"
        : state,
});

const validateTransform = (transform?: DevicePhotoTransform) => {
  if (!transform) return;
  if (
    !Number.isInteger(transform.width) ||
    transform.width < 1 ||
    !Number.isInteger(transform.height) ||
    transform.height < 1 ||
    (transform.quality !== undefined &&
      (!Number.isInteger(transform.quality) ||
        transform.quality < 0 ||
        transform.quality > 100))
  )
    throw new TypeError(
      "Photo transforms require positive integer dimensions and quality from 0 to 100.",
    );
};

const photo = (
  result: MediaResult,
  bindings: CapacitorCameraBindings,
): DevicePhoto => {
  const webPath =
    result.webPath ??
    (result.uri && bindings.capacitor.convertFileSrc
      ? bindings.capacitor.convertFileSrc(result.uri)
      : result.uri);
  if (!webPath)
    throw new DeviceError(
      "failed",
      "The native camera returned a photo without a usable path.",
    );
  return {
    ...(result.uri ? { uri: result.uri } : {}),
    webPath,
  };
};

const nativeFailure = (error: unknown, message: string) => {
  const code =
    typeof error === "object" && error !== null
      ? String(Reflect.get(error, "code") ?? "")
      : "";
  if (code === "OS-PLUG-CAMR-0006" || code === "OS-PLUG-CAMR-0020")
    return new DeviceError("cancelled", "Photo selection was cancelled.", {
      cause: error,
    });
  if (code === "OS-PLUG-CAMR-0003")
    return new DeviceError(
      "permission-denied",
      "Camera permission was denied.",
      {
        cause: error,
      },
    );
  if (code === "OS-PLUG-CAMR-0007")
    return new DeviceError("unavailable", "No camera is available.", {
      cause: error,
    });
  return normalizeDeviceError(error, { message });
};

export const createCapacitorCameraCapability = (
  bindings: CapacitorCameraBindings = defaultBindings(),
): DeviceCameraCapability => {
  const queryPermission = async () => {
    requireInstalled(bindings);
    try {
      return permissionStatus(
        (await bindings.camera.checkPermissions()).camera,
      );
    } catch (error) {
      throw nativeFailure(error, "Failed to read native camera permission.");
    }
  };
  return {
    capability: async () =>
      installed(bindings)
        ? availableCapability("native")
        : unavailableCapability(
            "unsupported",
            "The Capacitor Camera plugin is not installed.",
          ),
    queryPermission,
    requestPermission: async () => {
      requireInstalled(bindings);
      try {
        return permissionStatus(
          (
            await bindings.camera.requestPermissions({
              permissions: ["camera"],
            })
          ).camera,
        );
      } catch (error) {
        throw nativeFailure(
          error,
          "Failed to request native camera permission.",
        );
      }
    },
    takePhoto: async (options) => {
      requireInstalled(bindings);
      validateTransform(options?.transform);
      const permission = await queryPermission();
      if (permission.state !== "granted")
        throw new DeviceError(
          permission.state === "denied"
            ? "permission-denied"
            : permission.state === "blocked"
              ? "permission-blocked"
              : "permission-required",
          "Camera permission must be explicitly granted before taking a photo.",
        );
      try {
        const transform = options?.transform;
        const result = await bindings.camera.takePhoto({
          cameraDirection:
            options?.direction === "front"
              ? CameraDirection.Front
              : CameraDirection.Rear,
          correctOrientation: true,
          includeMetadata: false,
          saveToGallery: false,
          ...(transform
            ? {
                quality: transform.quality,
                targetHeight: transform.height,
                targetWidth: transform.width,
              }
            : {}),
        });
        return photo(result, bindings);
      } catch (error) {
        throw nativeFailure(error, "Failed to take a native photo.");
      }
    },
  };
};

export const createCapacitorPhotosCapability = (
  bindings: CapacitorCameraBindings = defaultBindings(),
): DevicePhotosCapability => ({
  capability: async () =>
    installed(bindings)
      ? availableCapability("native")
      : unavailableCapability(
          "unsupported",
          "The Capacitor photo picker is not installed.",
        ),
  pick: async (options) => {
    requireInstalled(bindings);
    if (
      options?.limit !== undefined &&
      (!Number.isInteger(options.limit) || options.limit < 1)
    )
      throw new TypeError("Photo picker limit must be a positive integer.");
    validateTransform(options?.transform);
    try {
      const transform = options?.transform;
      const result = await bindings.camera.chooseFromGallery({
        allowMultipleSelection: options?.limit !== 1,
        correctOrientation: true,
        includeMetadata: false,
        limit: options?.limit,
        mediaType: MediaTypeSelection.Photo,
        ...(transform
          ? {
              quality: transform.quality,
              targetHeight: transform.height,
              targetWidth: transform.width,
            }
          : {}),
      });
      return result.results.map((item) => photo(item, bindings));
    } catch (error) {
      throw nativeFailure(error, "Failed to choose native photos.");
    }
  },
});
