import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  back,
  camera,
  clipboard,
  haptics,
  lifecycle,
  links,
  location,
  network,
  platform,
  photos,
  secureStorage,
  share,
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

  test("delegates clipboard, share, and haptics without platform branches", async () => {
    const testDevice = createTestDeviceAdapter();
    cleanup = installDeviceAdapter(testDevice.adapter);

    await clipboard.writeText("portable");
    expect(await clipboard.readText()).toBe("portable");
    expect(await clipboard.capability("read")).toMatchObject({
      available: true,
      fidelity: "emulated",
    });
    expect(
      await share.share({ text: "AbsoluteJS", url: "https://absolutejs.com" }),
    ).toEqual({ activity: "test" });
    await haptics.impact("light");
    await haptics.notification("warning");
    await haptics.selectionChanged();
    expect(testDevice.sharedContent).toEqual([
      { text: "AbsoluteJS", url: "https://absolutejs.com" },
    ]);
    expect(testDevice.hapticEvents).toEqual([
      "impact:light",
      "notification:warning",
      "selection",
    ]);
  });

  test("requires an explicit camera grant and uses the scoped photo picker", async () => {
    const testDevice = createTestDeviceAdapter();
    cleanup = installDeviceAdapter(testDevice.adapter);

    await expect(camera.takePhoto()).rejects.toMatchObject({
      code: "permission-required",
    });
    expect(testDevice.cameraPermission.requests).toBe(0);
    expect(await camera.requestPermission()).toMatchObject({
      state: "granted",
    });
    expect(testDevice.cameraPermission.requests).toBe(1);
    expect(await camera.takePhoto()).toEqual(testDevice.pickedPhotos[0]!);
    expect(await photos.pick({ limit: 1 })).toEqual(testDevice.pickedPhotos);
  });

  test("requires explicit location permission and cleans up watches", async () => {
    const testDevice = createTestDeviceAdapter();
    cleanup = installDeviceAdapter(testDevice.adapter);

    await expect(location.current()).rejects.toMatchObject({
      code: "permission-required",
    });
    expect(testDevice.locationPermission.requests).toBe(0);
    expect(
      await location.requestPermission({ precision: "precise" }),
    ).toMatchObject({ precision: "precise", state: "granted" });
    expect(testDevice.locationPermission.requests).toBe(1);
    expect(await location.current()).toEqual(testDevice.locations.at(-1)!);

    const events: number[] = [];
    const remove = await location.watch((event) => {
      if (event.type === "position") events.push(event.position.latitude);
    });
    testDevice.emitLocation({
      accuracyMeters: 3,
      latitude: 51.5072,
      longitude: -0.1276,
      timestampMs: 1_777_000_000_001,
    });
    expect(events).toEqual([51.5072]);
    await remove();
    testDevice.emitLocation();
    expect(events).toEqual([51.5072]);
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

  test("shares installations across independently bundled runtime copies", async () => {
    const runtimePath = new URL("../src/runtime.ts", import.meta.url).pathname;
    const root = await mkdtemp(join(tmpdir(), "absolute-device-runtime-"));
    try {
      const modules = await Promise.all(
        ["first", "second"].map(async (name) => {
          const entry = join(root, `${name}.ts`);
          await Bun.write(
            entry,
            `export * from ${JSON.stringify(runtimePath)};`,
          );
          const result = await Bun.build({
            entrypoints: [entry],
            outdir: join(root, name),
            target: "bun",
          });
          expect(result.success).toBe(true);
          const output = result.outputs[0]?.path;
          if (!output) throw new Error(`Missing ${name} runtime test bundle.`);
          return import(output) as Promise<typeof import("../src/runtime")>;
        }),
      );
      const [first, second] = modules;
      if (!first || !second) throw new Error("Missing runtime test module.");
      const testDevice = createTestDeviceAdapter({ platform: { os: "ios" } });
      cleanup = first.installDeviceAdapter(testDevice.adapter);

      expect(first).not.toBe(second);
      expect(second.getDeviceAdapter()).toBe(testDevice.adapter);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
