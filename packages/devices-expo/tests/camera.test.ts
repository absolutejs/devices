import { beforeEach, describe, expect, mock, test } from "bun:test";

const persisted = new Map<string, string>();

beforeEach(() => persisted.clear());

mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => persisted.get(key) ?? null,
    removeItem: async (key: string) => {
      persisted.delete(key);
    },
    setItem: async (key: string, value: string) => {
      persisted.set(key, value);
    },
  },
}));

mock.module("expo-image-picker", () => ({
  CameraType: { back: "back", front: "front" },
}));
mock.module("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  manipulateAsync: async () => {
    throw new Error("unexpected transform");
  },
}));

const { createExpoCameraCapability, createExpoPhotosCapability } = await import(
  "../src/camera"
);
const { createExpoRestoredOperationLifecycle, takeExpoRestoredOperation } =
  await import("../src/restoration");

const bindings = (pending: unknown) => ({
  getCameraPermissionsAsync: async () => ({
    canAskAgain: true,
    granted: false,
    status: "undetermined" as const,
  }),
  getMediaLibraryPermissionsAsync: async () => ({
    accessPrivileges: "none" as const,
    canAskAgain: true,
    granted: false,
    status: "undetermined" as const,
  }),
  getPendingResultAsync: mock(async () => pending),
  launchCameraAsync: async () => ({ assets: null, canceled: true as const }),
  launchImageLibraryAsync: async () => ({ assets: null, canceled: true as const }),
  manipulateAsync: async () => {
    throw new Error("unexpected transform");
  },
  requestCameraPermissionsAsync: async () => ({
    canAskAgain: false,
    granted: true,
    status: "granted" as const,
  }),
});

