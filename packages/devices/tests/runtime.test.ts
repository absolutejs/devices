import { afterEach, describe, expect, test } from "bun:test";
import {
  back,
  lifecycle,
  links,
  network,
  platform,
  secureStorage,
  storage,
} from "../src";
import { installDeviceAdapter } from "../src/runtime";
import { createTestDeviceAdapter } from "../src/testing";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("@absolutejs/devices runtime", () => {
  test("delegates capabilities to an installed adapter", async () => {
    const testDevice = createTestDeviceAdapter({
      platform: { os: "android", isNative: true },
    });
    cleanup = installDeviceAdapter(testDevice.adapter);

    expect(await platform.getInfo()).toMatchObject({
      os: "android",
      isNative: true,
      runtime: "test",
    });
    await storage.set("theme", "dark");
    expect(await storage.get("theme")).toBe("dark");
    await secureStorage.set("credential", "test-only-secret");
    expect(await secureStorage.get("credential")).toBe("test-only-secret");
    expect(testDevice.storage.has("credential")).toBe(false);
  });

  test("normalizes lifecycle and network subscriptions", async () => {
    const testDevice = createTestDeviceAdapter();
    cleanup = installDeviceAdapter(testDevice.adapter);
    const lifecycleStates: string[] = [];
    const networkStates: boolean[] = [];
    const removeLifecycle = await lifecycle.onChange((state) =>
      lifecycleStates.push(state),
    );
    const removeNetwork = await network.onChange((status) =>
      networkStates.push(status.connected),
    );

    testDevice.emitLifecycle("background");
    testDevice.emitNetwork({ connected: false, connectionType: "none" });
    expect(lifecycleStates).toEqual(["background"]);
    expect(networkStates).toEqual([false]);

    await removeLifecycle();
    await removeNetwork();
    testDevice.emitLifecycle("active");
    expect(lifecycleStates).toEqual(["background"]);
  });

  test("exposes resume, restored-operation, back, and external-link behavior", async () => {
    const testDevice = createTestDeviceAdapter();
    cleanup = installDeviceAdapter(testDevice.adapter);
    const events: string[] = [];
    const removeResume = await lifecycle.onResume(() => events.push("resume"));
    const removeRestored = await lifecycle.onRestoredOperation((operation) =>
      events.push(`${operation.plugin}:${operation.method}`),
    );
    const removeBack = await back.onPress((event) =>
      events.push(`back:${event.canGoBack}`),
    );

    testDevice.emitLifecycle("active");
    testDevice.emitRestoredOperation({
      method: "capture",
      plugin: "Camera",
      success: true,
    });
    testDevice.emitBack({ canGoBack: true });
    await links.openExternal("https://example.com/path");

    expect(events).toEqual(["resume", "Camera:capture", "back:true"]);
    expect(testDevice.openedExternalUrls).toEqual(["https://example.com/path"]);
    expect(await back.capability()).toMatchObject({
      available: true,
      fidelity: "emulated",
    });

    await removeResume();
    await removeRestored();
    await removeBack();
  });

  test("restores a previous adapter when a nested installation is removed", async () => {
    const first = createTestDeviceAdapter({ platform: { os: "ios" } });
    const second = createTestDeviceAdapter({ platform: { os: "android" } });
    cleanup = installDeviceAdapter(first.adapter);
    const removeSecond = installDeviceAdapter(second.adapter);
    expect((await platform.info()).os).toBe("android");

    removeSecond();
    expect((await platform.info()).os).toBe("ios");
  });

  test("does not resurrect an adapter removed beneath another installation", async () => {
    const first = createTestDeviceAdapter({ platform: { os: "ios" } });
    const second = createTestDeviceAdapter({ platform: { os: "android" } });
    const removeFirst = installDeviceAdapter(first.adapter);
    const removeSecond = installDeviceAdapter(second.adapter);
    removeFirst();
    expect((await platform.info()).os).toBe("android");

    removeSecond();
    expect((await platform.info()).runtime).not.toBe("test");
  });
});
