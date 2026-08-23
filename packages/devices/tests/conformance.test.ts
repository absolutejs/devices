import { describe, expect, test } from "bun:test";
import {
  assertDeviceAdapterConformance,
  createTestDeviceAdapter,
  inspectDeviceAdapterConformance,
} from "../src/testing";

describe("device adapter conformance", () => {
  test("accepts the deterministic test adapter", async () => {
    const device = createTestDeviceAdapter();
    const harness = {
      adapter: device.adapter,
      emitBack: device.emitBack,
      emitLifecycle: device.emitLifecycle,
      emitLink: device.emitLink,
      emitNetwork: device.emitNetwork,
      emitRestoredOperation: device.emitRestoredOperation,
      storage: true,
    };
    expect(await inspectDeviceAdapterConformance(harness)).toEqual([]);
    await expect(
      assertDeviceAdapterConformance(harness),
    ).resolves.toBeUndefined();
  });

  test("reports an adapter whose declared runtime disagrees with platform info", async () => {
    const device = createTestDeviceAdapter({
      platform: { runtime: "web" },
    });
    expect(
      await inspectDeviceAdapterConformance({
        adapter: device.adapter,
        emitLifecycle: device.emitLifecycle,
        emitLink: device.emitLink,
        emitNetwork: device.emitNetwork,
      }),
    ).toContain("platform runtime must match adapter runtime");
  });
});
