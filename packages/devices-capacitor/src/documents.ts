import { FileViewer, type FileViewerPlugin } from "@capacitor/file-viewer";
import {
  Directory,
  Encoding,
  Filesystem,
  type FilesystemPlugin,
} from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { Share, type SharePlugin } from "@capacitor/share";
import {
  DEFAULT_DEVICE_DOCUMENT_MAX_BYTES,
  DeviceError,
  availableCapability,
  normalizeDeviceError,
  unavailableCapability,
  type DeviceDocument,
  type DeviceDocumentsCapability,
  type DevicePickDocumentsOptions,
  type DeviceWriteDocumentOptions,
} from "@absolutejs/devices";
import type { CapacitorRuntimeBindings } from "./index";

const STAGING_DIRECTORY = "absolutejs-documents";

export type CapacitorDocumentsBindings = {
  capacitor: CapacitorRuntimeBindings;
  fileViewer: FileViewerPlugin;
  filesystem: FilesystemPlugin;
  share: SharePlugin;
};

const defaultBindings = (): CapacitorDocumentsBindings => ({
  capacitor: Capacitor,
  fileViewer: FileViewer,
  filesystem: Filesystem,
  share: Share,
});

const maximumBytes = (value?: number) => {
  const maximum = value ?? DEFAULT_DEVICE_DOCUMENT_MAX_BYTES;
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new TypeError(
      "Document maximumBytes must be a positive safe integer.",
    );
  return maximum;
};

const documentName = (name: string) => {
  if (
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    /[/\\\u0000-\u001f\u007f]/.test(name)
  )
    throw new TypeError("Document names must be safe leaf filenames.");
  return name;
};

const acceptValue = (accept?: string[]) => {
  if (accept === undefined) return undefined;
  if (
    accept.length === 0 ||
    accept.some(
      (value) =>
        !/^\.[a-z0-9]+$/i.test(value) &&
        !/^[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+*-]+)$/i.test(value),
    )
  )
    throw new TypeError(
      "Document accept entries must be MIME types or file extensions.",
    );
  return accept.join(",");
};

const documentLimit = (limit?: number) => {
  const value = limit ?? 1;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError("Document limit must be a positive safe integer.");
  return value;
};

const pickDocuments = async (
  options: DevicePickDocumentsOptions = {},
): Promise<DeviceDocument[]> => {
  if (typeof document === "undefined" || !document.body)
    throw new DeviceError(
      "unsupported",
      "Native document selection is unavailable.",
    );
  const limit = documentLimit(options.limit);
  const byteLimit = maximumBytes(options.maximumBytes);
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = limit > 1;
  input.style.display = "none";
  const accept = acceptValue(options.accept);
  if (accept) input.accept = accept;
  document.body.append(input);
  try {
    const files = await new Promise<File[]>((resolve, reject) => {
      const cleanup = () => {
        input.removeEventListener("change", changed);
        input.removeEventListener("cancel", cancelled);
      };
      const changed = () => {
        cleanup();
        resolve(Array.from(input.files ?? []));
      };
      const cancelled = () => {
        cleanup();
        resolve([]);
      };
      input.addEventListener("change", changed, { once: true });
      input.addEventListener("cancel", cancelled, { once: true });
      try {
        input.click();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
    if (files.length === 0)
      throw new DeviceError("cancelled", "Document selection was cancelled.");
    const selected = files.slice(0, limit);
    const oversized = selected.find((file) => file.size > byteLimit);
    if (oversized)
      throw new DeviceError(
        "failed",
        `Document ${oversized.name} exceeds the configured byte limit.`,
      );
    return selected.map((file) => ({
      blob: file,
      ...(Number.isFinite(file.lastModified)
        ? { lastModifiedMs: file.lastModified }
        : {}),
      mimeType: file.type || "application/octet-stream",
      name: file.name,
      sizeBytes: file.size,
    }));
  } finally {
    input.remove();
  }
};

const blobBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

const stagedDocument = async (
  filesystem: FilesystemPlugin,
  options: DeviceWriteDocumentOptions,
) => {
  const name = documentName(options.name);
  const mimeType =
    options.mimeType ??
    (options.content instanceof Blob && options.content.type
      ? options.content.type
      : typeof options.content === "string"
        ? "text/plain;charset=utf-8"
        : "application/octet-stream");
  const blob =
    options.content instanceof Blob
      ? options.content
      : new Blob([options.content], { type: mimeType });
  if (blob.size > maximumBytes(options.maximumBytes))
    throw new DeviceError(
      "failed",
      `Document ${name} exceeds the configured byte limit.`,
    );
  const nonce =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${STAGING_DIRECTORY}/${nonce}-${name}`;
  const result = await filesystem.writeFile({
    data:
      typeof options.content === "string"
        ? options.content
        : await blobBase64(options.content),
    directory: Directory.Cache,
    ...(typeof options.content === "string" ? { encoding: Encoding.UTF8 } : {}),
    path,
    recursive: true,
  });
  return { mimeType, name, path, sizeBytes: blob.size, uri: result.uri };
};

export const createCapacitorDocumentsCapability = (
  bindings: CapacitorDocumentsBindings = defaultBindings(),
): DeviceDocumentsCapability => {
  const native = () => bindings.capacitor.isNativePlatform();
  const installed = (plugin: string) =>
    native() && bindings.capacitor.isPluginAvailable(plugin);
  const remove = async (path: string) => {
    try {
      await bindings.filesystem.deleteFile({
        directory: Directory.Cache,
        path,
      });
    } catch {
      // Cache files are disposable and may already have been removed by the OS.
    }
  };

  return {
    capability: async (operation = "pick") => {
      const available =
        operation === "pick"
          ? native() && typeof document !== "undefined"
          : operation === "export"
            ? installed("Filesystem") && installed("Share")
            : installed("Filesystem") && installed("FileViewer");
      return available
        ? availableCapability("native")
        : unavailableCapability(
            "unsupported",
            `Native document ${operation} is unavailable.`,
          );
    },
    export: async (options) => {
      if (!installed("Filesystem") || !installed("Share"))
        throw new DeviceError(
          "unsupported",
          "Native document export is unavailable.",
        );
      let staged: Awaited<ReturnType<typeof stagedDocument>> | undefined;
      try {
        staged = await stagedDocument(bindings.filesystem, options);
        const result = await bindings.share.share({ files: [staged.uri] });
        return {
          ...(result.activityType ? { activity: result.activityType } : {}),
          mimeType: staged.mimeType,
          name: staged.name,
          native: result,
          sizeBytes: staged.sizeBytes,
        };
      } catch (error) {
        if (error instanceof DeviceError || error instanceof TypeError)
          throw error;
        throw normalizeDeviceError(error, {
          message: "Native document export failed.",
        });
      } finally {
        if (staged) await remove(staged.path);
      }
    },
    open: async (options) => {
      if (!installed("Filesystem") || !installed("FileViewer"))
        throw new DeviceError(
          "unsupported",
          "Native document preview is unavailable.",
        );
      let staged: Awaited<ReturnType<typeof stagedDocument>> | undefined;
      try {
        staged = await stagedDocument(bindings.filesystem, options);
        await bindings.fileViewer.openDocumentFromLocalPath({
          path: staged.uri,
        });
      } catch (error) {
        if (error instanceof DeviceError || error instanceof TypeError)
          throw error;
        throw normalizeDeviceError(error, {
          message: "Native document preview failed.",
        });
      } finally {
        if (staged) await remove(staged.path);
      }
    },
    pick: pickDocuments,
  };
};
