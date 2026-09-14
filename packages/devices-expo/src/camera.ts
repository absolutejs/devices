import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import {
  DeviceError,
  availableCapability,
  type DeviceCameraCapability,
  type DevicePermissionStatus,
  type DevicePhoto,
  type DevicePhotosCapability,
  type DevicePhotoTransform,
  type DeviceRestoredOperation,
} from "@absolutejs/devices";
import { expoFailure, expoPermissionStatus } from "./common";
import {
  EXPO_RESTORED_OPERATION_SOURCE,
  type ExpoRestoredOperationSource,
} from "./restoration";

export type ExpoCameraBindings = Pick<
  typeof ImagePicker,
  | "getCameraPermissionsAsync"
  | "getMediaLibraryPermissionsAsync"
  | "getPendingResultAsync"
  | "launchCameraAsync"
  | "launchImageLibraryAsync"
  | "requestCameraPermissionsAsync"
> & {
  manipulateAsync: typeof ImageManipulator.manipulateAsync;
};

export type ExpoPhotosCapability = DevicePhotosCapability &
  ExpoRestoredOperationSource;

const defaultBindings = (): ExpoCameraBindings => ({
  ...ImagePicker,
  manipulateAsync: ImageManipulator.manipulateAsync,
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

const photo = async (
  asset: ImagePicker.ImagePickerAsset,
  transform: DevicePhotoTransform | undefined,
  bindings: ExpoCameraBindings,
): Promise<DevicePhoto> => {
  validateTransform(transform);
  const result = transform
    ? await bindings.manipulateAsync(
        asset.uri,
        [{ resize: { height: transform.height, width: transform.width } }],
        {
          compress: (transform.quality ?? 100) / 100,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      )
    : asset;
  return {
    ...(asset.mimeType ? { format: asset.mimeType } : {}),
    height: result.height,
    ...(asset.fileName ? { name: asset.fileName } : {}),
    ...(asset.fileSize === undefined ? {} : { sizeBytes: asset.fileSize }),
    uri: result.uri,
    webPath: result.uri,
    width: result.width,
  };
};

const requireResult = (result: ImagePicker.ImagePickerResult) => {
  if (result.canceled)
    throw new DeviceError("cancelled", "Photo selection was cancelled.");
  const assets = result.assets ?? [];
  if (assets.length === 0)
    throw new DeviceError("failed", "The native picker returned no photos.");
  return assets;
};

const cameraPermission = (
  value: ImagePicker.CameraPermissionResponse,
): DevicePermissionStatus => expoPermissionStatus(value);

export const createExpoCameraCapability = (
  bindings: ExpoCameraBindings = defaultBindings(),
): DeviceCameraCapability => ({
  capability: async () => availableCapability("native"),
  queryPermission: async () => {
    try {
      return cameraPermission(await bindings.getCameraPermissionsAsync());
    } catch (error) {
      throw expoFailure(error, "Failed to read native camera permission.");
    }
  },
  requestPermission: async () => {
    try {
      return cameraPermission(await bindings.requestCameraPermissionsAsync());
    } catch (error) {
      throw expoFailure(error, "Failed to request native camera permission.");
    }
  },
  takePhoto: async (options) => {
    validateTransform(options?.transform);
    try {
      const assets = requireResult(
        await bindings.launchCameraAsync({
          cameraType:
            options?.direction === "front"
              ? ImagePicker.CameraType.front
              : ImagePicker.CameraType.back,
          exif: false,
          mediaTypes: ["images"],
          quality: 1,
        }),
      );
      return await photo(assets[0]!, options?.transform, bindings);
    } catch (error) {
      if (error instanceof DeviceError) throw error;
      throw expoFailure(error, "Failed to take a native photo.");
    }
  },
});

export const createExpoPhotosCapability = (
  bindings: ExpoCameraBindings = defaultBindings(),
): ExpoPhotosCapability => {
  let restored: DeviceRestoredOperation | undefined;
  let pendingRead: Promise<DeviceRestoredOperation | null> | undefined;
  const takeRestoredOperation = () => {
    if (restored) return Promise.resolve(restored);
    pendingRead ??= (async (): Promise<DeviceRestoredOperation | null> => {
      try {
        const result = await bindings.getPendingResultAsync();
        if (result === null) return null;
        if ("code" in result) {
          restored = {
            error: { code: result.code, message: result.message },
            method: "pick",
            plugin: "expo-image-picker",
            success: false,
          };
          return restored;
        }
        if (result.canceled) {
          restored = {
            error: { code: "cancelled", message: "Photo selection was cancelled." },
            method: "pick",
            plugin: "expo-image-picker",
            success: false,
          };
          return restored;
        }
        const assets = result.assets ?? [];
        if (assets.length === 0) {
          restored = {
            error: {
              code: "failed",
              message: "The restored native picker returned no photos.",
            },
            method: "pick",
            plugin: "expo-image-picker",
            success: false,
          };
          return restored;
        }
        restored = {
          data: await Promise.all(
            assets.slice(0, 100).map((asset) => photo(asset, undefined, bindings)),
          ),
          method: "pick",
          plugin: "expo-image-picker",
          success: true,
        };
        return restored;
      } catch (error) {
        const normalized = expoFailure(
          error,
          "Failed to restore native photo selection.",
        );
        restored = {
          error: { code: normalized.code, message: normalized.message },
          method: "pick",
          plugin: "expo-image-picker",
          success: false,
        };
        return restored;
      }
    })().finally(() => {
      pendingRead = undefined;
    });
    return pendingRead;
  };

  return {
    [EXPO_RESTORED_OPERATION_SOURCE]: takeRestoredOperation,
    capability: async () => availableCapability("native"),
    pick: async (options) => {
    validateTransform(options?.transform);
    const limit = options?.limit ?? 1;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new TypeError("Photo pick limit must be an integer from 1 to 100.");
    try {
      const result = await bindings.launchImageLibraryAsync({
        allowsMultipleSelection: limit > 1,
        exif: false,
        mediaTypes: ["images"],
        quality: 1,
        selectionLimit: limit,
      });
      if (result.canceled) return [];
      return await Promise.all(
        (result.assets ?? []).slice(0, limit).map((asset) =>
          photo(asset, options?.transform, bindings),
        ),
      );
    } catch (error) {
      throw expoFailure(error, "Failed to pick native photos.");
    }
    },
  };
};
