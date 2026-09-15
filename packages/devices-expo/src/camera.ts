import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  EXPO_ABANDONED_OPERATION_SOURCE,
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

export type ExpoCameraCapability = DeviceCameraCapability &
  ExpoRestoredOperationSource;
export type ExpoPhotosCapability = DevicePhotosCapability & ExpoRestoredOperationSource;

const nativeBindings: ExpoCameraBindings = {
  ...ImagePicker,
  manipulateAsync: ImageManipulator.manipulateAsync,
};

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

type PendingPhotoOperation = {
  kind: "pick" | "takePhoto";
  limit: number;
  transform?: DevicePhotoTransform;
};

const PENDING_PHOTO_OPERATION_KEY =
  "@absolutejs/devices-expo/pending-photo-operation";

const storedOperation = async (): Promise<PendingPhotoOperation | undefined> => {
  const value = await AsyncStorage.getItem(PENDING_PHOTO_OPERATION_KEY);
  if (value === null) return;
  try {
    const parsed = JSON.parse(value) as Partial<PendingPhotoOperation>;
    if (
      (parsed.kind !== "pick" && parsed.kind !== "takePhoto") ||
      !Number.isInteger(parsed.limit) ||
      (parsed.limit ?? 0) < 1
    )
      return;
    return parsed as PendingPhotoOperation;
  } catch {
    return;
  }
};

const restorations = new WeakMap<object, {
  begin(operation: PendingPhotoOperation): Promise<void>;
  complete(): Promise<void>;
  source: ExpoRestoredOperationSource;
}>();

const restorationFor = (bindings: ExpoCameraBindings) => {
  const known = restorations.get(bindings);
  if (known) return known;
  let operation: PendingPhotoOperation | undefined;
  let restored: DeviceRestoredOperation | undefined;
  let pendingRead: Promise<DeviceRestoredOperation | null> | undefined;
  const source: ExpoRestoredOperationSource = {
    [EXPO_RESTORED_OPERATION_SOURCE]: () => {
      if (restored) return Promise.resolve(restored);
      pendingRead ??= (async (): Promise<DeviceRestoredOperation | null> => {
        try {
          const result = await bindings.getPendingResultAsync();
          if (result === null) return null;
          operation ??= await storedOperation();
          const method = operation?.kind ?? "pick";
          if ("code" in result)
            restored = {
              error: { code: result.code, message: result.message },
              method,
              plugin: "expo-image-picker",
              success: false,
            };
          else if (result.canceled)
            restored = {
              error: { code: "cancelled", message: "Photo selection was cancelled." },
              method,
              plugin: "expo-image-picker",
              success: false,
            };
          else {
            const assets = result.assets ?? [];
            if (assets.length === 0)
              restored = {
                error: {
                  code: "failed",
                  message: "The restored native picker returned no photos.",
                },
                method,
                plugin: "expo-image-picker",
                success: false,
              };
            else {
              const selected = await Promise.all(
                assets
                  .slice(0, operation?.limit ?? 100)
                  .map((asset) => photo(asset, operation?.transform, bindings)),
              );
              restored = {
                data: method === "takePhoto" ? selected[0] : selected,
                method,
                plugin: "expo-image-picker",
                success: true,
              };
            }
          }
          await AsyncStorage.removeItem(PENDING_PHOTO_OPERATION_KEY);
          return restored;
        } catch (error) {
          const normalized = expoFailure(
            error,
            "Failed to restore native photo selection.",
          );
          restored = {
            error: { code: normalized.code, message: normalized.message },
            method: operation?.kind ?? "pick",
            plugin: "expo-image-picker",
            success: false,
          };
          return restored;
        }
      })().finally(() => {
        pendingRead = undefined;
      });
      return pendingRead;
    },
    [EXPO_ABANDONED_OPERATION_SOURCE]: async () => {
      if (restored) return restored;
      // An operation held in this adapter instance still has a live promise.
      // Only a descriptor inherited by a fresh JavaScript process is abandoned.
      if (operation) return null;
      const abandoned = await storedOperation();
      if (!abandoned) return null;
      restored = {
        error: {
          code: "cancelled",
          message: "Photo selection was cancelled after the native picker closed.",
        },
        method: abandoned.kind,
        plugin: "expo-image-picker",
        success: false,
      };
      await AsyncStorage.removeItem(PENDING_PHOTO_OPERATION_KEY);
      return restored;
    },
  };
  const created = {
    async begin(value: PendingPhotoOperation) {
      operation = value;
      restored = undefined;
      await AsyncStorage.setItem(PENDING_PHOTO_OPERATION_KEY, JSON.stringify(value));
    },
    async complete() {
      operation = undefined;
      await AsyncStorage.removeItem(PENDING_PHOTO_OPERATION_KEY);
    },
    source,
  };
  restorations.set(bindings, created);
  return created;
};

export const createExpoCameraCapability = (
  bindings: ExpoCameraBindings = nativeBindings,
): ExpoCameraCapability => {
  const restoration = restorationFor(bindings);
  return {
  [EXPO_RESTORED_OPERATION_SOURCE]:
    restoration.source[EXPO_RESTORED_OPERATION_SOURCE],
  [EXPO_ABANDONED_OPERATION_SOURCE]:
    restoration.source[EXPO_ABANDONED_OPERATION_SOURCE],
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
    await restoration.begin({ kind: "takePhoto", limit: 1, transform: options?.transform });
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
      const selected = await photo(assets[0]!, options?.transform, bindings);
      return selected;
    } catch (error) {
      if (error instanceof DeviceError) throw error;
      throw expoFailure(error, "Failed to take a native photo.");
    } finally {
      await restoration.complete();
    }
  },
  };
};

export const createExpoPhotosCapability = (
  bindings: ExpoCameraBindings = nativeBindings,
): ExpoPhotosCapability => {
  const restoration = restorationFor(bindings);

  return {
    [EXPO_RESTORED_OPERATION_SOURCE]:
      restoration.source[EXPO_RESTORED_OPERATION_SOURCE],
    [EXPO_ABANDONED_OPERATION_SOURCE]:
      restoration.source[EXPO_ABANDONED_OPERATION_SOURCE],
    capability: async () => availableCapability("native"),
    pick: async (options) => {
    validateTransform(options?.transform);
    const limit = options?.limit ?? 1;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new TypeError("Photo pick limit must be an integer from 1 to 100.");
    await restoration.begin({ kind: "pick", limit, transform: options?.transform });
    try {
      const result = await bindings.launchImageLibraryAsync({
        allowsMultipleSelection: limit > 1,
        exif: false,
        mediaTypes: ["images"],
        quality: 1,
        selectionLimit: limit,
      });
      if (result.canceled) {
        return [];
      }
      const selected = await Promise.all(
        (result.assets ?? []).slice(0, limit).map((asset) =>
          photo(asset, options?.transform, bindings),
        ),
      );
      return selected;
    } catch (error) {
      throw expoFailure(error, "Failed to pick native photos.");
    } finally {
      await restoration.complete();
    }
    },
  };
};