describe("Expo photo restoration", () => {
  test("normalizes a pending Android picker result and consumes it once", async () => {
    const provider = bindings({
      assets: [
        {
          fileName: "picked.jpg",
          fileSize: 12,
          height: 3,
          mimeType: "image/jpeg",
          uri: "file:///cache/picked.jpg",
          width: 4,
        },
      ],
      canceled: false,
    });
    const photos = createExpoPhotosCapability(provider as never);

    const first = await takeExpoRestoredOperation(photos);
    const second = await takeExpoRestoredOperation(photos);
    expect(first).toEqual({
      data: [
        {
          format: "image/jpeg",
          height: 3,
          name: "picked.jpg",
          sizeBytes: 12,
          uri: "file:///cache/picked.jpg",
          webPath: "file:///cache/picked.jpg",
          width: 4,
        },
      ],
      method: "pick",
      plugin: "expo-image-picker",
      success: true,
    });
    expect(second).toBe(first);
    expect(provider.getPendingResultAsync).toHaveBeenCalledTimes(1);
  });

  test("turns a pending native picker error into a public failed operation", async () => {
    const photos = createExpoPhotosCapability(
      bindings({ code: "E_PICKER", message: "Picker failed" }) as never,
    );
    expect(await takeExpoRestoredOperation(photos)).toEqual({
      error: { code: "E_PICKER", message: "Picker failed" },
      method: "pick",
      plugin: "expo-image-picker",
      success: false,
    });
  });

  test("restores camera-only operations with their requested transform", async () => {
    const provider = bindings({
      assets: [{ height: 8, uri: "file:///cache/camera.jpg", width: 12 }],
      canceled: false,
    });
    provider.launchCameraAsync = async () => new Promise(() => undefined);
    provider.manipulateAsync = mock(async () => ({
      height: 20,
      uri: "file:///cache/transformed.jpg",
      width: 30,
    })) as never;
    const camera = createExpoCameraCapability(provider as never);
    void camera.takePhoto({
      transform: { height: 20, quality: 80, width: 30 },
    });
    await Bun.sleep(0);

    expect(await takeExpoRestoredOperation(camera)).toEqual({
      data: {
        height: 20,
        uri: "file:///cache/transformed.jpg",
        webPath: "file:///cache/transformed.jpg",
        width: 30,
      },
      method: "takePhoto",
      plugin: "expo-image-picker",
      success: true,
    });
    expect(provider.manipulateAsync).toHaveBeenCalledTimes(1);
  });

  test("restores the operation shape after the JavaScript process is replaced", async () => {
    const interruptedProvider = bindings(null);
    interruptedProvider.launchCameraAsync = async () => new Promise(() => undefined);
    void createExpoCameraCapability(interruptedProvider as never).takePhoto();
    await Bun.sleep(0);

    const restoredProvider = bindings({
      assets: [{ height: 3, uri: "file:///cache/restored-camera.jpg", width: 4 }],
      canceled: false,
    });
    const restored = await takeExpoRestoredOperation(
      createExpoCameraCapability(restoredProvider as never),
    );

    expect(restored).toMatchObject({
      method: "takePhoto",
      plugin: "expo-image-picker",
      success: true,
    });
    expect(persisted.size).toBe(0);
  });

  test("replays one restored operation to late listeners and honors cleanup", async () => {
    const photos = createExpoPhotosCapability(
      bindings({
        assets: [{ height: 1, uri: "file:///cache/restored.jpg", width: 1 }],
        canceled: false,
      }) as never,
    );
    const lifecycle = createExpoRestoredOperationLifecycle(photos, true);
    const early: unknown[] = [];
    const stopEarly = await lifecycle.onRestoredOperation((value) =>
      early.push(value),
    );
    await Bun.sleep(0);
    expect(early).toHaveLength(1);
    await stopEarly();

    const late: unknown[] = [];
    const stopLate = await lifecycle.onRestoredOperation((value) => late.push(value));
    await Bun.sleep(0);
    expect(late).toHaveLength(1);
    await stopLate();

    let resolvePending: ((value: unknown) => void) | undefined;
    const pending = new Promise((resolve) => {
      resolvePending = resolve;
    });
    const delayedBindings = bindings(null);
    delayedBindings.getPendingResultAsync = mock(async () => pending) as never;
    const delayedLifecycle = createExpoRestoredOperationLifecycle(
      createExpoPhotosCapability(delayedBindings as never),
      true,
    );
    const removed: unknown[] = [];
    const stopRemoved = await delayedLifecycle.onRestoredOperation((value) =>
      removed.push(value),
    );
    await stopRemoved();
    resolvePending?.({ assets: [], canceled: true });
    await Bun.sleep(0);
    expect(removed).toHaveLength(0);
  });

  test("retries within a bounded window when Android publishes after recreation", async () => {
    let pending: unknown = null;
    const provider = bindings(null);
    provider.getPendingResultAsync = mock(async () => pending) as never;
    const lifecycle = createExpoRestoredOperationLifecycle(
      createExpoPhotosCapability(provider as never),
      true,
    );
    const restored: unknown[] = [];
    const stop = await lifecycle.onRestoredOperation((value) =>
      restored.push(value),
    );
    await Bun.sleep(20);
    expect(restored).toHaveLength(0);

    pending = {
      assets: [{ height: 3, uri: "file:///cache/late.jpg", width: 4 }],
      canceled: false,
    };
    const deadline = Date.now() + 1_000;
    while (restored.length === 0 && Date.now() < deadline) await Bun.sleep(25);

    expect(restored).toEqual([
      {
        data: [
          {
            height: 3,
            uri: "file:///cache/late.jpg",
            webPath: "file:///cache/late.jpg",
            width: 4,
          },
        ],
        method: "pick",
        plugin: "expo-image-picker",
        success: true,
      },
    ]);
    expect(provider.getPendingResultAsync.mock.calls.length).toBeGreaterThan(1);
    await stop();
  });

  test("turns an abandoned process-death operation into one bounded cancellation", async () => {
    const interruptedProvider = bindings(null);
    interruptedProvider.launchCameraAsync = async () => new Promise(() => undefined);
    void createExpoCameraCapability(interruptedProvider as never).takePhoto();
    await Bun.sleep(0);

    const restoredProvider = bindings(null);
    const lifecycle = createExpoRestoredOperationLifecycle(
      createExpoCameraCapability(restoredProvider as never),
      true,
      {
        pollAttempts: 2,
        pollIntervalMs: 1,
        takeCancellation: async () => true,
      },
    );
    const restored: unknown[] = [];
    const stop = await lifecycle.onRestoredOperation((value) =>
      restored.push(value),
    );
    const deadline = Date.now() + 1_000;
    while (restored.length === 0 && Date.now() < deadline) await Bun.sleep(25);

    expect(restored).toEqual([
      {
        error: {
          code: "cancelled",
          message: "Photo selection was cancelled after the native picker closed.",
        },
        method: "takePhoto",
        plugin: "expo-image-picker",
        success: false,
      },
    ]);
    expect(persisted.size).toBe(0);
    await lifecycle.check();
    expect(restored).toHaveLength(1);
    await stop();
  });

  test("does not abandon a long-running picker owned by the current process", async () => {
    let finish: ((value: { assets: null; canceled: true }) => void) | undefined;
    const provider = bindings(null);
    provider.launchCameraAsync = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const camera = createExpoCameraCapability(provider as never);
    const direct = camera.takePhoto().catch((error) => error);
    await Bun.sleep(0);

    const lifecycle = createExpoRestoredOperationLifecycle(camera, true, {
      pollAttempts: 2,
      pollIntervalMs: 1,
    });
    const restored: unknown[] = [];
    const stop = await lifecycle.onRestoredOperation((value) =>
      restored.push(value),
    );
    await Bun.sleep(25);

    expect(restored).toHaveLength(0);
    expect(persisted.size).toBe(1);
    finish?.({ assets: null, canceled: true });
    expect(await direct).toMatchObject({ code: "cancelled" });
    expect(persisted.size).toBe(0);
    await stop();
  });

  test("restores a bounded multi-photo transform from the persisted descriptor", async () => {
    const interruptedProvider = bindings(null);
    interruptedProvider.launchImageLibraryAsync = async () =>
      new Promise(() => undefined);
    void createExpoPhotosCapability(interruptedProvider as never).pick({
      limit: 2,
      transform: { height: 20, quality: 80, width: 30 },
    });
    await Bun.sleep(0);

    const restoredProvider = bindings({
      assets: [
        { height: 1, uri: "file:///cache/a.jpg", width: 1 },
        { height: 1, uri: "file:///cache/b.jpg", width: 1 },
        { height: 1, uri: "file:///cache/c.jpg", width: 1 },
      ],
      canceled: false,
    });
    restoredProvider.manipulateAsync = mock(async (uri: string) => ({
      height: 20,
      uri: uri.replace(".jpg", "-transformed.jpg"),
      width: 30,
    })) as never;
    const restored = await takeExpoRestoredOperation(
      createExpoPhotosCapability(restoredProvider as never),
    );

    expect(restored).toMatchObject({
      data: [
        { height: 20, uri: "file:///cache/a-transformed.jpg", width: 30 },
        { height: 20, uri: "file:///cache/b-transformed.jpg", width: 30 },
      ],
      method: "pick",
      success: true,
    });
    expect(restoredProvider.manipulateAsync).toHaveBeenCalledTimes(2);
    expect(persisted.size).toBe(0);
  });
});
