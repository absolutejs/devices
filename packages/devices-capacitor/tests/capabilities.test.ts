import { describe, expect, mock, test } from "bun:test";
import { createCapacitorClipboardCapability } from "../src/clipboard";
import { createCapacitorHapticsCapability } from "../src/haptics";
import { createCapacitorShareCapability } from "../src/share";
import {
  createCapacitorCameraCapability,
  createCapacitorPhotosCapability,
} from "../src/camera";
import type { CameraPlugin } from "@capacitor/camera";

const runtime = (plugins: string[]) => ({
  getPlatform: () => "ios",
  isNativePlatform: () => true,
  isPluginAvailable: (name: string) => plugins.includes(name),
});

describe("optional Capacitor capabilities", () => {
  test("keeps camera permission explicit and gallery access picker-scoped", async () => {
    let cameraPermission = "prompt" as const | "granted";
    const takePhoto = mock(async () => ({
      saved: false,
      type: 0,
      uri: "file:///capture.jpg",
      webPath: "capacitor://capture.jpg",
    }));
    const chooseFromGallery = mock(async () => ({
      results: [
        {
          saved: false,
          type: 0,
          uri: "file:///chosen.jpg",
          webPath: "capacitor://chosen.jpg",
        },
      ],
    }));
    const requestPermissions = mock(async () => {
      cameraPermission = "granted";
      return { camera: cameraPermission, photos: "prompt" as const };
    });
    const cameraPlugin = {
      checkPermissions: async () => ({
        camera: cameraPermission,
        photos: "prompt" as const,
      }),
      chooseFromGallery,
      requestPermissions,
      takePhoto,
    } as unknown as CameraPlugin;
    const bindings = {
      camera: cameraPlugin,
      capacitor: runtime(["Camera"]),
    };
    const camera = createCapacitorCameraCapability(bindings);
    const photos = createCapacitorPhotosCapability(bindings);

    await expect(camera.takePhoto()).rejects.toMatchObject({
      code: "permission-required",
    });
    expect(takePhoto).not.toHaveBeenCalled();
    expect(await camera.requestPermission()).toMatchObject({
      state: "granted",
    });
    expect(requestPermissions).toHaveBeenCalledWith({
      permissions: ["camera"],
    });
    expect(await camera.takePhoto({ direction: "front" })).toMatchObject({
      uri: "file:///capture.jpg",
      webPath: "capacitor://capture.jpg",
    });
    expect(takePhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraDirection: "FRONT",
        includeMetadata: false,
        saveToGallery: false,
      }),
    );
    expect(await photos.pick({ limit: 1 })).toHaveLength(1);
    expect(chooseFromGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        allowMultipleSelection: false,
        includeMetadata: false,
        limit: 1,
      }),
    );
  });

  test("normalizes clipboard text and fails closed without its plugin", async () => {
    let value = "initial";
    const clipboard = createCapacitorClipboardCapability({
      capacitor: runtime(["Clipboard"]),
      clipboard: {
        read: async () => ({ type: "text/plain", value }),
        write: async (options) => {
          value = options.string ?? "";
        },
      },
    });
    await clipboard.writeText("updated");
    expect(await clipboard.readText()).toBe("updated");
    expect(await clipboard.capability("read")).toMatchObject({
      available: true,
      fidelity: "native",
    });
    const missing = createCapacitorClipboardCapability({
      capacitor: runtime([]),
      clipboard: {
        read: async () => ({ type: "text/plain", value: "never" }),
        write: async () => undefined,
      },
    });
    await expect(missing.readText()).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  test("validates share content and preserves only public provider results", async () => {
    const providerShare = mock(async () => ({ activityType: "messages" }));
    const share = createCapacitorShareCapability({
      capacitor: runtime(["Share"]),
      share: {
        canShare: async () => ({ value: true }),
        share: providerShare,
      },
    });
    expect(
      await share.share({ text: "Hello", url: "https://absolutejs.com" }),
    ).toMatchObject({ activity: "messages" });
    expect(providerShare).toHaveBeenCalledWith({
      text: "Hello",
      url: "https://absolutejs.com/",
    });
    await expect(
      share.share({ url: "file:///private/secret" }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  test("maps haptic vocabulary and safely no-ops without hardware support", async () => {
    const impact = mock(async () => undefined);
    const notification = mock(async () => undefined);
    const haptics = createCapacitorHapticsCapability({
      capacitor: runtime(["Haptics"]),
      haptics: {
        impact,
        notification,
        selectionChanged: async () => undefined,
        selectionEnd: async () => undefined,
        selectionStart: async () => undefined,
        vibrate: async () => undefined,
      },
    });
    await haptics.impact("light");
    await haptics.notification("warning");
    expect(impact).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(notification).toHaveBeenCalledWith({ type: "WARNING" });

    const unavailable = createCapacitorHapticsCapability({
      capacitor: runtime([]),
      haptics: {
        impact,
        notification,
        selectionChanged: async () => undefined,
        selectionEnd: async () => undefined,
        selectionStart: async () => undefined,
        vibrate: async () => undefined,
      },
    });
    await unavailable.impact();
    expect(await unavailable.capability()).toMatchObject({ available: false });
  });
});
