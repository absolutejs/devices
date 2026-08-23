import { describe, expect, test } from "bun:test";
import {
  DeviceError,
  availableCapability,
  platform,
  storage,
} from "@absolutejs/devices";
import { assertDeviceAdapterConformance } from "@absolutejs/devices/testing";
import {
  createCapacitorDeviceAdapter,
  installCapacitorDeviceAdapter,
  installCapacitorDeviceAdapterIfNative,
  type CapacitorDeviceBindings,
} from "../src";

type Listener = (...args: unknown[]) => void;

const createBindings = (
  options: {
    native?: boolean;
    platform?: "android" | "ios" | "web";
    pluginFailure?: Error;
  } = {},
) => {
  const listeners = new Map<string, Set<Listener>>();
  const values = new Map<string, string>([["another.package.key", "keep"]]);
  const openedUrls: string[] = [];
  let active = true;
  let network = {
    connected: true,
    connectionType: "wifi" as const,
  };
  const addListener = async (eventName: string, listener: Listener) => {
    const eventListeners = listeners.get(eventName) ?? new Set<Listener>();
    eventListeners.add(listener);
    listeners.set(eventName, eventListeners);
    let listening = true;
    return {
      remove: async () => {
        if (!listening) return;
        listening = false;
        eventListeners.delete(listener);
      },
    };
  };
  const emit = (eventName: string, event?: unknown) => {
    for (const listener of listeners.get(eventName) ?? []) listener(event);
  };
  const selectedPlatform = options.platform ?? "android";
  const bindings = {
    app: {
      addListener,
      exitApp: async () => undefined,
      getAppLanguage: async () => ({ value: "en" }),
      getInfo: async () => {
        if (options.pluginFailure) throw options.pluginFailure;
        return {
          build: "42",
          id: "com.example.absolute",
          name: "Absolute Test",
          version: "1.2.3",
        };
      },
      getLaunchUrl: async () => ({ url: "absolute-test://launch/start" }),
      getState: async () => ({ isActive: active }),
      minimizeApp: async () => undefined,
      removeAllListeners: async () => listeners.clear(),
      toggleBackButtonHandler: async () => undefined,
    },
    browser: {
      addListener,
      close: async () => undefined,
      open: async ({ url }: { url: string }) => {
        openedUrls.push(url);
      },
      removeAllListeners: async () => undefined,
    },
    capacitor: {
      getPlatform: () => selectedPlatform,
      isNativePlatform: () => options.native ?? true,
      isPluginAvailable: (name: string) =>
        ["App", "Browser", "Network", "Preferences"].includes(name),
    },
    network: {
      addListener,
      getStatus: async () => network,
      removeAllListeners: async () => undefined,
    },
    preferences: {
      clear: async () => values.clear(),
      configure: async () => undefined,
      get: async ({ key }: { key: string }) => ({
        value: values.get(key) ?? null,
      }),
      keys: async () => ({ keys: [...values.keys()] }),
      migrate: async () => ({ existing: [], migrated: [] }),
      remove: async ({ key }: { key: string }) => {
        values.delete(key);
      },
      removeOld: async () => undefined,
      set: async ({ key, value }: { key: string; value: string }) => {
        values.set(key, value);
      },
    },
  } as unknown as CapacitorDeviceBindings;

  return {
    bindings,
    emitBack: (canGoBack: boolean) => emit("backButton", { canGoBack }),
    emitLifecycle: (state: "active" | "background") => {
      active = state === "active";
      emit("appStateChange", { isActive: active });
      if (active) emit("resume");
    },
    emitLink: (url: string) => emit("appUrlOpen", { url }),
    emitNetwork: (status: {
      connected: boolean;
      connectionType: "none" | "wifi";
    }) => {
      network = status;
      emit("networkStatusChange", status);
    },
    emitRestored: (
      operation: {
        data?: unknown;
        method?: string;
        plugin?: string;
        success?: boolean;
      } = {},
    ) =>
      emit("appRestoredResult", {
        data: operation.data ?? { path: "photo.jpg" },
        methodName: operation.method ?? "getPhoto",
        pluginId: operation.plugin ?? "Camera",
        success: operation.success ?? true,
      }),
    openedUrls,
    values,
  };
};

