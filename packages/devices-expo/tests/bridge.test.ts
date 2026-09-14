import { describe, expect, test } from "bun:test";
import { createTestDeviceAdapter } from "@absolutejs/devices/testing";
import {
  createExpoDevicesBridgeHost,
  createExpoWebViewDeviceAdapter,
  type ExpoDevicesBridgeEvent,
} from "../src/bridge";

const harness = async () => {
  const controller = createTestDeviceAdapter();
  const listeners = new Map<string, Set<(payload: Record<string, unknown>) => void>>();
  const emit: ExpoDevicesBridgeEvent = (event, payload) => {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  };
  const host = await createExpoDevicesBridgeHost(controller.adapter, emit);
  const transport = {
    on(event: string, listener: (payload: Record<string, unknown>) => void) {
      const selected = listeners.get(event) ?? new Set();
      selected.add(listener);
      listeners.set(event, selected);
      return () => {
        selected.delete(listener);
      };
    },
    request: host.request,
  };
  return {
    adapter: createExpoWebViewDeviceAdapter(transport, [
      "clipboard", "documents", "haptics", "keyboard", "location", "photos",
    ]),
    controller,
    host,
  };
};

describe("Expo devices WebView bridge", () => {
  test("tolerates a native listener that has no disposer", async () => {
    const controller = createTestDeviceAdapter();
    controller.adapter.lifecycle.onResume = async () => undefined as never;
    const host = await createExpoDevicesBridgeHost(controller.adapter, () => {});

    await expect(host.close()).resolves.toBeUndefined();
  });

  test("provides the same storage, clipboard, lifecycle, and location contracts", async () => {
    const { adapter, controller, host } = await harness();
    await adapter.storage.set("theme", "dark");
    expect(await adapter.storage.get("theme")).toBe("dark");
    await adapter.clipboard!.writeText("portable");
    expect(await adapter.clipboard!.readText()).toBe("portable");
    const states: string[] = [];
    const stop = await adapter.lifecycle.onChange((state) => states.push(state));
    controller.emitLifecycle("background");
    expect(states).toEqual(["background"]);
    await stop();
    const positions: number[] = [];
    const stopLocation = await adapter.location!.watch((event) => {
      if (event.type === "position") positions.push(event.position.latitude);
    });
    controller.emitLocation();
    expect(positions).toEqual([40.7128]);
    await stopLocation();
    await host.close();
  });

  test("moves documents in bounded chunks in both directions", async () => {
    const { adapter, controller, host } = await harness();
    const content = "absolute".repeat(20_000);
    const result = await adapter.documents!.export({
      content,
      mimeType: "text/plain",
      name: "large.txt",
    });
    expect(result).toMatchObject({ name: "large.txt", sizeBytes: content.length });
    const exported = controller.exportedDocuments.at(-1)!;
    expect(await (exported.content as Blob).text()).toBe(content);
    const [picked] = await adapter.documents!.pick();
    expect(await picked!.blob.text()).toBe("test document");
    await host.close();
  });

  test("replays a restored Android photo picker result once through bounded transfers", async () => {
    const { adapter, controller, host } = await harness();
    controller.emitRestoredOperation({
      data: [
        {
          ...controller.pickedPhotos[0],
          webPath: "data:text/plain,test%20photo",
        },
      ],
      method: "pick",
      native: { secret: "must-not-cross" },
      plugin: "expo-image-picker",
      success: true,
    });
    await Bun.sleep(0);

    const restored: unknown[] = [];
    const stop = await adapter.lifecycle.onRestoredOperation!((operation) =>
      restored.push(operation),
    );
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      method: "pick",
      plugin: "expo-image-picker",
      success: true,
    });
    expect(restored[0]).not.toHaveProperty("native");
    const [picked] = (restored[0] as { data: Array<{ webPath: string }> }).data;
    expect(await (await fetch(picked!.webPath)).text()).toBe("test photo");

    await Bun.sleep(0);
    expect(restored).toHaveLength(1);
    await stop();
    await host.close();
  });

  test("bridges a restored camera result without exposing its native path", async () => {
    const { adapter, controller, host } = await harness();
    const restored: unknown[] = [];
    const stop = await adapter.lifecycle.onRestoredOperation!((operation) =>
      restored.push(operation),
    );
    controller.emitRestoredOperation({
      data: {
        ...controller.pickedPhotos[0],
        uri: "file:///private/camera.jpg",
        webPath: "data:text/plain,camera%20photo",
      },
      method: "takePhoto",
      plugin: "expo-image-picker",
      success: true,
    });
    await Bun.sleep(0);

    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      method: "takePhoto",
      plugin: "expo-image-picker",
      success: true,
    });
    const photo = (restored[0] as { data: { uri: string; webPath: string } }).data;
    expect(photo.uri).toStartWith("blob:");
    expect(photo.uri).not.toContain("/private/");
    expect(await (await fetch(photo.webPath)).text()).toBe("camera photo");
    await stop();
    await host.close();
  });

  test("strips native-only values and rejects methods outside the allowlist", async () => {
    const controller = createTestDeviceAdapter();
    controller.adapter.platform.getInfo = async () => ({
      formFactor: "phone",
      isNative: true,
      os: "ios",
      runtime: "expo",
      native: { secret: "never-cross-the-bridge" },
    });
    const host = await createExpoDevicesBridgeHost(controller.adapter, () => {});
    expect(await host.request("devices.platform.getInfo", {})).toEqual({
      formFactor: "phone",
      isNative: true,
      os: "ios",
      runtime: "expo",
    });
    await expect(host.request("devices.arbitrary.execute", {})).rejects.toMatchObject({
      code: "unsupported",
    });
    await host.request("devices.upload.begin", { name: "one.txt", size: 0 });
    await host.request("devices.upload.begin", { name: "two.txt", size: 0 });
    await expect(
      host.request("devices.upload.begin", { name: "three.txt", size: 0 }),
    ).rejects.toMatchObject({ code: "unavailable" });
    await host.close();
  });
});
