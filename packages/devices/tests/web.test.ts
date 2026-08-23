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
  let href = "https://app.example.test/start?source=launch#top";
  let online = true;
  let visibilityState: DocumentVisibilityState = "visible";
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
    createElement: () => ({
      remove: () => undefined,
      style: { cssText: "" },
    }),
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
    connection: { type: "wifi" },
    language: "en-US",
    get onLine() {
      return online;
    },
    userAgent: "AbsoluteJS Android Test",
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
    "removeEventListener",
    globalEvents.removeEventListener.bind(globalEvents),
  );
  replaceGlobal("window", {
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
    emitNetwork: (status: { connected: boolean }) => {
      online = status.connected;
      globalEvents.dispatchEvent(
        new Event(status.connected ? "online" : "offline"),
      );
    },
    opened,
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
});