describe("Capacitor device adapter", () => {
  test("passes shared conformance with native Capacitor events", async () => {
    const controller = createBindings();
    const adapter = createCapacitorDeviceAdapter({
      bindings: controller.bindings,
    });

    await assertDeviceAdapterConformance({
      adapter,
      emitBack: ({ canGoBack }) => controller.emitBack(canGoBack),
      emitLifecycle: controller.emitLifecycle,
      emitLink: controller.emitLink,
      emitNetwork: controller.emitNetwork,
      emitRestoredOperation: (operation) => controller.emitRestored(operation),
      storage: true,
    });
  });

  test("normalizes native metadata, restored operations, and launch links", async () => {
    const controller = createBindings();
    const adapter = createCapacitorDeviceAdapter({
      bindings: controller.bindings,
    });
    const restored: unknown[] = [];
    const remove = await adapter.lifecycle.onRestoredOperation?.((operation) =>
      restored.push(operation),
    );

    expect(await adapter.platform.getInfo()).toMatchObject({
      appBuild: "42",
      appVersion: "1.2.3",
      isNative: true,
      language: "en",
      os: "android",
      runtime: "capacitor",
    });
    expect(await adapter.links.getLaunchUrl()).toBe(
      "absolute-test://launch/start",
    );
    controller.emitRestored();
    expect(restored).toEqual([
      expect.objectContaining({
        data: { path: "photo.jpg" },
        method: "getPhoto",
        plugin: "Camera",
        success: true,
      }),
    ]);
    await remove?.();
  });

  test("isolates preferences and never treats them as secure storage", async () => {
    const controller = createBindings();
    const adapter = createCapacitorDeviceAdapter({
      bindings: controller.bindings,
      storagePrefix: "absolute.test.",
    });

    expect(adapter.secureStorage).toBeUndefined();
    await adapter.storage.set("session", "ordinary");
    expect(controller.values.get("absolute.test.session")).toBe("ordinary");
    expect(await adapter.storage.keys()).toEqual(["session"]);
    await adapter.storage.clear();
    expect(await adapter.storage.get("session")).toBeNull();
    expect(controller.values.get("another.package.key")).toBe("keep");
  });

  test("audits external URLs before opening the native browser", async () => {
    const controller = createBindings();
    const adapter = createCapacitorDeviceAdapter({
      bindings: controller.bindings,
    });

    await adapter.links.openExternal("https://example.com/path?q=1");
    expect(controller.openedUrls).toEqual(["https://example.com/path?q=1"]);
    await expect(
      adapter.links.openExternal("custom-scheme://unsafe"),
    ).rejects.toMatchObject({ code: "failed" });
    await expect(
      adapter.links.openExternal("https://user:secret@example.com"),
    ).rejects.toMatchObject({ code: "failed" });
    expect(controller.openedUrls).toHaveLength(1);
  });

  test("exposes Android-only back capability without registering on iOS", async () => {
    const android = createCapacitorDeviceAdapter({
      bindings: createBindings({ platform: "android" }).bindings,
    });
    const iosController = createBindings({ platform: "ios" });
    const ios = createCapacitorDeviceAdapter({
      bindings: iosController.bindings,
    });
    let presses = 0;
    const remove = await ios.back?.onPress(() => {
      presses += 1;
    });

    expect(await android.back?.capability()).toEqual(
      availableCapability("native", { platform: "android" }),
    );
    expect(await ios.back?.capability()).toMatchObject({
      available: false,
      reason: "unsupported",
    });
    iosController.emitBack(true);
    expect(presses).toBe(0);
    await remove?.();
  });

  test("normalizes provider failures and installs into the shared facade", async () => {
    const failure = new Error("native bridge unavailable");
    const failed = createCapacitorDeviceAdapter({
      bindings: createBindings({ pluginFailure: failure }).bindings,
    });
    const controller = createBindings();
    const uninstall = installCapacitorDeviceAdapter({
      bindings: controller.bindings,
    });

    try {
      await expect(failed.platform.getInfo()).rejects.toEqual(
        new DeviceError(
          "failed",
          "Failed to read native application information.",
          {
            cause: failure,
          },
        ),
      );
      expect(await platform.info()).toMatchObject({
        appBuild: "42",
        runtime: "capacitor",
      });
      await storage.set("facade", "works");
      expect(await storage.get("facade")).toBe("works");
    } finally {
      uninstall();
    }
  });

  test("automatic bootstrap leaves browser previews on the web adapter", () => {
    const controller = createBindings({ native: false, platform: "web" });

    expect(
      installCapacitorDeviceAdapterIfNative({ bindings: controller.bindings }),
    ).toBeNull();
  });
});
