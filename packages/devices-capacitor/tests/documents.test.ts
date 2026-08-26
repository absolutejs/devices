import { describe, expect, mock, test } from "bun:test";
import type { FileViewerPlugin } from "@capacitor/file-viewer";
import type { FilesystemPlugin } from "@capacitor/filesystem";
import type { SharePlugin } from "@capacitor/share";
import { createCapacitorDocumentsCapability } from "../src/documents";

const runtime = (plugins: string[]) => ({
  getPlatform: () => "ios",
  isNativePlatform: () => true,
  isPluginAvailable: (name: string) => plugins.includes(name),
});

const bindings = (plugins = ["FileViewer", "Filesystem", "Share"]) => {
  const deleteFile = mock(async () => undefined);
  const writeFile = mock(async (options: { path: string }) => ({
    uri: `file:///cache/${options.path}`,
  }));
  const openDocumentFromLocalPath = mock(async () => undefined);
  const share = mock(async () => ({ activityType: "save" }));
  return {
    bindings: {
      capacitor: runtime(plugins),
      fileViewer: { openDocumentFromLocalPath } as unknown as FileViewerPlugin,
      filesystem: { deleteFile, writeFile } as unknown as FilesystemPlugin,
      share: {
        canShare: async () => ({ value: true }),
        share,
      } as SharePlugin,
    },
    deleteFile,
    openDocumentFromLocalPath,
    share,
    writeFile,
  };
};

describe("Capacitor documents capability", () => {
  test("exports through the native share sheet and erases its cache file", async () => {
    const harness = bindings();
    const documents = createCapacitorDocumentsCapability(harness.bindings);

    const result = await documents.export({
      content: "portable report",
      name: "report.txt",
    });
    expect(result).toMatchObject({
      activity: "save",
      mimeType: "text/plain;charset=utf-8",
      name: "report.txt",
      sizeBytes: 15,
    });
    expect(result).not.toHaveProperty("uri");
    expect(harness.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        data: "portable report",
        directory: "CACHE",
        encoding: "utf8",
        recursive: true,
      }),
    );
    expect(harness.share).toHaveBeenCalledWith({
      files: [
        expect.stringMatching(/^file:\/\/\/cache\/absolutejs-documents\//),
      ],
    });
    expect(harness.deleteFile).toHaveBeenCalledTimes(1);
  });

  test("previews binary content and cleans up even when the viewer fails", async () => {
    const harness = bindings();
    harness.openDocumentFromLocalPath.mockImplementationOnce(async () => {
      throw new Error("viewer failed");
    });
    const documents = createCapacitorDocumentsCapability(harness.bindings);

    await expect(
      documents.open({
        content: new Blob([new Uint8Array([0, 1, 2])], {
          type: "application/pdf",
        }),
        name: "sample.pdf",
      }),
    ).rejects.toMatchObject({
      code: "failed",
      message: "Native document preview failed.",
    });
    expect(harness.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ data: "AAEC", directory: "CACHE" }),
    );
    expect(harness.deleteFile).toHaveBeenCalledTimes(1);
  });

  test("fails closed for missing plugins, unsafe names, and oversized data", async () => {
    const missing = bindings(["Filesystem"]);
    const documents = createCapacitorDocumentsCapability(missing.bindings);
    expect(await documents.capability("export")).toMatchObject({
      available: false,
      reason: "unsupported",
    });
    await expect(
      documents.export({ content: "x", name: "report.txt" }),
    ).rejects.toMatchObject({ code: "unsupported" });

    const installed = createCapacitorDocumentsCapability(bindings().bindings);
    await expect(
      installed.export({ content: "x", name: "../private.txt" }),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      installed.export({
        content: "too large",
        maximumBytes: 2,
        name: "report.txt",
      }),
    ).rejects.toMatchObject({ code: "failed" });
  });
});
