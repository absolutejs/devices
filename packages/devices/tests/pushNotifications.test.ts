import { describe, expect, test } from "bun:test";
import {
  availableCapability,
  pushNotifications,
  type DeviceAdapter,
} from "../src";
import { createSsrDeviceAdapter } from "../src/adapters/ssr";
import { installDeviceAdapter } from "../src/runtime";
import { createTestDeviceAdapter } from "../src/testing";

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

  test("the test adapter enables push through the facade and delivers events", async () => {
    const device = createTestDeviceAdapter();
    const remove = installDeviceAdapter(device.adapter);
    try {
      const received: string[] = [];
      const actions: string[] = [];
      const stopReceived = await pushNotifications.onReceived((notification) =>
        received.push(notification.title ?? notification.id),
      );
      await pushNotifications.onAction((action) =>
        actions.push(`${action.actionId}:${action.notification.id}`),
      );

      expect(() => device.emitPushReceived()).toThrow("not enabled");
      await pushNotifications.enable();
      expect(device.notificationPermission.requests).toBe(1);
      expect(device.pushEnabled).toBe(true);

      device.emitPushReceived({ title: "Order shipped" });
      device.emitPushAction({ data: { orderId: "42" }, id: "order-42" });
      await stopReceived();
      device.emitPushReceived({ title: "Not delivered" });

      expect(received).toEqual(["Order shipped"]);
      expect(actions).toEqual(["tap:order-42"]);

      await pushNotifications.disable();
      expect(device.pushEnabled).toBe(false);
      expect(device.pushEvents).toEqual(["enable", "disable"]);
    } finally {
      remove();
    }
  });

  test("the test adapter refuses to enable push after denied permission", async () => {
    const device = createTestDeviceAdapter();
    device.notificationPermission.setStatus({
      canRequest: false,
      state: "denied",
    });
    const remove = installDeviceAdapter(device.adapter);
    try {
      await expect(pushNotifications.enable()).rejects.toMatchObject({
        code: "permission-denied",
      });
      expect(device.pushEnabled).toBe(false);
      expect(device.pushEvents).toEqual([]);
    } finally {
      remove();
    }
  });
});
