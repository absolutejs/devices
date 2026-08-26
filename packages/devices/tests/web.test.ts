import { afterEach, describe, expect, test } from "bun:test";
import { DeviceError } from "../src/contracts";
import { createWebDeviceAdapter } from "../src/web";
import { inspectDeviceAdapterConformance } from "../src/testing";

const originalDescriptors = new Map<
  PropertyKey,
  PropertyDescriptor | undefined
>();

const replaceGlobal = (key: PropertyKey, value: unknown) => {
  if (!originalDescriptors.has(key))
    originalDescriptors.set(
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    );
  Object.defineProperty(globalThis, key, { configurable: true, value });
};

afterEach(() => {
  for (const [key, descriptor] of originalDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  originalDescriptors.clear();
});

const installWebEnvironment = () => {
  const globalEvents = new EventTarget();
  const documentEvents = new EventTarget();
  const values = new Map<string, string>();
  const opened: string[] = [];
  const downloads: Array<{ name: string; url: string }> = [];
  const shared: ShareData[] = [];
  const vibrations: number[] = [];
  const notifications: Array<{
    body?: string;
    data?: unknown;
    onclick: (() => void) | null;
    tag?: string;
    title: string;
  }> = [];
  let notificationPermission: NotificationPermission = "default";
  let notificationPermissionRequests = 0;
  let clipboardText = "";
  let href = "https://app.example.test/start?source=launch#top";
  let online = true;
  let locationPermission: PermissionState = "prompt";
  let visibilityState: DocumentVisibilityState = "visible";
  const captures: string[] = [];
  const locationOptions: PositionOptions[] = [];
  const locationWatchers = new Map<number, PositionCallback>();
  let nextLocationWatch = 1;
  const currentPosition = {
    coords: {
      accuracy: 4,
      altitude: 8,
      altitudeAccuracy: 2,
      heading: 90,
      latitude: 40.7128,
      longitude: -74.006,
      speed: 1.5,
    },
    timestamp: 1_777_000_000_000,
  } as GeolocationPosition;
  const NativeUrl = URL;
  const localStorage = {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage;
  const document = {
    body: { append: () => undefined },
    createElement: (tag: string) => {
      if (tag === "a") {
        const anchor = {
          download: "",
          href: "",
          rel: "",
          click() {
            downloads.push({ name: anchor.download, url: anchor.href });
          },
        };
        return anchor;
      }
      if (tag !== "input")
        return { remove: () => undefined, style: { cssText: "" } };
      const events = new EventTarget();
      return Object.assign(events, {
        accept: "",
        click() {
          events.dispatchEvent(new Event("change"));
        },
        files: [new File(["photo"], "photo.jpg", { type: "image/jpeg" })],
        multiple: false,
        remove: () => undefined,
        setAttribute: (name: string, value: string) => {
          if (name === "capture") captures.push(value);
        },
        style: { display: "" },
        type: "",
      });
    },
    get visibilityState() {
      return visibilityState;
    },
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener:
      documentEvents.removeEventListener.bind(documentEvents),
  };
  const location = {
    get href() {
      return href;
    },
  };
  const navigator = {
    canShare: () => true,
    clipboard: {
      readText: async () => clipboardText,
      writeText: async (value: string) => {
        clipboardText = value;
      },
    },
    connection: { type: "wifi" },
    geolocation: {
      clearWatch: (id: number) => {
        locationWatchers.delete(id);
      },
      getCurrentPosition: (
        success: PositionCallback,
        _error?: PositionErrorCallback | null,
        options?: PositionOptions,
      ) => {
        locationPermission = "granted";
        if (options) locationOptions.push(options);
        success(currentPosition);
      },
      watchPosition: (
        success: PositionCallback,
        _error?: PositionErrorCallback | null,
        options?: PositionOptions,
      ) => {
        const id = nextLocationWatch++;
        if (options) locationOptions.push(options);
        locationWatchers.set(id, success);
        return id;
      },
    },
    language: "en-US",
    permissions: {
      query: async () => ({ state: locationPermission }),
    },
    get onLine() {
      return online;
    },
    userAgent: "AbsoluteJS Android Test",
    share: async (content: ShareData) => {
      shared.push(content);
    },
    vibrate: (duration: number) => {
      vibrations.push(duration);
      return true;
    },
  };
  replaceGlobal(
    "addEventListener",
    globalEvents.addEventListener.bind(globalEvents),
  );
  replaceGlobal("document", document);
  replaceGlobal("getComputedStyle", () => ({
    paddingBottom: "4px",
    paddingLeft: "3px",
    paddingRight: "2px",
    paddingTop: "1px",
  }));
  replaceGlobal("innerWidth", 820);
  replaceGlobal("location", location);
  replaceGlobal("matchMedia", (query: string) => ({
    matches:
      query === "(pointer: coarse)" ||
      query === "(prefers-reduced-motion: reduce)",
  }));
  replaceGlobal("navigator", navigator);
  replaceGlobal(
    "Notification",
    class {
      static get permission() {
        return notificationPermission;
      }
      static async requestPermission() {
        notificationPermissionRequests += 1;
        notificationPermission = "granted";
        return notificationPermission;
      }
      body?: string;
      data?: unknown;
      onclick: (() => void) | null = null;
      tag?: string;
      title: string;
      constructor(
        title: string,
        options: { body?: string; data?: unknown; tag?: string } = {},
      ) {
        this.title = title;
        Object.assign(this, options);
        notifications.push(this);
      }
    },
  );
  replaceGlobal(
    "URL",
    class extends NativeUrl {
      static createObjectURL() {
        return "blob:absolute-photo";
      }
      static revokeObjectURL() {}
    },
  );
  replaceGlobal(
    "removeEventListener",
    globalEvents.removeEventListener.bind(globalEvents),
  );
  replaceGlobal("window", {
    focus: () => undefined,
    localStorage,
    open: (url: string) => {
      opened.push(url);
      return null;
    },
  });

  return {
    emitLifecycle: (state: "active" | "background" | "inactive") => {
      visibilityState = state === "active" ? "visible" : "hidden";
      documentEvents.dispatchEvent(new Event("visibilitychange"));
    },
    emitLink: (url: string) => {
      href = url;
      globalEvents.dispatchEvent(new Event("popstate"));
    },
    emitLocation: (position: GeolocationPosition = currentPosition) => {
      for (const listener of locationWatchers.values()) listener(position);
    },
    emitNetwork: (status: { connected: boolean }) => {
      online = status.connected;
      globalEvents.dispatchEvent(
        new Event(status.connected ? "online" : "offline"),
      );
    },
    opened,
    downloads,
    captures,
    locationOptions,
    notifications,
    get notificationPermissionRequests() {
      return notificationPermissionRequests;
    },
    shared,
    vibrations,
  };
};

describe("web device adapter", () => {
  test("uses standards APIs and passes shared conformance", async () => {
    const environment = installWebEnvironment();
    const adapter = createWebDeviceAdapter();
    expect(await adapter.platform.getInfo()).toMatchObject({
      formFactor: "tablet",
      os: "android",
      prefersReducedMotion: true,
      runtime: "web",
      safeAreaInsets: { bottom: 4, left: 3, right: 2, top: 1 },
    });
    expect(await adapter.links.getLaunchUrl()).toBe(
      "https://app.example.test/start?source=launch#top",
    );
    expect(
      await inspectDeviceAdapterConformance({
        adapter,
        emitLifecycle: environment.emitLifecycle,
        emitLink: environment.emitLink,
        emitNetwork: environment.emitNetwork,
        storage: true,
      }),
    ).toEqual([]);
  });

  test("allows only audited external URL protocols", async () => {
    const environment = installWebEnvironment();
    const adapter = createWebDeviceAdapter();
    await adapter.links.openExternal("https://example.com/path");
    expect(environment.opened).toEqual(["https://example.com/path"]);
    await expect(
      adapter.links.openExternal("javascript:alert(1)"),
    ).rejects.toBeInstanceOf(DeviceError);
  });

  test("uses standards-based clipboard, share, and vibration fallbacks", async () => {
    const environment = installWebEnvironment();
    const adapter = createWebDeviceAdapter();

    await adapter.clipboard?.writeText("copied");
    expect(await adapter.clipboard?.readText()).toBe("copied");
    expect(await adapter.clipboard?.capability("read")).toMatchObject({
      available: true,
      fidelity: "web",
    });
    await adapter.share?.share({
      text: "Portable",
      url: "https://absolutejs.com/path",
    });
    await adapter.haptics?.impact("heavy");
    expect(environment.shared).toEqual([
      { text: "Portable", url: "https://absolutejs.com/path" },
    ]);
    expect(environment.vibrations).toEqual([24]);
  });

  test("uses item-scoped browser capture and photo selection", async () => {
    const environment = installWebEnvironment();
    const adapter = createWebDeviceAdapter();

    expect(await adapter.camera?.requestPermission()).toEqual({
      canRequest: false,
      state: "granted",
    });
    expect(
      await adapter.camera?.takePhoto({ direction: "front" }),
    ).toMatchObject({
      format: "jpeg",
      name: "photo.jpg",
      webPath: "blob:absolute-photo",
    });
    expect(environment.captures).toEqual(["user"]);
    expect(await adapter.photos?.pick({ limit: 1 })).toHaveLength(1);
  });

  test("picks and exports bounded documents without exposing paths", async () => {
    const environment = installWebEnvironment();
    const adapter = createWebDeviceAdapter();

    const picked = await adapter.documents?.pick({
      accept: ["image/jpeg", ".pdf"],
      limit: 1,
    });
    expect(picked?.[0]).toMatchObject({
      mimeType: "image/jpeg",
      name: "photo.jpg",
      sizeBytes: 5,
    });
    expect(picked?.[0]?.blob).toBeInstanceOf(Blob);
    expect(picked?.[0]).not.toHaveProperty("path");

    await adapter.documents?.export({
      content: "portable",
      name: "report.txt",
    });
    expect(environment.downloads).toEqual([
      { name: "report.txt", url: "blob:absolute-photo" },
    ]);
    await expect(
      adapter.documents?.export({
        content: "large",
        maximumBytes: 2,
        name: "x.txt",
      }),
    ).rejects.toMatchObject({ code: "failed" });
    await expect(
      adapter.documents?.export({ content: "unsafe", name: "../x.txt" }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  test("requests browser location explicitly and disposes watches", async () => {
    const environment = installWebEnvironment();
    const adapter = createWebDeviceAdapter();

    expect(await adapter.location?.queryPermission()).toMatchObject({
      canRequest: true,
      precision: "unknown",
      state: "prompt",
    });
    expect(await adapter.location?.requestPermission()).toMatchObject({
      state: "granted",
    });
    expect(
      await adapter.location?.current({
        accuracy: "high",
        maximumAgeMs: 1_000,
        timeoutMs: 5_000,
      }),
    ).toMatchObject({
      accuracyMeters: 4,
      latitude: 40.7128,
      longitude: -74.006,
      timestampMs: 1_777_000_000_000,
    });

    const updates: number[] = [];
    const remove = await adapter.location?.watch((event) => {
      if (event.type === "position") updates.push(event.position.longitude);
    });
    environment.emitLocation();
    expect(updates).toEqual([-74.006]);
    await remove?.();
    environment.emitLocation();
    expect(updates).toEqual([-74.006]);
    expect(environment.locationOptions).toContainEqual({
      enableHighAccuracy: true,
      maximumAge: 1_000,
      timeout: 5_000,
    });
  });

  test("keeps browser notification permission explicit and reports emulated durability", async () => {
    const environment = installWebEnvironment();
    const adapter = createWebDeviceAdapter();

    expect(await adapter.localNotifications?.capability()).toMatchObject({
      available: true,
      fidelity: "emulated",
      native: { durableScheduling: false },
    });
    await expect(
      adapter.localNotifications?.schedule({
        body: "Ready",
        id: 9,
        title: "Report",
      }),
    ).rejects.toMatchObject({ code: "permission-required" });
    expect(environment.notificationPermissionRequests).toBe(0);
    await adapter.localNotifications?.requestPermission();
    expect(environment.notificationPermissionRequests).toBe(1);

    const actions: number[] = [];
    await adapter.localNotifications?.onAction((action) =>
      actions.push(action.notification.id),
    );
    await adapter.localNotifications?.schedule({
      body: "Ready",
      id: 9,
      title: "Report",
    });
    environment.notifications[0]?.onclick?.();
    expect(environment.notifications[0]).toMatchObject({
      body: "Ready",
      tag: "absolutejs:9",
      title: "Report",
    });
    expect(actions).toEqual([9]);

    await adapter.localNotifications?.schedule({
      body: "Later",
      id: 10,
      scheduledAtMs: Date.now() + 10_000,
      title: "Reminder",
    });
    expect(await adapter.localNotifications?.pending()).toHaveLength(1);
    await adapter.localNotifications?.cancel([10]);
    expect(await adapter.localNotifications?.pending()).toEqual([]);
  });
});
