import { describe, expect, test } from "bun:test";
import { DeviceError } from "../src/contracts";
import { createSsrDeviceAdapter } from "../src/adapters/ssr";

describe("SSR adapter", () => {
  test("is import-safe and reports unavailable effects", async () => {
    const adapter = createSsrDeviceAdapter();
    expect(await adapter.platform.getInfo()).toMatchObject({
      runtime: "ssr",
      isNative: false,
    });
    expect(await adapter.storage.get("missing")).toBeNull();
    try {
      await adapter.links.openExternal("https://example.com");
      throw new Error("Expected openExternal to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(DeviceError);
      expect((error as DeviceError).code).toBe("unavailable");
    }
  });
});
