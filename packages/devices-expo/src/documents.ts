import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  DEFAULT_DEVICE_DOCUMENT_MAX_BYTES,
  DeviceError,
  availableCapability,
  type DeviceDocumentsCapability,
  type DeviceWriteDocumentOptions,
} from "@absolutejs/devices";
import { expoFailure } from "./common";

const safeName = (name: string) => {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  )
    throw new TypeError("Document name must be a safe leaf filename.");
  return name;
};

const maximum = (value?: number) => {
  const result = value ?? DEFAULT_DEVICE_DOCUMENT_MAX_BYTES;
  if (!Number.isSafeInteger(result) || result < 1)
    throw new TypeError("Document maximumBytes must be a positive integer.");
  return result;
};

const contentBytes = async (options: DeviceWriteDocumentOptions) => {
  const bytes =
    typeof options.content === "string"
      ? new TextEncoder().encode(options.content)
      : new Uint8Array(await options.content.arrayBuffer());
  if (bytes.byteLength > maximum(options.maximumBytes))
    throw new DeviceError("failed", "Document content exceeds maximumBytes.");
  return bytes;
};

const temporaryFile = async (options: DeviceWriteDocumentOptions) => {
  const bytes = await contentBytes(options);
  const file = new File(
    Paths.cache,
    `absolutejs-${crypto.randomUUID()}-${safeName(options.name)}`,
  );
  file.create({ overwrite: false });
  file.write(bytes);
  return { bytes, file };
};

export const createExpoDocumentsCapability = (): DeviceDocumentsCapability => ({
  capability: async () =>
    (await Sharing.isAvailableAsync())
      ? availableCapability("native")
      : {
          available: false,
          message: "The native document sharing controller is unavailable.",
          reason: "unsupported",
        },
  export: async (options) => {
    const name = safeName(options.name);
    const mimeType =
      options.mimeType ||
      (options.content instanceof Blob && options.content.type) ||
      "application/octet-stream";
    let created: Awaited<ReturnType<typeof temporaryFile>> | undefined;
    try {
      created = await temporaryFile(options);
      await Sharing.shareAsync(created.file.uri, {
        dialogTitle: `Export ${name}`,
        mimeType,
      });
      return {
        mimeType,
        name,
        native: { uri: created.file.uri },
        sizeBytes: created.bytes.byteLength,
      };
    } catch (error) {
      throw expoFailure(error, "Failed to export the native document.");
    } finally {
      if (created?.file.exists) created.file.delete();
    }
  },
  open: async (options) => {
    let created: Awaited<ReturnType<typeof temporaryFile>> | undefined;
    try {
      created = await temporaryFile(options);
      await Sharing.shareAsync(created.file.uri, {
        dialogTitle: `Open ${safeName(options.name)}`,
        mimeType: options.mimeType,
      });
    } catch (error) {
      throw expoFailure(error, "Failed to open the native document.");
    } finally {
      if (created?.file.exists) created.file.delete();
    }
  },
  pick: async (options) => {
    const limit = options?.limit ?? 1;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new TypeError("Document pick limit must be an integer from 1 to 100.");
    const byteLimit = maximum(options?.maximumBytes);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: limit > 1,
        type: options?.accept ?? "*/*",
      });
      if (result.canceled) return [];
      return await Promise.all(result.assets.slice(0, limit).map(async (asset) => {
        const file = new File(asset.uri);
        const size = asset.size ?? file.size;
        if (size > byteLimit)
          throw new DeviceError(
            "failed",
            `Document ${asset.name} exceeds maximumBytes.`,
          );
        return {
          blob: new Blob([await file.bytes()], {
            type: asset.mimeType ?? (file.type || "application/octet-stream"),
          }),
          ...(file.modificationTime === null
            ? {}
            : { lastModifiedMs: file.modificationTime }),
          mimeType:
            asset.mimeType ?? (file.type || "application/octet-stream"),
          name: safeName(asset.name),
          sizeBytes: size,
        };
      }));
    } catch (error) {
      if (error instanceof DeviceError) throw error;
      throw expoFailure(error, "Failed to pick native documents.");
    }
  },
});
