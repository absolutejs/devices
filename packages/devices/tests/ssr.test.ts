import { describe, expect, test } from "bun:test";
import { DeviceError } from "../src/contracts";
import { createSsrDeviceAdapter } from "../src/adapters/ssr";
import {
  back,
  camera,
  clipboard,
  haptics,
  lifecycle,
  platform,
  photos,
  secureStorage,
  share,
} from "../src";
import { installDeviceAdapter } from "../src/runtime";

describe("SSR adapter", () => {
  test("is import-safe and reports unavailable effects", async () => {
    const adapter = createSsrDeviceAdapter();
    expect(await adapter.platform.getInfo()).toMatchObject({
      runtime: "ssr",
      isNative: false,
    });
    expect(await adapter.storage.get("missing")).toBeNull();
    try {
      await adapter.links.openExternal("https://example.com");
      throw new Error("Expected openExternal to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(DeviceError);
      expect((error as DeviceError).code).toBe("unavailable");
    }
  });

  test("public capability queries and optional events are SSR-safe", async () => {
    const remove = installDeviceAdapter(createSsrDeviceAdapter());
    try {
      expect(await platform.capability()).toMatchObject({
        available: false,
        reason: "unavailable",
      });
      expect(await back.capability()).toMatchObject({
        available: false,
        reason: "unsupported",
      });
      expect(await secureStorage.capability()).toMatchObject({
        available: false,
        reason: "unsupported",
      });
      expect(await clipboard.capability()).toMatchObject({
        available: false,
        reason: "unavailable",
      });
      expect(await share.capability()).toMatchObject({
        available: false,
        reason: "unavailable",
      });
      expect(await camera.capability()).toMatchObject({
        available: false,
        reason: "unavailable",
      });
      expect(await photos.capability()).toMatchObject({
        available: false,
        reason: "unavailable",
      });
      await expect(camera.takePhoto()).rejects.toMatchObject({
        code: "unavailable",
      });
      await expect(photos.pick()).rejects.toMatchObject({
        code: "unavailable",
      });
      await haptics.impact();
      await expect(clipboard.readText()).rejects.toMatchObject({
        code: "unavailable",
      });
      await expect(secureStorage.get("credential")).rejects.toMatchObject({
        code: "unsupported",
      });
      const removeBack = await back.onPress(() => {
        throw new Error("SSR back listener must not run.");
      });
      const removeRestored = await lifecycle.onRestoredOperation(() => {
        throw new Error("SSR restored-operation listener must not run.");
      });
      await removeBack();
      await removeRestored();
    } finally {
      remove();
    }
  });
});
