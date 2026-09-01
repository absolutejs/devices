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
      "clipboard", "documents", "haptics", "keyboard", "location",
    ]),
    controller,
    host,
  };
};

describe("Expo devices WebView bridge", () => {
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
