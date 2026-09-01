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
} from "@absolutejs/devices";
import { expoFailure, expoPermissionStatus } from "./common";

export type ExpoCameraBindings = Pick<
  typeof ImagePicker,
  | "getCameraPermissionsAsync"
  | "getMediaLibraryPermissionsAsync"
  | "launchCameraAsync"
  | "launchImageLibraryAsync"
  | "requestCameraPermissionsAsync"
> & {
  manipulateAsync: typeof ImageManipulator.manipulateAsync;
};

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
): DevicePhotosCapability => ({
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
});
