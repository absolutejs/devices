import { afterEach, describe, expect, test } from "bun:test";
import { lifecycle, network, platform, storage } from "../src";
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
});
