import { describe, expect, test } from "bun:test";
import {
  availableCapability,
  pushNotifications,
  type DeviceAdapter,
} from "../src";
import { createSsrDeviceAdapter } from "../src/adapters/ssr";
import { installDeviceAdapter } from "../src/runtime";

describe("portable push notifications facade", () => {
  test("requests permission explicitly and never returns registration credentials", async () => {
    let requests = 0;
    let enabled = 0;
    const adapter: DeviceAdapter = {
      ...createSsrDeviceAdapter(),
      runtime: "test",
      pushNotifications: {
        capability: async () => availableCapability("emulated"),
        disable: async () => undefined,
        enable: async () => {
          enabled += 1;
        },
        onAction: async () => () => undefined,
        onReceived: async () => () => undefined,
        queryPermission: async () => ({ canRequest: true, state: "prompt" }),
        requestPermission: async () => {
          requests += 1;
          return { canRequest: false, state: "granted" };
        },
      },
    };
    const remove = installDeviceAdapter(adapter);
    try {
      expect(await pushNotifications.enable()).toBeUndefined();
      expect({ enabled, requests }).toEqual({ enabled: 1, requests: 1 });
    } finally {
      remove();
    }
  });

  test("does not register after denied permission", async () => {
    let enabled = false;
    const adapter: DeviceAdapter = {
      ...createSsrDeviceAdapter(),
      runtime: "test",
      pushNotifications: {
        capability: async () => availableCapability("emulated"),
        disable: async () => undefined,
        enable: async () => {
          enabled = true;
        },
        onAction: async () => () => undefined,
        onReceived: async () => () => undefined,
        queryPermission: async () => ({ canRequest: true, state: "prompt" }),
        requestPermission: async () => ({
          canRequest: false,
          state: "denied",
        }),
      },
    };
    const remove = installDeviceAdapter(adapter);
    try {
      await expect(pushNotifications.enable()).rejects.toMatchObject({
        code: "permission-denied",
      });
      expect(enabled).toBe(false);
    } finally {
      remove();
    }
  });
});
